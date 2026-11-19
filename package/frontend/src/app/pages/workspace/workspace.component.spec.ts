import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EditorView } from '@codemirror/view';
import { of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { EnumWorkspaceItemType } from '../../enum/workspace.enum';
import { WorkspaceCanvasItem } from '../../interface/workspace.interface';
import { AuthService } from '../../services/auth.service';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { STICKY_NOTE_COLOR_OPTIONS } from '../../shared/sticky-note-colors';
import { WorkspaceComponent } from './workspace.component';

const CANVAS_URL = `${environment.apiBaseUrl}/api/canvas`;
const GROUP = { id: 7, name: 'Group-7', project_id: 'p1', color: '#414752' };

function textItem(id: number, x: number, y: number): WorkspaceCanvasItem {
  return {
    id,
    projectId: 'p1',
    type: EnumWorkspaceItemType.TEXT,
    x,
    y,
    zIndex: 1,
    width: 50,
    height: 50,
    content: '',
    fontSize: 20,
    color: '#ffffff',
  };
}

function pointer(type: string, x: number, y: number): PointerEvent {
  return new MouseEvent(type, { clientX: x, clientY: y, button: 0 }) as PointerEvent;
}

describe('Workspace selection', () => {
  let fixture: ComponentFixture<WorkspaceComponent>;
  let component: WorkspaceComponent;
  let http: HttpTestingController;
  const confirm = vi.fn(() => of(true));

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WorkspaceComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { cachedSession: { user: { role: 'admin' } } } },
        { provide: ConfirmDialogService, useValue: { confirm } },
      ],
    }).compileComponents();
    localStorage.clear();
    confirm.mockReturnValue(of(true));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(WorkspaceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    http.expectOne(`${environment.apiBaseUrl}/api/projects`).flush({
      data: [{ id: 'p1', name: 'Board', default: true }],
    });
    http.expectOne(`${CANVAS_URL}/get-canvas-item?projectId=p1`).flush({ data: [] });
    http.expectOne(`${CANVAS_URL}/groups?projectId=p1`).flush({ data: [], canEdit: true });
    vi.spyOn(component.viewportRef.nativeElement, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(40, 60, 800, 600),
    );
    component.zoom = 0.5;
    component.panX = 20;
    component.panY = -10;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function selectTool() {
    const button: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[aria-label="Selection"]',
    );
    button.click();
    fixture.detectChanges();
  }

  it.each([
    [EnumWorkspaceItemType.STICKY_NOTE, '.sticky-note-label', 'label'],
    [EnumWorkspaceItemType.STICKY_NOTE, '.sticky-note-content', 'content'],
    [EnumWorkspaceItemType.TEXT, '.text-item', 'content'],
    [EnumWorkspaceItemType.LINK, '.link-input', 'title'],
    [EnumWorkspaceItemType.LINK, '.link-input--url', 'url'],
    [EnumWorkspaceItemType.MARKDOWN, '.markdown-source', 'content'],
    [EnumWorkspaceItemType.CODE_SNIPPET, '.code-snippet-filename-input', 'fileName'],
    [EnumWorkspaceItemType.CODE_SNIPPET, '.cm-content', 'code'],
  ] as const)('saves %s %s immediately on focusout without pointer interaction', async (type, selector, field) => {
    vi.useFakeTimers();
    component.onInsertItem({ type, color: STICKY_NOTE_COLOR_OPTIONS[0] });
    vi.advanceTimersByTime(500);
    http.expectOne(`${CANVAS_URL}/save-canvas-item`).flush({ data: { id: 1 } });
    await vi.waitFor(() => expect(component.isCanvasLoading).toBe(false));
    fixture.detectChanges();
    const item = component.canvasList[0];
    if (type === EnumWorkspaceItemType.LINK || type === EnumWorkspaceItemType.MARKDOWN) {
      const preview: HTMLElement = fixture.nativeElement.querySelector(
        type === EnumWorkspaceItemType.LINK ? '.link-card' : '.markdown-preview',
      );
      preview.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      fixture.detectChanges();
      await Promise.resolve();
    }
    const editor: HTMLElement = fixture.nativeElement.querySelector(selector);
    const value = 'Updated value';
    if (selector === '.cm-content') {
      const view = EditorView.findFromDOM(editor)!;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    } else {
      if (editor instanceof HTMLInputElement || editor instanceof HTMLTextAreaElement) {
        editor.value = value;
      } else {
        editor.textContent = value;
      }
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
    http.expectNone(`${CANVAS_URL}/save-canvas-item`);
    editor.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    const request = http.expectOne(`${CANVAS_URL}/save-canvas-item`);
    expect(request.request.body).toMatchObject({ id: 1, type, [field]: value });
    request.flush({ data: { id: 1 } });
    await vi.waitFor(() => expect(component.isCanvasLoading).toBe(false));
    expect(component.canvasList[0]).toBe(item);
  });

  it('saves the blurred item rather than the newly selected item and cancels its delayed save', async () => {
    vi.useFakeTimers();
    component.onInsertItem({ type: EnumWorkspaceItemType.TEXT });
    const editedItem = component.canvasList[0];
    const otherItem = textItem(2, 100, 100);
    component.activeWhiteboard.items.push(otherItem);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const editor: HTMLTextAreaElement = fixture.nativeElement.querySelector('.text-item');
    editor.value = 'Last edit before switching';
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    component.focusedItem = otherItem;
    editor.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    const request = http.expectOne(`${CANVAS_URL}/save-canvas-item`);
    expect(request.request.body.content).toBe(editor.value);
    expect(request.request.body.id).toBeUndefined();
    request.flush({ data: { id: 3 } });
    await vi.waitFor(() => expect(editedItem.id).toBe(3));
    vi.advanceTimersByTime(500);
    http.expectNone(`${CANVAS_URL}/save-canvas-item`);
  });

  it('reports a failed blur save, retains edits, and does not persist read-only edits', async () => {
    const item = { ...textItem(1, 10, 20), content: 'Keep my edits' };
    component.activeWhiteboard.items = [item];
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const editor: HTMLTextAreaElement = fixture.nativeElement.querySelector('.text-item');
    editor.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    http
      .expectOne(`${CANVAS_URL}/save-canvas-item`)
      .flush({}, { status: 500, statusText: 'Server error' });
    await vi.waitFor(() => expect(component.actionError).toContain('Failed to save canvas item'));
    expect(item.content).toBe('Keep my edits');
    expect(component.isCanvasLoading).toBe(false);
    component.isReadOnly = true;
    editor.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    http.expectNone(`${CANVAS_URL}/save-canvas-item`);
  });

  it.each(['canvas', 'group'] as const)(
    'blurs and saves the editor when starting a %s selection',
    async (target) => {
      const item = { ...textItem(1, 10, 20), groupId: GROUP.id };
      component.activeWhiteboard.items = [item];
      component.groups = [GROUP];
      selectTool();
      const editor: HTMLTextAreaElement = fixture.nativeElement.querySelector('.text-item');
      editor.focus();
      editor.value = 'Saved on clicking away';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      expect(document.activeElement).toBe(editor);
      if (target === 'canvas') {
        component.onCanvasMouseDown(pointer('pointerdown', 60, 50));
      } else {
        component.onGroupMouseDown(pointer('pointerdown', 60, 50), GROUP);
      }
      expect(document.activeElement).not.toBe(editor);
      const request = http.expectOne(`${CANVAS_URL}/save-canvas-item`);
      expect(request.request.body.content).toBe(editor.value);
      request.flush({ data: { id: 1 } });
      await vi.waitFor(() => expect(component.isCanvasLoading).toBe(false));
      component.onDocumentMouseUp();
    },
  );

  it('uses the hand to pan and the tool hub to switch to selection', () => {
    component.onCanvasMouseDown(pointer('pointerdown', 60, 50));
    component.onDocumentMouseMove(pointer('pointermove', 80, 90));
    component.onDocumentMouseUp();
    expect([component.panX, component.panY]).toEqual([40, 30]);
    expect(component.selectedItems).toEqual([]);
    selectTool();
    expect(component.interactionTool).toBe(EnumWorkspaceItemType.SELECT);
  });

  it('selects only fully enclosed items when dragging backwards at a zoom and pan offset', () => {
    const enclosed = textItem(1, 10, 20);
    const partial = textItem(2, 380, 380);
    component.activeWhiteboard.items = [enclosed, partial];
    selectTool();
    component.onCanvasMouseDown(pointer('pointerdown', 260, 250));
    component.onDocumentMouseMove(pointer('pointermove', 60, 50));
    component.onDocumentMouseUp();
    expect(component.selectedItems).toEqual([enclosed]);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="toolbar"]').textContent).toContain(
      '1 selected',
    );
  });

  it('expands selected group members and cancels an interrupted marquee', () => {
    const first = { ...textItem(1, 10, 20), groupId: GROUP.id };
    const second = { ...textItem(2, 500, 500), groupId: GROUP.id };
    component.activeWhiteboard.items = [first, second];
    component.groups = [GROUP];
    selectTool();
    component.onCanvasMouseDown(pointer('pointerdown', 60, 50));
    component.onDocumentMouseMove(pointer('pointermove', 110, 100));
    expect(component.selectedItems).toEqual([first, second]);
    component.onDocumentMouseUp(pointer('pointercancel', 110, 100));
    expect(component.selectedItems).toEqual([]);
  });

  it('waits for new items to save before grouping and keeps the returned default name', async () => {
    const item = textItem(1, 10, 20);
    delete item.id;
    component.activeWhiteboard.items = [item];
    component.selectedItems = [item];
    const save = component.onSaveWhiteboard(item);
    const action = component.createGroup();
    http.expectNone(`${CANVAS_URL}/groups`);
    http.expectOne(`${CANVAS_URL}/save-canvas-item`).flush({ data: { id: 4 } });
    await save;
    await vi.waitFor(() => {
      const request = http.expectOne(`${CANVAS_URL}/groups`);
      expect(request.request.body).toEqual({
        projectId: 'p1',
        items: [{ id: 4, type: 'text' }],
        name: '',
      });
      request.flush({ data: GROUP });
    });
    await action;
    expect(item.groupId).toBe(GROUP.id);
    expect(component.groupFrames[0].group.name).toBe('Group-7');
  });

  it('moves and persists the whole group with one world-space delta', async () => {
    const first = { ...textItem(1, 10, 20), groupId: GROUP.id };
    const second = { ...textItem(2, 100, 120), groupId: GROUP.id };
    component.activeWhiteboard.items = [first, second];
    component.groups = [GROUP];
    selectTool();
    component.onGroupMouseDown(pointer('pointerdown', 60, 50), GROUP);
    component.onDocumentMouseMove(pointer('pointermove', 80, 80));
    expect([first.x, first.y, second.x, second.y]).toEqual([50, 80, 140, 180]);
    component.onDocumentMouseUp(pointer('pointerup', 80, 80));
    await vi.waitFor(() => {
      const request = http.expectOne(`${CANVAS_URL}/groups/move`);
      expect(request.request.body).toEqual({ projectId: 'p1', groupId: 7, dx: 40, dy: 60 });
      request.flush({});
    });
    await vi.waitFor(() => expect(component.isSelectionBusy).toBe(false));
    http.expectNone(`${CANVAS_URL}/save-canvas-item`);
  });

  it('restores group positions when the server rejects the move', async () => {
    const item = { ...textItem(1, 10, 20), groupId: GROUP.id };
    component.activeWhiteboard.items = [item];
    component.groups = [GROUP];
    selectTool();
    component.onGroupMouseDown(pointer('pointerdown', 60, 50), GROUP);
    component.onDocumentMouseMove(pointer('pointermove', 80, 80));
    component.onDocumentMouseUp();
    await vi.waitFor(() =>
      http
        .expectOne(`${CANVAS_URL}/groups/move`)
        .flush({}, { status: 500, statusText: 'Server error' }),
    );
    await vi.waitFor(() => expect(component.isSelectionBusy).toBe(false));
    expect([item.x, item.y]).toEqual([10, 20]);
    expect(component.actionError).toContain('Failed to move group');
  });

  it.each([
    [EnumWorkspaceItemType.HAND, '.group-frame'],
    [EnumWorkspaceItemType.HAND, '.canvas-item'],
    [EnumWorkspaceItemType.SELECT, '.group-frame'],
    [EnumWorkspaceItemType.SELECT, '.canvas-item'],
  ] as const)('persists dragging %s on %s without panning the board', async (tool, selector) => {
    const first = { ...textItem(1, 10, 20), groupId: GROUP.id };
    const second = { ...textItem(2, 100, 120), groupId: GROUP.id };
    component.activeWhiteboard.items = [first, second];
    component.groups = [GROUP];
    component.changeInteractionTool(tool);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();

    fixture.nativeElement
      .querySelector(selector)
      .dispatchEvent(pointer('pointerdown', 60, 50));
    document.dispatchEvent(pointer('pointermove', 80, 80));
    document.dispatchEvent(pointer('pointerup', 80, 80));

    await vi.waitFor(() => {
      const request = http.expectOne(`${CANVAS_URL}/groups/move`);
      expect(request.request.body).toEqual({ projectId: 'p1', groupId: 7, dx: 40, dy: 60 });
      request.flush({});
    });
    await vi.waitFor(() => expect(component.isSelectionBusy).toBe(false));
    expect([first.x, first.y, second.x, second.y]).toEqual([50, 80, 140, 180]);
    expect([component.panX, component.panY]).toEqual([20, -10]);
    http.expectNone(`${CANVAS_URL}/save-canvas-item`);
  });

  it('keeps grouped editors and controls out of group dragging', () => {
    const item = { ...textItem(1, 10, 20), groupId: GROUP.id };
    component.activeWhiteboard.items = [item];
    component.groups = [GROUP];
    selectTool();

    for (const selector of ['.text-item', '.item-delete-btn']) {
      fixture.nativeElement
        .querySelector(selector)
        .dispatchEvent(pointer('pointerdown', 60, 50));
      component.onDocumentMouseMove(pointer('pointermove', 60, 50));
      component.onDocumentMouseUp();
      expect(component.selectedItems).toEqual([]);
    }
    expect([item.x, item.y]).toEqual([10, 20]);
    http.expectNone(`${CANVAS_URL}/groups/move`);
  });

  it('does not save transient group-drag positions when a pending item save fires', async () => {
    vi.useFakeTimers();
    const item = { ...textItem(1, 10, 20), groupId: GROUP.id };
    component.activeWhiteboard.items = [item];
    component.groups = [GROUP];
    selectTool();
    const editor = document.createElement('textarea');
    editor.addEventListener('pointerdown', (event) =>
      component.onItemMouseDown(event as PointerEvent, item),
    );
    editor.dispatchEvent(pointer('pointerdown', 60, 50));
    component.onDocumentMouseUp();
    component.onGroupMouseDown(pointer('pointerdown', 60, 50), GROUP);
    component.onDocumentMouseMove(pointer('pointermove', 80, 80));
    vi.advanceTimersByTime(500);
    const save = http.expectOne(`${CANVAS_URL}/save-canvas-item`);
    expect([save.request.body.x, save.request.body.y]).toEqual([10, 20]);
    save.flush({ data: { id: 1 } });
    component.onDocumentMouseUp();
    fixture.changeDetectorRef.markForCheck();
    await vi.waitFor(() => http.expectOne(`${CANVAS_URL}/groups/move`).flush({}));
    await vi.waitFor(() => expect(component.isSelectionBusy).toBe(false));
    expect([item.x, item.y]).toEqual([50, 80]);
  });

  it('deletes selected mixed types with identical numeric IDs through the bulk endpoint', async () => {
    const text = textItem(1, 10, 20);
    const image: WorkspaceCanvasItem = {
      id: 1,
      projectId: 'p1',
      type: EnumWorkspaceItemType.IMAGE,
      x: 100,
      y: 100,
      zIndex: 1,
      width: 50,
      height: 50,
      fileName: '',
      imageUrl: '',
      imageAlt: '',
      statusIcon: '',
      statusIconClass: '',
      grayscaleHover: false,
    };
    component.activeWhiteboard.items = [text, image];
    component.selectedItems = [text, image];
    const action = component.deleteSelectedItems();
    await vi.waitFor(() => {
      const request = http.expectOne(`${CANVAS_URL}/delete-canvas-items`);
      expect(request.request.body.items).toEqual([
        { id: 1, type: 'text' },
        { id: 1, type: 'image' },
      ]);
      expect(component.canvasList).toHaveLength(2);
      request.flush({ deletedCount: 2 });
    });
    await action;
    expect(component.canvasList).toEqual([]);
    expect(component.selectedItems).toEqual([]);
  });

  it('keeps items and shows an error when bulk deletion fails', async () => {
    const item = textItem(1, 10, 20);
    component.activeWhiteboard.items = [item];
    component.selectedItems = [item];
    const action = component.deleteSelectedItems();
    await vi.waitFor(() =>
      http
        .expectOne(`${CANVAS_URL}/delete-canvas-items`)
        .flush({}, { status: 409, statusText: 'Conflict' }),
    );
    await action;
    expect(component.canvasList).toEqual([item]);
    expect(component.actionError).toContain('Failed to delete items');
    expect(component.isSelectionBusy).toBe(false);
  });

  it('does not mutate when read-only or after cancelling deletion', async () => {
    component.selectedItems = [textItem(1, 10, 20)];
    component.isReadOnly = true;
    await component.createGroup();
    await component.deleteSelectedItems();
    component.isReadOnly = false;
    confirm.mockReturnValue(of(false));
    await component.deleteSelectedItems();
    http.expectNone(`${CANVAS_URL}/groups`);
    http.expectNone(`${CANVAS_URL}/delete-canvas-items`);
  });

  it('edits the selected group and applies the saved name and color to its frame', async () => {
    const item = { ...textItem(1, 10, 20), groupId: GROUP.id };
    component.activeWhiteboard.items = [item];
    component.groups = [GROUP];
    component.selectedItems = [item];
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const edit: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.selection-actions button',
    );
    expect(edit.textContent).toContain('Edit group');
    edit.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const nameInput: HTMLInputElement = fixture.nativeElement.querySelector('#group-name');
    nameInput.value = ' Release ';
    nameInput.dispatchEvent(new Event('input'));
    const colorInput: HTMLInputElement = fixture.nativeElement.querySelector('input[type="color"]');
    colorInput.value = '#123456';
    colorInput.dispatchEvent(new Event('input'));
    const action = component.updateGroup();
    expect(component.groups[0]).toEqual(GROUP);
    const request = http.expectOne(`${CANVAS_URL}/groups/update`);
    expect(request.request.body).toEqual({
      projectId: 'p1',
      groupId: 7,
      name: 'Release',
      color: '#123456',
    });
    request.flush({ data: { ...GROUP, name: 'Release', color: '#123456' } });
    await action;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.group-label').textContent.trim()).toBe('Release');
    expect(
      fixture.nativeElement.querySelector('.group-frame').style.getPropertyValue('--group-color'),
    ).toBe('#123456');
    expect(component.editingGroup).toBeNull();
    expect(item.groupId).toBe(GROUP.id);
  });

  it('discards name and color drafts when cancelling group editing', () => {
    component.groups = [GROUP];
    component.editGroup(GROUP);
    component.groupName = 'Unsaved';
    component.groupColor = '#ffffff';
    component.cancelGroupEditor();
    expect(component.groups).toEqual([GROUP]);
    expect(component.editingGroup).toBeNull();
    http.expectNone(`${CANVAS_URL}/groups/update`);
  });

  it('retains the original group and editable draft when updating fails', async () => {
    component.groups = [GROUP];
    component.editGroup(GROUP);
    component.groupName = 'Retry me';
    component.groupColor = '#123456';
    const action = component.updateGroup();
    http
      .expectOne(`${CANVAS_URL}/groups/update`)
      .flush({}, { status: 500, statusText: 'Server error' });
    await action;
    expect(component.groups).toEqual([GROUP]);
    expect(component.groupName).toBe('Retry me');
    expect(component.editingGroup).toEqual(GROUP);
    expect(component.actionError).toContain('Failed to update group');
    expect(component.isSelectionBusy).toBe(false);
  });

  it('ungroups without deleting or moving items or changing other groups', async () => {
    const first = { ...textItem(1, 10, 20), groupId: GROUP.id };
    const second = { ...textItem(2, 100, 120), groupId: GROUP.id };
    const other = { ...textItem(3, 300, 320), groupId: 8 };
    const otherGroup = { ...GROUP, id: 8 };
    component.activeWhiteboard.items = [first, second, other];
    component.groups = [GROUP, otherGroup];
    component.selectedItems = [first, second];
    const originals = component.canvasList.map((item) => ({ ...item }));
    const action = component.ungroup(GROUP);
    await vi.waitFor(() => {
      const request = http.expectOne(`${CANVAS_URL}/groups/ungroup`);
      expect(request.request.body).toEqual({ projectId: 'p1', groupId: 7 });
      expect(component.groups).toHaveLength(2);
      request.flush({ groupId: 7 });
    });
    await action;
    expect(component.canvasList).toEqual(
      originals.map((item) => (item.groupId === GROUP.id ? { ...item, groupId: null } : item)),
    );
    expect(component.groups).toEqual([otherGroup]);
    expect(component.selectedGroup).toBeNull();
    http.expectNone(`${CANVAS_URL}/delete-canvas-items`);
  });

  it('preserves a group and its members if ungrouping fails', async () => {
    const item = { ...textItem(1, 10, 20), groupId: GROUP.id };
    component.activeWhiteboard.items = [item];
    component.groups = [GROUP];
    component.selectedItems = [item];
    const action = component.ungroup(GROUP);
    await vi.waitFor(() =>
      http
        .expectOne(`${CANVAS_URL}/groups/ungroup`)
        .flush({}, { status: 409, statusText: 'Conflict' }),
    );
    await action;
    expect(component.groups).toEqual([GROUP]);
    expect(item.groupId).toBe(GROUP.id);
    expect(component.selectedItems).toEqual([item]);
    expect(component.interactionTool).toBe(EnumWorkspaceItemType.HAND);
    expect(component.actionError).toContain('Failed to ungroup');
    expect(component.isSelectionBusy).toBe(false);
  });

  it.each([EnumWorkspaceItemType.HAND, EnumWorkspaceItemType.SELECT])(
    'lets each ungrouped item drag and save independently after ungrouping in %s mode',
    async (tool) => {
      vi.useFakeTimers();
      const first = { ...textItem(1, 10, 20), groupId: GROUP.id };
      const second = { ...textItem(2, 100, 120), groupId: GROUP.id };
      component.activeWhiteboard.items = [first, second];
      component.groups = [GROUP];
      component.changeInteractionTool(tool);
      component.selectedItems = [first, second];
      const action = component.ungroup(GROUP);
      await vi.waitFor(() =>
        http.expectOne(`${CANVAS_URL}/groups/ungroup`).flush({ groupId: GROUP.id }),
      );
      await action;
      expect(component.selectedItems).toEqual([]);
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();

      for (const [index, item] of [first, second].entries()) {
        fixture.nativeElement.querySelectorAll('.canvas-item')[index]
          .dispatchEvent(pointer('pointerdown', 60, 50));
        document.dispatchEvent(pointer('pointermove', 80, 80));
        document.dispatchEvent(pointer('pointerup', 80, 80));
        vi.advanceTimersByTime(500);
        const request = http.expectOne(`${CANVAS_URL}/save-canvas-item`);
        expect(request.request.body).toMatchObject({
          id: item.id, x: item.x, y: item.y, groupId: null,
        });
        request.flush({ data: { id: item.id } });
        await vi.waitFor(() => expect(component.isCanvasLoading).toBe(false));
        expect([first.x, first.y]).toEqual([50, 80]);
        expect([second.x, second.y]).toEqual(index === 0 ? [100, 120] : [140, 180]);
      }
      expect([component.panX, component.panY]).toEqual([20, -10]);
      http.expectNone(`${CANVAS_URL}/groups/move`);
    },
  );

  it('hides single-group actions for mixed selections and blocks read-only mutations', async () => {
    component.groups = [GROUP];
    component.selectedItems = [
      { ...textItem(1, 10, 20), groupId: GROUP.id },
      textItem(2, 100, 120),
    ];
    expect(component.selectedGroup).toBeNull();
    component.isReadOnly = true;
    component.editGroup(GROUP);
    expect(component.editingGroup).toBeNull();
    component.editingGroup = GROUP;
    await component.updateGroup();
    await component.ungroup(GROUP);
    http.expectNone(`${CANVAS_URL}/groups/update`);
    http.expectNone(`${CANVAS_URL}/groups/ungroup`);
  });
});
