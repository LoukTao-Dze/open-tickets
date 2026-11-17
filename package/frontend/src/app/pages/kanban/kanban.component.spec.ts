import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { MatDialog, MatDialogRef, MatDialogState } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { KanbanColumn, KanbanTicket } from '../../interface/kanban.interface';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { firstValueFrom, of } from 'rxjs';
import { KanbanComponent } from './kanban.component';
import {
  LaneFormModalComponent,
  LaneFormModalResult,
} from './lane-form-modal/lane-form-modal.component';
import {
  LaneOrderItem,
  LaneOrderModalComponent,
} from './lane-order-modal/lane-order-modal.component';

describe('KanbanComponent linked card', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [KanbanComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ ticket: 'DS1' }) } },
        },
        { provide: AuthService, useValue: { cachedSession: { user: { role: 'user' } } } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.inject(MatDialog).closeAll();
    http.verify();
  });

  function loadLane(tickets: KanbanTicket[] = []) {
    const fixture = TestBed.createComponent(KanbanComponent);
    fixture.detectChanges();
    const lane: KanbanColumn = {
      id: 'todo',
      name: 'To Do',
      color: '#123abc',
      count: tickets.length,
      status: 'active',
      tickets,
    };
    http.expectOne(`${environment.apiBaseUrl}/api/kanban/board`).flush({ data: [lane] });
    http.expectOne(`${environment.apiBaseUrl}/api/projects/get-projects`).flush({ data: [] });
    return fixture;
  }

  function laneDialog(): MatDialogRef<LaneFormModalComponent, LaneFormModalResult> {
    return TestBed.inject(MatDialog).openDialogs[0];
  }

  it('opens lane creation in a modal and cancels without changing the board', async () => {
    const fixture = loadLane();
    const component = fixture.componentInstance;
    fixture.nativeElement.querySelector('.lane-add').click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.lane-editor')).toBeNull();
    const modal = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(modal.querySelector('h2')?.textContent).toBe('Add lane');
    expect(modal.getAttribute('aria-labelledby')).toBe('lane-dialog-title');
    const dialogRef = laneDialog();
    expect(dialogRef.componentInstance).toBeInstanceOf(LaneFormModalComponent);
    dialogRef.componentInstance.columnForm.setValue({ name: 'Unsaved lane', color: '#aabbcc' });
    const closed = firstValueFrom(dialogRef.afterClosed());
    modal.querySelector<HTMLButtonElement>('.lane-cancel')!.click();
    await closed;

    expect(dialogRef.getState()).toBe(MatDialogState.CLOSED);
    expect(component.columns).toHaveLength(1);
    http.expectNone((request) => request.url.includes('/columns'));
  });

  it('closes its lane modal when leaving the board', () => {
    const fixture = loadLane();
    fixture.componentInstance.editColumn();
    const close = vi.spyOn(TestBed.inject(MatDialog).openDialogs[0], 'close');
    fixture.destroy();
    expect(close).toHaveBeenCalled();
  });

  it('creates a lane with its selected color and appends the saved lane', async () => {
    const fixture = loadLane();
    const component = fixture.componentInstance;
    component.editColumn();
    const dialogRef = laneDialog();
    const closed = firstValueFrom(dialogRef.afterClosed());
    dialogRef.componentInstance.columnForm.setValue({ name: '  Review  ', color: '#aabbcc' });
    dialogRef.componentInstance.saveColumn();
    const request = http.expectOne(`${environment.apiBaseUrl}/api/kanban/columns`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ name: 'Review', color: '#aabbcc' });
    request.flush({
      data: {
        id: 'custom-lane',
        name: 'Review',
        color: '#aabbcc',
        status: 'active',
        count: 0,
        tickets: [],
      },
    });
    await closed;
    expect(component.columns.map((column) => column.id)).toEqual(['todo', 'custom-lane']);
    expect(component.columns[1].color).toBe('#aabbcc');
    expect(component.isLoading).toBe(false);
    expect(dialogRef.getState()).toBe(MatDialogState.CLOSED);
  });

  it('saves the dragged lane order and then reloads the board', async () => {
    const fixture = loadLane();
    const component = fixture.componentInstance;
    const review = { ...component.columns[0], id: 'review', name: 'Review' };
    component.columns.push(review);
    component.openReorderLanes();
    const dialogRef = TestBed.inject(MatDialog).openDialogs[0] as MatDialogRef<
      LaneOrderModalComponent,
      boolean
    >;
    const modal = dialogRef.componentInstance;
    expect(modal.hasChanges).toBe(false);
    const list = { data: modal.lanes } as CdkDropList<LaneOrderItem[]>;
    modal.onLaneDropped({
      previousContainer: list,
      container: list,
      previousIndex: 1,
      currentIndex: 0,
    } as CdkDragDrop<LaneOrderItem[]>);
    expect(modal.hasChanges).toBe(true);
    expect(component.columns.map((column) => column.id)).toEqual(['todo', 'review']);

    const closed = firstValueFrom(dialogRef.afterClosed());
    modal.saveOrder();
    const request = http.expectOne(`${environment.apiBaseUrl}/api/kanban/columns/order`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ columnIds: ['review', 'todo'] });
    request.flush({ data: { columnIds: ['review', 'todo'] } });
    await closed;

    http
      .expectOne(`${environment.apiBaseUrl}/api/kanban/board`)
      .flush({ data: [review, component.columns[0]] });
    expect(component.columns.map((column) => column.id)).toEqual(['review', 'todo']);
  });

  it('keeps the new order in the dialog and skips the reload when saving fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const component = loadLane().componentInstance;
    component.columns.push({ ...component.columns[0], id: 'review', name: 'Review' });
    component.openReorderLanes();
    const dialogRef = TestBed.inject(MatDialog).openDialogs[0] as MatDialogRef<
      LaneOrderModalComponent,
      boolean
    >;
    const modal = dialogRef.componentInstance;
    modal.moveLane(1, -1);
    modal.saveOrder();
    http
      .expectOne(`${environment.apiBaseUrl}/api/kanban/columns/order`)
      .flush({}, { status: 500, statusText: 'Server error' });
    expect(modal.orderError).toContain('Could not save');
    expect(modal.lanes.map((lane) => lane.id)).toEqual(['review', 'todo']);
    expect(modal.isLoading).toBe(false);
    expect(dialogRef.getState()).toBe(MatDialogState.OPEN);
    http.expectNone(`${environment.apiBaseUrl}/api/kanban/board`);
  });

  it('does not offer lane ordering when there is nothing to reorder', () => {
    const component = loadLane().componentInstance;
    component.openReorderLanes();
    expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0);
  });

  it('edits lane name and color without dropping its cards', async () => {
    const fixture = loadLane();
    const component = fixture.componentInstance;
    const lane = component.columns[0];
    const tickets = lane.tickets;
    component.editColumn(lane);
    const dialogRef = laneDialog();
    const closed = firstValueFrom(dialogRef.afterClosed());
    dialogRef.componentInstance.columnForm.setValue({ name: 'Updated', color: '#aabbcc' });
    dialogRef.componentInstance.saveColumn();
    const request = http.expectOne(`${environment.apiBaseUrl}/api/kanban/columns/todo`);
    expect(request.request.method).toBe('PUT');
    request.flush({ data: { ...lane, name: 'Updated', color: '#aabbcc', tickets: [] } });
    await closed;
    expect(lane.name).toBe('Updated');
    expect(lane.color).toBe('#aabbcc');
    expect(lane.tickets).toBe(tickets);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.column-dot').style.backgroundColor).toBe(
      'rgb(170, 187, 204)',
    );
  });

  it('accepts a typed hex color, syncs the swatch and blocks invalid values', () => {
    const fixture = loadLane();
    fixture.componentInstance.editColumn();
    fixture.detectChanges();
    const modal = laneDialog().componentInstance;
    modal.columnForm.controls.name.setValue('Review');
    const hexInput = document.querySelector<HTMLInputElement>('.lane-color-hex')!;
    const swatch = document.querySelector<HTMLInputElement>('.lane-color-swatch')!;
    const type = (value: string) => {
      hexInput.value = value;
      hexInput.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };

    type('#aabbcc');
    expect(modal.columnForm.controls.color.value).toBe('#aabbcc');
    expect(swatch.value).toBe('#aabbcc');

    type('#aab');
    expect(swatch.value).toBe('#aabbcc');
    modal.saveColumn();
    expect(modal.columnForm.controls.color.invalid).toBe(true);
    http.expectNone(`${environment.apiBaseUrl}/api/kanban/columns`);
  });

  it('keeps unsaved input and shows a save error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const component = loadLane().componentInstance;
    component.editColumn();
    const dialogRef = laneDialog();
    const modal = dialogRef.componentInstance;
    modal.columnForm.setValue({ name: 'Draft', color: '#123abc' });
    modal.saveColumn();
    expect(dialogRef.disableClose).toBe(true);
    http
      .expectOne(`${environment.apiBaseUrl}/api/kanban/columns`)
      .flush({}, { status: 500, statusText: 'Server error' });
    expect(modal.columnForm.controls.name.value).toBe('Draft');
    expect(dialogRef.getState()).toBe(MatDialogState.OPEN);
    expect(modal.columnError).toContain('Could not save');
    expect(component.columns).toHaveLength(1);
    expect(modal.isLoading).toBe(false);
    expect(dialogRef.disableClose).toBe(false);
  });

  it('rejects whitespace-only names without sending a request', () => {
    const component = loadLane().componentInstance;
    component.editColumn();
    const modal = laneDialog().componentInstance;
    modal.columnForm.setValue({ name: '   ', color: '#123abc' });
    modal.saveColumn();
    expect(modal.columnForm.controls.name.invalid).toBe(true);
    expect(modal.columnForm.controls.name.touched).toBe(true);
    http.expectNone(`${environment.apiBaseUrl}/api/kanban/columns`);
  });

  it('does not allow deleting a lane containing cards hidden by the project filter', () => {
    const ticket: KanbanTicket = {
      id: 'other-card',
      columnId: 'todo',
      title: 'Card',
      priority: 'Low',
      project: { id: 'other-project', project_name: 'Other' },
      meta: [],
      assigneeAlt: '',
      assigneeAvatarUrl: '',
    };
    const fixture = loadLane([ticket]);
    const component = fixture.componentInstance;
    component.selectedProject = 'selected-project';
    const lane = component.columns[0];
    expect(component.visibleTickets(lane)).toHaveLength(0);
    component.editColumn(lane);
    fixture.detectChanges();
    expect(document.querySelector<HTMLButtonElement>('.lane-delete')?.disabled).toBe(true);
    const modal = laneDialog().componentInstance;
    modal.deleteColumn(lane);
    expect(modal.columnError).toContain('Move or delete all cards');
    http.expectNone(`${environment.apiBaseUrl}/api/kanban/columns/todo`);
  });

  it('deletes an empty lane only after confirmation', async () => {
    vi.spyOn(TestBed.inject(ConfirmDialogService), 'confirm').mockReturnValue(of(true));
    const component = loadLane().componentInstance;
    component.editColumn(component.columns[0]);
    const dialogRef = laneDialog();
    const closed = firstValueFrom(dialogRef.afterClosed());
    dialogRef.componentInstance.deleteColumn(component.columns[0]);
    const request = http.expectOne(`${environment.apiBaseUrl}/api/kanban/columns/todo`);
    expect(request.request.method).toBe('DELETE');
    expect(component.columns).toHaveLength(1);
    request.flush({ data: { id: 'todo' } });
    await closed;
    expect(component.columns).toHaveLength(0);
    expect(component.isLoading).toBe(false);
    expect(dialogRef.getState()).toBe(MatDialogState.CLOSED);
  });

  it('handles the real confirmation dialog lifecycle before deleting the lane', async () => {
    const fixture = loadLane();
    const component = fixture.componentInstance;
    component.editColumn(component.columns[0]);
    const dialogRef = laneDialog();
    const closed = firstValueFrom(dialogRef.afterClosed());
    dialogRef.componentInstance.deleteColumn(component.columns[0]);
    const dialogs = TestBed.inject(MatDialog).openDialogs;
    expect(dialogs).toHaveLength(2);
    const confirmation = dialogs[1];
    const confirmed = firstValueFrom(confirmation.afterClosed());
    confirmation.close(true);
    await confirmed;

    http
      .expectOne(`${environment.apiBaseUrl}/api/kanban/columns/todo`)
      .flush({ data: { id: 'todo' } });
    await closed;
    await fixture.whenStable();
    expect(component.columns).toHaveLength(0);
    expect(dialogRef.getState()).toBe(MatDialogState.CLOSED);
    expect(component.isLoading).toBe(false);
  });

  it('keeps a lane when a concurrent or invisible card blocks deletion', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(TestBed.inject(ConfirmDialogService), 'confirm').mockReturnValue(of(true));
    const component = loadLane().componentInstance;
    component.editColumn(component.columns[0]);
    const dialogRef = laneDialog();
    const modal = dialogRef.componentInstance;
    modal.deleteColumn(component.columns[0]);
    http
      .expectOne(`${environment.apiBaseUrl}/api/kanban/columns/todo`)
      .flush({}, { status: 409, statusText: 'Conflict' });
    expect(component.columns).toHaveLength(1);
    expect(modal.columnError).toContain('another project');
    expect(modal.isLoading).toBe(false);
    expect(dialogRef.getState()).toBe(MatDialogState.OPEN);
  });

  it('does not send lane mutations for read-only users', () => {
    const fixture = loadLane();
    const component = fixture.componentInstance;
    component.isReadOnly = true;
    component.editColumn();
    fixture.detectChanges();
    expect(TestBed.inject(MatDialog).openDialogs).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('.column-menu')).toBeNull();
    http.expectNone((request) => request.url.includes('/columns'));
  });

  it('opens the linked card after both board and projects load', () => {
    const fixture = TestBed.createComponent(KanbanComponent);
    const dialog = TestBed.inject(MatDialog);
    fixture.detectChanges();
    const ticket = {
      id: 'DS1',
      title: 'Card',
      project: { id: 'project-1', project_name: 'Project' },
      priority: 'Low',
      meta: [],
      assigneeAlt: '',
      columnId: 'todo',
    };
    http.expectOne(`${environment.apiBaseUrl}/api/kanban/board`).flush({
      data: [{ id: 'todo', tickets: [ticket] }],
    });
    expect(dialog.openDialogs).toHaveLength(0);
    http.expectOne(`${environment.apiBaseUrl}/api/projects/get-projects`).flush({
      data: [{ id: 'project-1', project_name: 'Project' }],
    });
    expect(dialog.openDialogs).toHaveLength(1);
    expect(dialog.openDialogs[0].componentInstance.form.get('title')?.value).toBe('Card');
    expect(fixture.componentInstance.selectedProject).toBe('project-1');
  });

  it('reports an unavailable card rather than opening a different one', () => {
    const fixture = TestBed.createComponent(KanbanComponent);
    const open = vi
      .spyOn(fixture.componentInstance, 'openEditTicketModal')
      .mockImplementation(() => {});
    fixture.detectChanges();
    http.expectOne(`${environment.apiBaseUrl}/api/projects/get-projects`).flush({ data: [] });
    http.expectOne(`${environment.apiBaseUrl}/api/kanban/board`).flush({ data: [] });
    expect(open).not.toHaveBeenCalled();
    expect(fixture.componentInstance.linkError).toContain('not available');
  });
});
