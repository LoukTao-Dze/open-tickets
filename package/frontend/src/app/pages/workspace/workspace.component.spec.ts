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
import { routeCanvasConnection } from './connection-routing.util';
import { StickyNoteComponent } from './sticky-note/sticky-note.component';

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
    http.expectOne(`${CANVAS_URL}/connections?projectId=p1`).flush({ data: [] });
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

  it('saves pending changes before refreshing the board without resetting the viewport', async () => {
    vi.useFakeTimers();
    component.onInsertItem({ type: EnumWorkspaceItemType.TEXT });
    const item = component.canvasList[0];
    component.selectedItems = [item];
    const button: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[aria-label="Refresh workspace"]',
    );
    button.click();
    await Promise.resolve();
    const save = http.expectOne(`${CANVAS_URL}/save-canvas-item`);
    expect(save.request.body).toMatchObject({ type: EnumWorkspaceItemType.TEXT });
    http.expectNone(`${environment.apiBaseUrl}/api/projects`);
    save.flush({ data: { id: 1 } });
    await vi.waitFor(() => {
      http.expectOne(`${environment.apiBaseUrl}/api/projects`).flush({
        data: [{ id: 'p1', name: 'Updated board', default: true }],
      });
    });
    expect(component.isSelectionBusy).toBe(true);
    http.expectOne(`${CANVAS_URL}/get-canvas-item?projectId=p1`).flush({
      data: [{ ...item, content: 'From server' }],
    });
    http.expectOne(`${CANVAS_URL}/groups?projectId=p1`).flush({ data: [], canEdit: true });
    http.expectOne(`${CANVAS_URL}/connections?projectId=p1`).flush({ data: [] });
    expect(component.canvasList[0]).toMatchObject({ id: 1, content: 'From server' });
    expect(component.activeWhiteboard.name).toBe('Updated board');
    expect([component.zoom, component.panX, component.panY]).toEqual([0.5, 20, -10]);
    expect(component.selectedItems).toEqual([]);
    expect(component.isLoading).toBe(false);
    expect(component.isSelectionBusy).toBe(false);
  });

  it('keeps unsaved changes after a failed save and retries them before refreshing', async () => {
    const item = { ...textItem(1, 10, 20), content: 'Unsaved edit' };
    component.activeWhiteboard.items = [item];
    const initialSave = component.onSaveWhiteboard(item);
    http.expectOne(`${CANVAS_URL}/save-canvas-item`).flush(
      {},
      { status: 500, statusText: 'Server error' },
    );
    await initialSave;

    const retry = component.refreshWorkspace();
    const save = await vi.waitFor(() => http.expectOne(`${CANVAS_URL}/save-canvas-item`));
    expect(save.request.body).toMatchObject({ id: 1, content: 'Unsaved edit' });
    save.flush({}, { status: 500, statusText: 'Server error' });
    await retry;
    expect(component.canvasList[0]).toBe(item);
    expect(component.actionError).toContain('Failed to save items before refreshing');
    http.expectNone(`${environment.apiBaseUrl}/api/projects`);

    const secondRetry = component.refreshWorkspace();
    const secondSave = await vi.waitFor(() => http.expectOne(`${CANVAS_URL}/save-canvas-item`));
    secondSave.flush({ data: { id: 1 } });
    await secondRetry;
    http.expectOne(`${environment.apiBaseUrl}/api/projects`).flush({
      data: [{ id: 'p1', name: 'Board', default: true }],
    });
    http.expectOne(`${CANVAS_URL}/get-canvas-item?projectId=p1`).flush({ data: [item] });
    http.expectOne(`${CANVAS_URL}/groups?projectId=p1`).flush({ data: [], canEdit: true });
    http.expectOne(`${CANVAS_URL}/connections?projectId=p1`).flush({ data: [] });
    expect(component.canvasList[0]).toMatchObject({ content: 'Unsaved edit' });
  });

  it('saves an active editor before refreshing and retains it if the save fails', async () => {
    const item = textItem(1, 10, 20);
    component.activeWhiteboard.items = [item];
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const editor: HTMLTextAreaElement = fixture.nativeElement.querySelector('.text-item');
    editor.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();
    await Promise.resolve();
    editor.value = 'Active edit';
    editor.dispatchEvent(new Event('input', { bubbles: true }));

    fixture.nativeElement.querySelector('[aria-label="Refresh workspace"]').click();
    const save = http.expectOne(`${CANVAS_URL}/save-canvas-item`);
    expect(save.request.body).toMatchObject({ content: 'Active edit' });
    save.flush({}, { status: 500, statusText: 'Server error' });
    await vi.waitFor(() => expect(component.isSelectionBusy).toBe(false));
    expect(component.canvasList[0]).toBe(item);
    expect(component.actionError).toContain('Failed to save');
    http.expectNone(`${environment.apiBaseUrl}/api/projects`);
  });

  it('retains the current board when refreshing fails after loading projects', async () => {
    const item = textItem(1, 10, 20);
    component.activeWhiteboard.items = [item];
    component.selectedItems = [item];
    await component.refreshWorkspace();
    http.expectOne(`${environment.apiBaseUrl}/api/projects`).flush({
      data: [{ id: 'p1', name: 'Updated board', default: true }],
    });
    const itemsRequest = http.expectOne(`${CANVAS_URL}/get-canvas-item?projectId=p1`);
    http.expectOne(`${CANVAS_URL}/groups?projectId=p1`);
    http.expectOne(`${CANVAS_URL}/connections?projectId=p1`);
    itemsRequest.flush({}, { status: 500, statusText: 'Server error' });

    expect(component.canvasList[0]).toBe(item);
    expect(component.activeWhiteboard.name).toBe('Board');
    expect(component.selectedItems).toEqual([item]);
    expect([component.zoom, component.panX, component.panY]).toEqual([0.5, 20, -10]);
    expect(component.actionError).toContain('Failed to load workspace');
  });

  it.each([
    [EnumWorkspaceItemType.STICKY_NOTE, '.sticky-note-label', 'label'],
    [EnumWorkspaceItemType.STICKY_NOTE, '.sticky-note-content', 'content'],
    [EnumWorkspaceItemType.TEXT, '.text-item', 'content'],
    [EnumWorkspaceItemType.LINK, '.link-input', 'title'],
    [EnumWorkspaceItemType.LINK, '.link-input--url', 'url'],
    [EnumWorkspaceItemType.MARKDOWN, '.markdown-source', 'content'],
    [EnumWorkspaceItemType.CODE_SNIPPET, '.code-snippet-filename-input', 'fileName'],
    [EnumWorkspaceItemType.CODE_SNIPPET, '.cm-content', 'code'],
  ] as const)(
    'saves %s %s immediately on focusout without pointer interaction',
    async (type, selector, field) => {
      vi.useFakeTimers();
      component.onInsertItem({ type, color: STICKY_NOTE_COLOR_OPTIONS[0] });
      vi.advanceTimersByTime(500);
      http.expectOne(`${CANVAS_URL}/save-canvas-item`).flush({ data: { id: 1 } });
      await vi.waitFor(() => expect(component.isCanvasLoading).toBe(false));
      fixture.detectChanges();
      const item = component.canvasList[0];
      vi.spyOn(StickyNoteComponent.prototype, 'updateActiveFormats').mockImplementation(() => {});
      const editTarget: HTMLElement = fixture.nativeElement.querySelector(
        type === EnumWorkspaceItemType.LINK
          ? '.link-card'
          : type === EnumWorkspaceItemType.MARKDOWN
            ? '.markdown-preview'
            : selector,
      );
      editTarget.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      fixture.detectChanges();
      await Promise.resolve();
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
      if (document.activeElement === editor) {
        editor.blur();
      } else {
        editor.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      }
      const request = http.expectOne(`${CANVAS_URL}/save-canvas-item`);
      expect(request.request.body).toMatchObject({ id: 1, type, [field]: value });
      request.flush({ data: { id: 1 } });
      await vi.waitFor(() => expect(component.isCanvasLoading).toBe(false));
      expect(component.canvasList[0]).toBe(item);
    },
  );

  it('focuses the link title when double-clicked before the next change detection', async () => {
    component.activeWhiteboard.items = [
      {
        ...textItem(1, 10, 20),
        type: EnumWorkspaceItemType.LINK,
        title: 'Link',
        url: 'https://example.com',
      },
    ];
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    fixture.nativeElement
      .querySelector('.link-card')
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await Promise.resolve();

    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('.link-input'));
  });

  it.each([
    [EnumWorkspaceItemType.STICKY_NOTE, '.sticky-note-content'],
    [EnumWorkspaceItemType.STICKY_NOTE, '.sticky-note-label'],
    [EnumWorkspaceItemType.TEXT, '.text-item'],
    [EnumWorkspaceItemType.LINK, '.link-card'],
    [EnumWorkspaceItemType.MARKDOWN, '.markdown-preview'],
    [EnumWorkspaceItemType.CODE_SNIPPET, '.code-snippet-filename-input'],
    [EnumWorkspaceItemType.CODE_SNIPPET, '.cm-content'],
    [EnumWorkspaceItemType.IMAGE, '.image-upload-placeholder'],
  ] as const)('drags %s from %s immediately in pan mode', async (type, selector) => {
    vi.useFakeTimers();
    component.onInsertItem({ type, color: STICKY_NOTE_COLOR_OPTIONS[0] });
    vi.advanceTimersByTime(500);
    http.expectOne(`${CANVAS_URL}/save-canvas-item`).flush({ data: { id: 1 } });
    await vi.waitFor(() => expect(component.isCanvasLoading).toBe(false));
    component.changeInteractionTool(EnumWorkspaceItemType.HAND);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const item = component.canvasList[0];
    const initialX = item.x;
    const initialY = item.y;
    const target: HTMLElement = fixture.nativeElement.querySelector(selector);
    const uploadInput: HTMLInputElement | null = fixture.nativeElement.querySelector(
      'input[type="file"]',
    );
    const uploadClick = uploadInput && vi.spyOn(uploadInput, 'click');
    target.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 60, clientY: 50 }),
    );
    document.dispatchEvent(pointer('pointermove', 80, 80));
    document.dispatchEvent(pointer('pointerup', 80, 80));
    expect([item.x, item.y]).toEqual([initialX + 40, initialY + 60]);
    expect([component.panX, component.panY]).toEqual([20, -10]);
    if (type === EnumWorkspaceItemType.STICKY_NOTE) {
      expect(
        fixture.nativeElement.querySelector('.sticky-note-content').getAttribute('contenteditable'),
      ).toBe('false');
    }
    if (uploadClick) {
      expect(uploadClick).not.toHaveBeenCalled();
      target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      expect(uploadClick).toHaveBeenCalledOnce();
    }
    vi.advanceTimersByTime(500);
    const save = http.expectOne(`${CANVAS_URL}/save-canvas-item`);
    expect(save.request.body).toMatchObject({ x: item.x, y: item.y });
    save.flush({ data: { id: 1 } });
    await vi.waitFor(() => expect(component.isCanvasLoading).toBe(false));
  });

  it('keeps both anchors fixed and routes around the items as the source moves', () => {
    const source = textItem(1, 100, 200);
    const target = textItem(2, 300, 200);
    component.activeWhiteboard.items = [source, target];
    component.connections = [
      {
        id: 21,
        projectId: 'p1',
        sourceItemId: 1,
        sourceItemType: EnumWorkspaceItemType.TEXT,
        sourceAnchor: 'right',
        targetItemId: 2,
        targetItemType: EnumWorkspaceItemType.TEXT,
        targetAnchor: 'left',
        color: '#414752',
        strokeWidth: 2,
      },
    ];

    for (const [x, y] of [
      [100, 200],
      [400, 200],
      [300, 100],
      [300, 300],
    ]) {
      source.x = x;
      source.y = y;
      const path = component.connectionPaths[0].path;
      expect(path).not.toContain('L');
      const tokens = path.split(' ');
      const points = [{ x: Number(tokens[1]), y: Number(tokens[2]) }];
      for (let index = 3; index < tokens.length; index += 2) {
        const previous = points[points.length - 1];
        points.push(
          tokens[index] === 'H'
            ? { x: Number(tokens[index + 1]), y: previous.y }
            : { x: previous.x, y: Number(tokens[index + 1]) },
        );
      }
      expect(points[0]).toEqual({ x: source.x + source.width, y: source.y + source.height / 2 });
      expect(points[1].x).toBeGreaterThan(points[0].x);
      expect(points[points.length - 1]).toEqual({ x: target.x, y: target.y + target.height / 2 });
      expect(points[points.length - 2].x).toBeLessThan(target.x);
      for (let index = 1; index < points.length; index++) {
        const start = points[index - 1];
        const end = points[index];
        for (const item of [source, target]) {
          const crosses =
            start.x === end.x
              ? start.x > item.x &&
                start.x < item.x + item.width &&
                Math.max(start.y, end.y) > item.y &&
                Math.min(start.y, end.y) < item.y + item.height
              : start.y > item.y &&
                start.y < item.y + item.height &&
                Math.max(start.x, end.x) > item.x &&
                Math.min(start.x, end.x) < item.x + item.width;
          expect(crosses).toBe(false);
        }
      }
    }
  });

  it('finds an unobstructed route for every anchor pair when items do not overlap', () => {
    const source = textItem(1, 100, 100);
    const anchors = ['top', 'right', 'bottom', 'left'] as const;
    for (const [x, y] of [
      [300, 100],
      [0, 100],
      [100, 300],
      [100, 0],
      [300, 300],
      [0, 0],
      [151, 100],
      [100, 151],
    ]) {
      const target = textItem(2, x, y);
      for (const sourceAnchor of anchors) {
        for (const targetAnchor of anchors) {
          expect(
            routeCanvasConnection(source, target, sourceAnchor, targetAnchor),
            `target ${x},${y}: ${sourceAnchor} to ${targetAnchor}`,
          ).not.toBeNull();
        }
      }
    }
  });

  it.each(['top', 'right', 'bottom', 'left'] as const)(
    'keeps the final segment behind the arrow on the %s side as the line gets thicker',
    (targetAnchor) => {
      component.activeWhiteboard.items = [textItem(1, 400, 100), textItem(2, 100, 100)];
      const connection = {
        id: 21,
        projectId: 'p1',
        sourceItemId: 1,
        sourceItemType: EnumWorkspaceItemType.TEXT,
        sourceAnchor: 'right' as const,
        targetItemId: 2,
        targetItemType: EnumWorkspaceItemType.TEXT,
        targetAnchor,
        color: '#414752',
        strokeWidth: 2,
      };
      component.connections = [connection];

      for (const strokeWidth of [2, 8]) {
        connection.strokeWidth = strokeWidth;
        fixture.changeDetectorRef.markForCheck();
        fixture.detectChanges();
        const path: SVGPathElement = fixture.nativeElement.querySelector('.canvas-connection');
        const marker: SVGMarkerElement =
          fixture.nativeElement.querySelector('#connection-arrow-21');
        const tokens = path.getAttribute('d')!.split(' ');
        const points = [{ x: Number(tokens[1]), y: Number(tokens[2]) }];
        for (let index = 3; index < tokens.length; index += 2) {
          const previous = points[points.length - 1];
          points.push(
            tokens[index] === 'H'
              ? { x: Number(tokens[index + 1]), y: previous.y }
              : { x: previous.x, y: Number(tokens[index + 1]) },
          );
        }
        const end = points[points.length - 1];
        const beforeEnd = points[points.length - 2];
        const finalSegment = Math.abs(end.x - beforeEnd.x) + Math.abs(end.y - beforeEnd.y);
        const targetPoints = {
          top: { x: 125, y: 100 },
          right: { x: 150, y: 125 },
          bottom: { x: 125, y: 150 },
          left: { x: 100, y: 125 },
        };
        expect(end).toEqual(targetPoints[targetAnchor]);
        expect(marker.querySelector('path')?.getAttribute('d')).toContain(
          `L${marker.getAttribute('refX')},4`,
        );
        expect(finalSegment).toBeGreaterThan(Number(marker.getAttribute('refX')) * strokeWidth);
      }
    },
  );

  it('scales the arrow down when there is not enough room between items', () => {
    component.activeWhiteboard.items = [textItem(1, 100, 100), textItem(2, 151, 100)];
    component.connections = [
      {
        id: 21,
        projectId: 'p1',
        sourceItemId: 1,
        sourceItemType: EnumWorkspaceItemType.TEXT,
        sourceAnchor: 'right',
        targetItemId: 2,
        targetItemType: EnumWorkspaceItemType.TEXT,
        targetAnchor: 'left',
        color: '#414752',
        strokeWidth: 8,
      },
    ];
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();

    const path: SVGPathElement = fixture.nativeElement.querySelector('.canvas-connection');
    const marker: SVGMarkerElement = fixture.nativeElement.querySelector('#connection-arrow-21');
    expect(path.getAttribute('d')).toBe('M 150 125 H 151');
    expect(Number(marker.getAttribute('markerWidth'))).toBeLessThan(8);
    expect(Number(marker.getAttribute('markerWidth')) * 8).toBeLessThan(1);
  });

  it.each([null, 'right'] as const)(
    'fits the arrow on a legacy connection without a target anchor (source: %s)',
    (sourceAnchor) => {
      component.activeWhiteboard.items = [textItem(1, 100, 100), textItem(2, 151, 100)];
      component.connections = [
        {
          id: 21,
          projectId: 'p1',
          sourceItemId: 1,
          sourceItemType: EnumWorkspaceItemType.TEXT,
          sourceAnchor,
          targetItemId: 2,
          targetItemType: EnumWorkspaceItemType.TEXT,
          targetAnchor: null,
          color: '#414752',
          strokeWidth: 8,
        },
      ];
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();

      const marker: SVGMarkerElement = fixture.nativeElement.querySelector('#connection-arrow-21');
      expect(Number(marker.getAttribute('markerWidth')) * 8).toBeLessThan(0.5);
    },
  );

  it('aligns the preview arrow tip with its endpoint', () => {
    const marker: SVGMarkerElement = fixture.nativeElement.querySelector('#connection-arrow');
    expect(marker.querySelector('path')?.getAttribute('d')).toContain(
      `L${marker.getAttribute('refX')},4`,
    );
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

  it('creates a routed connection by dragging from one saved item to another', async () => {
    const source = textItem(1, 100, 100);
    const target = textItem(2, 300, 200);
    component.activeWhiteboard.items = [source, target];
    component.zoom = 1;
    component.panX = 0;
    component.panY = 0;
    component.changeInteractionTool(EnumWorkspaceItemType.CONNECT);

    component.onItemMouseDown(pointer('pointerdown', 165, 185), source);
    component.onDocumentMouseMove(pointer('pointermove', 365, 285));
    expect(component.connectionPreviewPath).toContain('H');
    component.onDocumentMouseUp(pointer('pointerup', 365, 285));
    expect(component.isSelectionBusy).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const request = http.expectOne(`${CANVAS_URL}/connections`);
    expect(request.request.body).toEqual({
      projectId: 'p1',
      sourceItemId: 1,
      sourceItemType: EnumWorkspaceItemType.TEXT,
      sourceAnchor: 'right',
      targetItemId: 2,
      targetItemType: EnumWorkspaceItemType.TEXT,
      targetAnchor: 'top',
    });
    request.flush({
      data: {
        id: 8,
        projectId: 'p1',
        sourceItemId: 1,
        sourceItemType: EnumWorkspaceItemType.TEXT,
        sourceAnchor: 'right',
        targetItemId: 2,
        targetItemType: EnumWorkspaceItemType.TEXT,
        targetAnchor: 'top',
        color: '#414752',
        strokeWidth: 2,
      },
    });
    await vi.waitFor(() => expect(component.connections).toHaveLength(1));

    expect(component.connectionPaths).toEqual([
      {
        id: 8,
        path: 'M 150 125 H 325 V 200',
        connection: {
          id: 8,
          projectId: 'p1',
          sourceItemId: 1,
          sourceItemType: EnumWorkspaceItemType.TEXT,
          sourceAnchor: 'right',
          targetItemId: 2,
          targetItemType: EnumWorkspaceItemType.TEXT,
          targetAnchor: 'top',
          color: '#414752',
          strokeWidth: 2,
        },
        color: '#414752',
        strokeWidth: 2,
        markerSize: 8,
        selected: false,
      },
    ]);
  });

  it('starts a connection from the focused item anchor that was clicked', async () => {
    const source = textItem(1, 100, 100);
    const target = textItem(2, 300, 200);
    component.activeWhiteboard.items = [source, target];
    component.focusedItem = source;
    component.zoom = 1;
    component.panX = 0;
    component.panY = 0;
    fixture.changeDetectorRef.detectChanges();

    const anchors = fixture.nativeElement.querySelectorAll('.connection-anchor');
    expect(anchors).toHaveLength(4);
    const topAnchor: HTMLButtonElement = fixture.nativeElement.querySelector(
      '[aria-label="Create connection from top"]',
    );
    const expectedStarts = [
      ['top', 'M 125 100'],
      ['right', 'M 150 125'],
      ['bottom', 'M 125 150'],
      ['left', 'M 100 125'],
    ] as const;
    for (const [anchor, expectedStart] of expectedStarts) {
      fixture.nativeElement
        .querySelector(`[aria-label="Create connection from ${anchor}"]`)
        .dispatchEvent(pointer('pointerdown', 165, 160));
      expect(component.connectionPreviewPath).toContain(expectedStart);
      component.onDocumentMouseUp(pointer('pointercancel', 165, 160));
    }

    topAnchor.dispatchEvent(pointer('pointerdown', 165, 160));
    expect(component.connectionPreviewPath).toBe('M 125 100 V 100 H 125 V 100');

    component.onDocumentMouseMove(pointer('pointermove', 365, 285));
    expect(component.connectionPreviewPath).toBe('M 125 100 V 80 H 325 V 200');
    component.onDocumentMouseUp(pointer('pointerup', 365, 285));
    await new Promise((resolve) => setTimeout(resolve, 0));

    const request = http.expectOne(`${CANVAS_URL}/connections`);
    expect(request.request.body).toEqual({
      projectId: 'p1',
      sourceItemId: 1,
      sourceItemType: EnumWorkspaceItemType.TEXT,
      sourceAnchor: 'top',
      targetItemId: 2,
      targetItemType: EnumWorkspaceItemType.TEXT,
      targetAnchor: 'top',
    });
    request.flush({
      data: {
        id: 21,
        projectId: 'p1',
        sourceItemId: 1,
        sourceItemType: EnumWorkspaceItemType.TEXT,
        sourceAnchor: 'top',
        targetItemId: 2,
        targetItemType: EnumWorkspaceItemType.TEXT,
        targetAnchor: 'top',
        color: '#414752',
        strokeWidth: 2,
      },
    });
    await vi.waitFor(() => expect(component.connections).toHaveLength(1));
    expect(component.connectionPaths[0].path).toBe('M 125 100 V 80 H 325 V 200');
  });

  it.each([
    ['right', 'top', 'M 150 125 H 325 V 200'],
    ['right', 'left', 'M 150 125 H 225 V 225 H 300'],
    ['bottom', 'left', 'M 125 150 V 225 H 300'],
    ['bottom', 'top', 'M 125 150 V 175 H 325 V 200'],
    ['right', 'right', 'M 150 125 H 370 V 225 H 350'],
    ['top', 'top', 'M 125 100 V 80 H 325 V 200'],
  ] as const)(
    'uses the necessary right-angle bends from %s to %s',
    (sourceAnchor, targetAnchor, expectedPath) => {
      component.activeWhiteboard.items = [textItem(1, 100, 100), textItem(2, 300, 200)];
      component.connections = [
        {
          id: 21,
          projectId: 'p1',
          sourceItemId: 1,
          sourceItemType: EnumWorkspaceItemType.TEXT,
          sourceAnchor,
          targetItemId: 2,
          targetItemType: EnumWorkspaceItemType.TEXT,
          targetAnchor,
          color: '#414752',
          strokeWidth: 2,
        },
      ];

      expect(component.connectionPaths[0].path).toBe(expectedPath);
    },
  );

  it('shows target anchors and snaps to the selected side while dragging', async () => {
    const source = textItem(1, 100, 100);
    const target = textItem(2, 300, 200);
    component.activeWhiteboard.items = [source, target];
    component.focusedItem = source;
    component.zoom = 1;
    component.panX = 0;
    component.panY = 0;
    fixture.changeDetectorRef.detectChanges();

    fixture.nativeElement
      .querySelector('[aria-label="Create connection from right"]')
      .dispatchEvent(pointer('pointerdown', 190, 185));
    const targetSides = [
      ['top', 365, 260, 'V 200'],
      ['right', 390, 285, 'H 350'],
      ['bottom', 365, 310, 'V 250'],
      ['left', 340, 285, 'H 300'],
    ] as const;
    for (const [anchor, x, y, endpoint] of targetSides) {
      component.onDocumentMouseMove(pointer('pointermove', x, y));
      fixture.changeDetectorRef.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.connection-anchor--target')).toHaveLength(4);
      expect(
        fixture.nativeElement
          .querySelector('.connection-anchor--target.connection-anchor--active')
          .getAttribute('aria-label'),
      ).toBe(`Create connection from ${anchor}`);
      expect(component.connectionPreviewPath?.endsWith(endpoint)).toBe(true);
    }

    component.onDocumentMouseMove(pointer('pointermove', 500, 500));
    fixture.changeDetectorRef.detectChanges();
    expect(component.connectionTarget).toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.connection-anchor--target')).toHaveLength(0);
    component.onDocumentMouseMove(pointer('pointermove', 365, 315));
    expect(component.connectionTarget?.anchor).toBe('bottom');
    component.onDocumentMouseUp(pointer('pointerup', 365, 315));
    fixture.changeDetectorRef.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const request = http.expectOne(`${CANVAS_URL}/connections`);
    expect(request.request.body).toMatchObject({ sourceAnchor: 'right', targetAnchor: 'bottom' });
    const savedConnection = {
      id: 22,
      projectId: 'p1',
      sourceItemId: 1,
      sourceItemType: EnumWorkspaceItemType.TEXT,
      sourceAnchor: 'right' as const,
      targetItemId: 2,
      targetItemType: EnumWorkspaceItemType.TEXT,
      targetAnchor: 'bottom' as const,
      color: '#414752',
      strokeWidth: 2,
    };
    request.flush({ data: savedConnection });
    await vi.waitFor(() => expect(component.connections).toHaveLength(1));
    expect(component.connectionPaths[0].path.endsWith('V 250')).toBe(true);
    target.y = 400;
    component.connections = [{ ...savedConnection }];
    expect(component.connectionPaths[0].path.endsWith('V 450')).toBe(true);
  });

  it('snaps near an anchor at a zoom offset and cancels without saving', () => {
    const source = textItem(1, 100, 100);
    const target = textItem(2, 300, 200);
    component.activeWhiteboard.items = [source, target];
    component.onConnectionAnchorMouseDown(pointer('pointerdown', 135, 112.5), source, 'right');

    component.onDocumentMouseMove(pointer('pointermove', 222.5, 180));
    expect(component.connectionTarget).toEqual({ item: target, anchor: 'bottom' });
    component.onDocumentMouseUp(pointer('pointercancel', 222.5, 180));
    expect(component.connectionTarget).toBeNull();
    expect(component.connectionPreviewPath).toBeNull();
    http.expectNone(`${CANVAS_URL}/connections`);
  });

  it('opens the connection toolbar, saves its style, and deletes the line', async () => {
    const source = textItem(1, 100, 100);
    const target = textItem(2, 300, 200);
    const connection = {
      id: 20,
      projectId: 'p1',
      sourceItemId: 1,
      sourceItemType: EnumWorkspaceItemType.TEXT,
      sourceAnchor: null,
      targetItemId: 2,
      targetItemType: EnumWorkspaceItemType.TEXT,
      targetAnchor: null,
      color: '#414752',
      strokeWidth: 2,
    };
    component.activeWhiteboard.items = [source, target];
    component.connections = [connection];
    expect(component.connectionPaths).toHaveLength(1);
    fixture.changeDetectorRef.detectChanges();

    fixture.nativeElement
      .querySelector('.canvas-connection-hit')
      .dispatchEvent(pointer('pointerdown', 215, 185));
    fixture.detectChanges();
    expect(component.selectedConnectionId).toBe(connection.id);
    expect(
      fixture.nativeElement.querySelector('[aria-label="Connection appearance"]'),
    ).toBeTruthy();

    const colorInput: HTMLInputElement = fixture.nativeElement.querySelector(
      '[aria-label="Connection color"]',
    );
    colorInput.value = '#ff0000';
    colorInput.dispatchEvent(new Event('input', { bubbles: true }));
    const widthSelect: HTMLSelectElement = fixture.nativeElement.querySelector(
      '[aria-label="Connection thickness"]',
    );
    widthSelect.selectedIndex = 3;
    widthSelect.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    const line: SVGPathElement = fixture.nativeElement.querySelector('.canvas-connection');
    expect(line.style.stroke).toBe('rgb(255, 0, 0)');
    expect(line.style.strokeWidth).toBe('4');
    expect(
      fixture.nativeElement.querySelector('#connection-arrow-20 path').getAttribute('fill'),
    ).toBe('#ff0000');
    expect(component.connections[0]).toMatchObject({ color: '#414752', strokeWidth: 2 });
    http.expectNone(`${CANVAS_URL}/connections/update`);

    const saving = component.saveConnectionStyle();
    await vi.waitFor(() => {
      const request = http.expectOne(`${CANVAS_URL}/connections/update`);
      expect(request.request.body).toEqual({
        projectId: 'p1',
        connectionId: 20,
        color: '#ff0000',
        strokeWidth: 4,
      });
      request.flush({
        data: { ...connection, color: '#ff0000', strokeWidth: 4 },
      });
    });
    await saving;
    fixture.detectChanges();
    expect(component.connections[0]).toMatchObject({
      color: '#ff0000',
      strokeWidth: 4,
    });
    expect(
      fixture.nativeElement.querySelector('#connection-arrow-20 path').getAttribute('fill'),
    ).toBe('#ff0000');

    fixture.nativeElement.querySelector('[aria-label="Close connection appearance"]').click();
    fixture.detectChanges();
    expect(line.style.stroke).toBe('rgb(255, 0, 0)');
    expect(line.style.strokeWidth).toBe('4');
    fixture.nativeElement
      .querySelector('.canvas-connection-hit')
      .dispatchEvent(pointer('pointerdown', 215, 185));
    fixture.detectChanges();

    const deleting = component.deleteSelectedConnection();
    await vi.waitFor(() => {
      const request = http.expectOne(`${CANVAS_URL}/connections/delete`);
      expect(request.request.body).toEqual({ projectId: 'p1', connectionId: 20 });
      request.flush({ id: 20 });
    });
    await deleting;
    expect(component.connections).toEqual([]);
    expect(component.selectedConnectionId).toBeNull();
  });

  it('discards unsaved appearance changes when switching or closing connections', () => {
    component.activeWhiteboard.items = [
      textItem(1, 100, 100),
      textItem(2, 300, 100),
      textItem(3, 500, 200),
    ];
    const connection = {
      id: 20,
      projectId: 'p1',
      sourceItemId: 1,
      sourceItemType: EnumWorkspaceItemType.TEXT,
      sourceAnchor: 'top' as const,
      targetItemId: 2,
      targetItemType: EnumWorkspaceItemType.TEXT,
      targetAnchor: 'top' as const,
      color: '#414752',
      strokeWidth: 2,
    };
    const second = { ...connection, id: 21, targetItemId: 3, color: '#123456', strokeWidth: 4 };
    component.connections = [connection, second];
    const originalPath = component.connectionPaths[0].path;
    component.selectConnection(new Event('pointerdown'), connection);
    component.connectionColorDraft = '#ff0000';
    component.connectionStrokeWidthDraft = 8;
    expect(component.connectionPaths[0]).toMatchObject({ color: '#ff0000', strokeWidth: 8 });
    expect(component.connectionPaths[0].path).not.toBe(originalPath);

    component.selectConnection(new Event('pointerdown'), second);
    expect(component.connectionPaths[0]).toMatchObject({ color: '#414752', strokeWidth: 2 });
    expect(component.connectionPaths[0].path).toBe(originalPath);
    expect(component.connectionPaths[1]).toMatchObject({ color: '#123456', strokeWidth: 4 });
    component.connectionColorDraft = '#00ff00';
    component.connectionStrokeWidthDraft = 6;
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('[aria-label="Close connection appearance"]').click();
    fixture.detectChanges();
    expect(component.connectionPaths[1]).toMatchObject({ color: '#123456', strokeWidth: 4 });
    expect(component.connections).toEqual([connection, second]);
    http.expectNone(`${CANVAS_URL}/connections/update`);
  });

  it('keeps unsaved changes retryable after a failed save and discards them on close', async () => {
    component.activeWhiteboard.items = [textItem(1, 100, 100), textItem(2, 300, 200)];
    const connection = {
      id: 20,
      projectId: 'p1',
      sourceItemId: 1,
      sourceItemType: EnumWorkspaceItemType.TEXT,
      sourceAnchor: 'right' as const,
      targetItemId: 2,
      targetItemType: EnumWorkspaceItemType.TEXT,
      targetAnchor: 'top' as const,
      color: '#414752',
      strokeWidth: 2,
    };
    component.connections = [connection];
    component.selectConnection(new Event('pointerdown'), connection);
    component.connectionColorDraft = '#ff0000';
    const saving = component.saveConnectionStyle();
    http
      .expectOne(`${CANVAS_URL}/connections/update`)
      .flush({}, { status: 500, statusText: 'Server Error' });
    await saving;

    expect(component.actionError).toContain('Failed to update connection style');
    expect(component.connectionPaths[0].color).toBe('#ff0000');
    expect(component.connections[0].color).toBe('#414752');
    component.clearSelection();
    expect(component.connectionPaths[0].color).toBe('#414752');
  });

  it('does not create self-connections or allow read-only users to connect items', () => {
    const item = textItem(1, 100, 100);
    component.activeWhiteboard.items = [item];
    component.zoom = 1;
    component.panX = 0;
    component.panY = 0;
    component.changeInteractionTool(EnumWorkspaceItemType.CONNECT);

    component.onItemMouseDown(pointer('pointerdown', 165, 185), item);
    component.onDocumentMouseUp(pointer('pointerup', 165, 185));
    component.isReadOnly = true;
    component.onItemMouseDown(pointer('pointerdown', 165, 185), item);
    component.onDocumentMouseUp(pointer('pointerup', 165, 185));

    expect(component.connections).toEqual([]);
    http.expectNone(`${CANVAS_URL}/connections`);
  });

  it('saves new endpoint items before persisting their connection', async () => {
    const source = textItem(0, 100, 100);
    const target = textItem(0, 300, 200);
    delete source.id;
    delete target.id;
    component.activeWhiteboard.items = [source, target];
    component.zoom = 1;
    component.panX = 0;
    component.panY = 0;
    component.changeInteractionTool(EnumWorkspaceItemType.CONNECT);

    component.onItemMouseDown(pointer('pointerdown', 165, 185), source);
    component.onDocumentMouseUp(pointer('pointerup', 365, 285));

    let saves = http.match(`${CANVAS_URL}/save-canvas-item`);
    await vi.waitFor(() => {
      saves = http.match(`${CANVAS_URL}/save-canvas-item`);
      expect(saves).toHaveLength(2);
    });
    saves[0].flush({ data: { id: 11 } });
    saves[1].flush({ data: { id: 12 } });
    await vi.waitFor(() => {
      const request = http.expectOne(`${CANVAS_URL}/connections`);
      expect(request.request.body).toMatchObject({
        sourceItemId: 11,
        sourceAnchor: 'right',
        targetItemId: 12,
        targetAnchor: 'top',
      });
      request.flush({
        data: {
          id: 13,
          projectId: 'p1',
          sourceItemId: 11,
          sourceItemType: EnumWorkspaceItemType.TEXT,
          sourceAnchor: 'right',
          targetItemId: 12,
          targetItemType: EnumWorkspaceItemType.TEXT,
          targetAnchor: 'top',
          color: '#414752',
          strokeWidth: 2,
        },
      });
    });
    expect(component.connections).toHaveLength(1);
  });

  it.each(['pointerup', 'pointercancel'])(
    'uses the selection cursor only after dragging and resets on %s',
    (endEvent) => {
      selectTool();
      const viewport: HTMLElement = component.viewportRef.nativeElement;
      expect(viewport.classList.contains('is-selecting')).toBe(false);

      document.dispatchEvent(pointer('pointermove', 80, 90));
      fixture.detectChanges();
      expect(viewport.classList.contains('is-selecting')).toBe(false);

      viewport.dispatchEvent(pointer('pointerdown', 60, 50));
      document.dispatchEvent(pointer('pointermove', 60, 50));
      fixture.detectChanges();
      expect(viewport.classList.contains('is-selecting')).toBe(false);

      document.dispatchEvent(pointer('pointermove', 80, 50));
      fixture.detectChanges();
      expect(viewport.classList.contains('is-selecting')).toBe(true);

      document.dispatchEvent(pointer(endEvent, 80, 50));
      fixture.detectChanges();
      expect(viewport.classList.contains('is-selecting')).toBe(false);
      expect(viewport.classList.contains('selection-mode')).toBe(true);
    },
  );

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

    fixture.nativeElement.querySelector(selector).dispatchEvent(pointer('pointerdown', 60, 50));
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

  it('keeps active grouped editors and controls out of group dragging', () => {
    const item = { ...textItem(1, 10, 20), groupId: GROUP.id };
    component.activeWhiteboard.items = [item];
    component.groups = [GROUP];
    selectTool();
    const editor: HTMLElement = fixture.nativeElement.querySelector('.text-item');
    editor.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();

    for (const selector of ['.text-item', '.item-delete-btn']) {
      fixture.nativeElement
        .querySelector(selector)
        .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 60, clientY: 50 }));
      component.onDocumentMouseMove(pointer('pointermove', 60, 50));
      component.onDocumentMouseUp();
      expect(component.selectedItems).toEqual([]);
    }
    expect([item.x, item.y]).toEqual([10, 20]);
    http.expectNone(`${CANVAS_URL}/groups/move`);
  });

  it('moves a group when dragging a non-editing item field', async () => {
    const first = { ...textItem(1, 10, 20), groupId: GROUP.id };
    const second = { ...textItem(2, 100, 120), groupId: GROUP.id };
    component.activeWhiteboard.items = [first, second];
    component.groups = [GROUP];
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();

    fixture.nativeElement.querySelector('.text-item').dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 60, clientY: 50 }),
    );
    document.dispatchEvent(pointer('pointermove', 80, 80));
    document.dispatchEvent(pointer('pointerup', 80, 80));
    await vi.waitFor(() => http.expectOne(`${CANVAS_URL}/groups/move`).flush({}));
    await vi.waitFor(() => expect(component.isSelectionBusy).toBe(false));
    expect([first.x, first.y, second.x, second.y]).toEqual([50, 80, 140, 180]);
  });

  it('does not save transient group-drag positions when a pending item save fires', async () => {
    vi.useFakeTimers();
    const item = textItem(1, 10, 20);
    component.activeWhiteboard.items = [item];
    component.groups = [GROUP];
    selectTool();
    const editor = document.createElement('textarea');
    editor.addEventListener('pointerdown', (event) =>
      component.onItemMouseDown(event as PointerEvent, item),
    );
    editor.dispatchEvent(pointer('pointerdown', 60, 50));
    component.onDocumentMouseUp();
    item.groupId = GROUP.id;
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
        fixture.nativeElement
          .querySelectorAll('.canvas-item')
          [index].dispatchEvent(pointer('pointerdown', 60, 50));
        document.dispatchEvent(pointer('pointermove', 80, 80));
        document.dispatchEvent(pointer('pointerup', 80, 80));
        vi.advanceTimersByTime(500);
        const request = http.expectOne(`${CANVAS_URL}/save-canvas-item`);
        expect(request.request.body).toMatchObject({
          id: item.id,
          x: item.x,
          y: item.y,
          groupId: null,
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
