import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth.service';
import { KanbanComponent } from './kanban.component';

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
    TestBed.inject(MatDialog).closeAll();
    http.verify();
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
