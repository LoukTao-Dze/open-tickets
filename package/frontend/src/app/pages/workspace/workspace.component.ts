import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { StickyNoteComponent } from './sticky-note/sticky-note.component';
import { UploadedImageComponent } from './uploaded-image/uploaded-image.component';
import { CodeSnippetComponent } from './code-snippet/code-snippet.component';
import { TextComponent } from './text/text.component';
import { LinkComponent } from './link/link.component';
import { ToolHubsComponent, InsertToolEvent } from './tool-hubs/tool-hubs.component';
import { EnumWorkspaceItemType } from '../../enum/workspace.enum';
import { Whiteboard, WorkspaceCanvasItem } from '../../interface/workspace.interface';
import { MOCK_WORKSPACES } from '../../mock/work-space';
import { finalize, switchMap } from 'rxjs';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;
/**
 * @const ZOOM_WHEEL_SENSITIVITY
 * Proportional to wheel/pinch delta so zoom speed matches gesture speed
 */
const ZOOM_WHEEL_SENSITIVITY = 0.005;
const MAX_ZOOM_WHEEL_DELTA = 80;
// world-space margin kept around board content so items never touch the minimap edge
const MINIMAP_BOUNDS_PADDING = 200;

const STICKY_NOTE_SIZE = 192;
const DEFAULT_TEXT_FONT_SIZE = 18;
const DEFAULT_TEXT_COLOR = '#dfe2eb';
const DEFAULT_TEXT_WIDTH = 200;
const DEFAULT_TEXT_HEIGHT = 60;
const DEFAULT_LINK_WIDTH = 256;
const DEFAULT_LINK_HEIGHT = 64;
const DEFAULT_CODE_SNIPPET_WIDTH = 320;
const DEFAULT_CODE_SNIPPET_HEIGHT = 200;
const DEFAULT_CODE_SNIPPET_FILE_NAME = 'untitled';
const DEFAULT_CODE_SNIPPET_LANGUAGE = 'typescript';
const SAVE_WHITEBOARD_DELAY_MS = 0;
const SAVE_CANVAS_ITEM_ENDPOINT = '/api/save-canvas-item';
const GET_CANVAS_ITEM_ENDPOINT = '/api/get-canvas-item';
const GET_ALL_PROJECTS_ENDPOINT = '/api/projects';

interface SaveCanvasItemResponse {
  data: {
    id: number;
  };
}

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [
    CommonModule,
    StickyNoteComponent,
    UploadedImageComponent,
    CodeSnippetComponent,
    TextComponent,
    LinkComponent,
    ToolHubsComponent,
  ],
  templateUrl: './workspace.component.html',
  styleUrls: ['./workspace.component.scss'],
})
export class WorkspaceComponent implements OnDestroy, OnInit {
  @ViewChild('viewport', { static: true }) viewportRef!: ElementRef<HTMLDivElement>;
  @ViewChild('miniMap', { static: true }) miniMapRef!: ElementRef<HTMLDivElement>;

  private readonly http = inject(HttpClient);

  zoom = 0.5;
  panX = 0;
  panY = 0;
  EnumWorkspaceItemType = EnumWorkspaceItemType;

  whiteboards: Whiteboard[] = []; //MOCK_WORKSPACES;

  selectedWhiteboardId = '';
  isLoading = false;
  isCanvasLoading = false;
  canvasItemResponse: WorkspaceCanvasItem[] = [];

  private isPanning = false;
  private panStartScreen = { x: 0, y: 0 };
  private panStartOffset = { x: 0, y: 0 };

  private activeItem: WorkspaceCanvasItem | null = null;
  private dragOffset = { x: 0, y: 0 };
  private zIndexCounter = 100;

  private focusedItem: WorkspaceCanvasItem | null = null;
  private saveWhiteboardTimeoutId: ReturnType<typeof setTimeout> | null = null;
  constructor(private cdr: ChangeDetectorRef) {}

  get activeWhiteboard(): Whiteboard {
    return (
      this.whiteboards.find((board) => board.id === this.selectedWhiteboardId) ??
      this.whiteboards[0] ?? { id: '', name: '', items: [] }
    );
  }

  get items(): WorkspaceCanvasItem[] {
    return this.activeWhiteboard.items;
  }
  /**
   * Uniform scale + offset that fits the board's content bounds (all canvas items
   * plus the current viewport) inside the minimap without distortion or overflow.
   */
  private get minimapLayout() {
    const miniMapEl = this.miniMapRef.nativeElement;
    const containerWidth = miniMapEl.clientWidth;
    const containerHeight = miniMapEl.clientHeight;

    const viewportEl = this.viewportRef.nativeElement;
    const visibleLeft = -this.panX / this.zoom;
    const visibleTop = -this.panY / this.zoom;
    const visibleRight = visibleLeft + viewportEl.clientWidth / this.zoom;
    const visibleBottom = visibleTop + viewportEl.clientHeight / this.zoom;

    let minX = visibleLeft;
    let minY = visibleTop;
    let maxX = visibleRight;
    let maxY = visibleBottom;

    this.items.forEach((item) => {
      minX = Math.min(minX, item.x);
      minY = Math.min(minY, item.y);
      maxX = Math.max(maxX, item.x + item.width);
      maxY = Math.max(maxY, item.y + item.height);
    });

    minX -= MINIMAP_BOUNDS_PADDING;
    minY -= MINIMAP_BOUNDS_PADDING;
    maxX += MINIMAP_BOUNDS_PADDING;
    maxY += MINIMAP_BOUNDS_PADDING;

    const boundsWidth = Math.max(maxX - minX, 1);
    const boundsHeight = Math.max(maxY - minY, 1);

    const scale = Math.min(containerWidth / boundsWidth, containerHeight / boundsHeight);
    const offsetX = (containerWidth - boundsWidth * scale) / 2;
    const offsetY = (containerHeight - boundsHeight * scale) / 2;

    return { minX, minY, scale, offsetX, offsetY };
  }

  get minimapViewportStyle() {
    const { minX, minY, scale, offsetX, offsetY } = this.minimapLayout;
    const viewportEl = this.viewportRef.nativeElement;
    const visibleWidth = viewportEl.clientWidth / this.zoom;
    const visibleHeight = viewportEl.clientHeight / this.zoom;
    const visibleLeft = -this.panX / this.zoom;
    const visibleTop = -this.panY / this.zoom;

    return {
      left: `${(visibleLeft - minX) * scale + offsetX}px`,
      top: `${(visibleTop - minY) * scale + offsetY}px`,
      width: `${visibleWidth * scale}px`,
      height: `${visibleHeight * scale}px`,
    };
  }

  get canvasTransform(): string {
    return `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  get zoomPercent(): number {
    return Math.round(this.zoom * 100);
  }

  ngOnInit() {
    this.setValuesFromLocalStorage();
    this.getCanvasItem();
  }

  setValuesFromLocalStorage() {
    this.zoom = parseFloat(localStorage.getItem('zoom') ?? '0.5');
    this.panX = parseFloat(
      localStorage.getItem('pan')
        ? JSON.parse(localStorage.getItem('pan') ?? '{"x":0,"y":0}').x
        : '0',
    );
    this.panY = parseFloat(
      localStorage.getItem('pan')
        ? JSON.parse(localStorage.getItem('pan') ?? '{"x":0,"y":0}').y
        : '0',
    );
  }

  getCanvasItem() {
    this.isLoading = true;
    this.http
      .get(GET_ALL_PROJECTS_ENDPOINT)
      .pipe(
        switchMap((res) => {
          const projects = (res as any)?.data as {
            id: string;
            name: string;
            description: string;
            created_at: string;
            updated_at: string;
            default: boolean;
          }[];
          this.whiteboards = projects
            .map((project) => ({
              id: project.id,
              name: project.name,
              items: [],
              default: project.default,
            }))
            .sort((a, b) => Number(b.default) - Number(a.default));
          this.selectedWhiteboardId =
            projects.find((project) => project.default)?.id ?? projects[0]?.id ?? '';
          return this.http.get(GET_CANVAS_ITEM_ENDPOINT, {
            params: { projectId: this.selectedWhiteboardId },
          });
        }),
        finalize(() => {
          this.isLoading = false;
        }),
      )
      .subscribe({
        next: (res) => {
          const items = (res as any)?.data as WorkspaceCanvasItem[];
          this.canvasItemResponse = items;
          const itemsByProject = new Map<string, typeof items>();

          items.forEach((item) => {
            const list = itemsByProject.get(item.projectId) ?? [];
            list.push(item);
            itemsByProject.set(item.projectId, list);
          });

          this.whiteboards.forEach((board) => {
            board.items = itemsByProject.get(board.id) ?? [];
          });
        },
        error: (err) => {
          console.error('Failed to retrieve canvas items', err);
        },
      });
  }

  isDragging(item: WorkspaceCanvasItem): boolean {
    return this.activeItem === item;
  }

  isFocused(item: WorkspaceCanvasItem): boolean {
    return this.focusedItem === item;
  }

  trackByItemId(index: number, item: WorkspaceCanvasItem): number {
    return item.id ?? -index - 1;
  }

  onWhiteboardChange(id: string) {
    this.selectedWhiteboardId = id;
    this.activeItem = null;
    this.focusedItem = null;
    this.isPanning = false;
    this.resetView();
  }

  onInsertItem(event: InsertToolEvent) {
    const newItem = this.createItemForInsert(event);
    this.focusedItem = newItem;
    if (!newItem) {
      return;
    }

    newItem.zIndex = ++this.zIndexCounter;
    this.activeWhiteboard.items.push(newItem);
    this.onSaveWhiteboard();
  }

  deleteItem(event: Event, item: WorkspaceCanvasItem) {
    event.stopPropagation();
    if (item.id === undefined) {
      return;
    }

    this.http.post('/api/delete-canvas-item', { id: item.id, type: item.type }).subscribe({
      next: (res) => {
        console.log('Canvas item deleted successfully', res);
        const board = this.activeWhiteboard;
        board.items = board.items.filter((candidate) => candidate.id !== item.id);

        if (this.activeItem === item) {
          this.activeItem = null;
        }
        if (this.focusedItem === item) {
          this.focusedItem = null;
        }
      },
      error: (err) => {
        console.error('Failed to delete canvas item', err);
      },
    });
  }

  minimapItemStyle(item: WorkspaceCanvasItem) {
    const { minX, minY, scale, offsetX, offsetY } = this.minimapLayout;
    return {
      left: `${(item.x - minX) * scale + offsetX}px`,
      top: `${(item.y - minY) * scale + offsetY}px`,
      width: `${item.width * scale}px`,
      height: `${item.height * scale}px`,
    };
  }

  onMinimapMouseDown(event: MouseEvent) {
    event.stopPropagation();

    const rect = this.miniMapRef.nativeElement.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const { minX, minY, scale, offsetX, offsetY } = this.minimapLayout;
    const worldX = (clickX - offsetX) / scale + minX;
    const worldY = (clickY - offsetY) / scale + minY;

    const viewportEl = this.viewportRef.nativeElement;
    this.panX = viewportEl.clientWidth / 2 - worldX * this.zoom;
    this.panY = viewportEl.clientHeight / 2 - worldY * this.zoom;
  }

  onCanvasMouseDown(event: MouseEvent) {
    if (event.button !== 0) {
      return;
    }
    this.focusedItem = null;
    this.isPanning = true;
    this.panStartScreen = { x: event.clientX, y: event.clientY };
    this.panStartOffset = { x: this.panX, y: this.panY };
  }

  onItemMouseDown(event: MouseEvent, item: WorkspaceCanvasItem) {
    event.stopPropagation();
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (target?.closest('button, select, a, .resize-handle, .item-delete-btn')) {
      return;
    }

    this.activeItem = item;
    this.focusedItem = item;
    item.zIndex = ++this.zIndexCounter;

    const canvasPoint = this.screenToCanvasPoint(event.clientX, event.clientY);
    this.dragOffset = { x: canvasPoint.x - item.x, y: canvasPoint.y - item.y };
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent) {
    if (this.activeItem) {
      const canvasPoint = this.screenToCanvasPoint(event.clientX, event.clientY);
      this.activeItem.x = canvasPoint.x - this.dragOffset.x;
      this.activeItem.y = canvasPoint.y - this.dragOffset.y;
      return;
    }

    if (this.isPanning) {
      this.panX = this.panStartOffset.x + (event.clientX - this.panStartScreen.x);
      this.panY = this.panStartOffset.y + (event.clientY - this.panStartScreen.y);
    }
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp() {
    this.isPanning = false;

    if (this.activeItem) {
      this.activeItem = null;
      this.scheduleWhiteboardSave();
      return;
    }

    this.activeItem = null;
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeyDown(event: KeyboardEvent) {
    if (!this.focusedItem) {
      return;
    }

    const activeElement = document.activeElement as HTMLElement | null;
    const isTypingTarget =
      activeElement?.tagName === 'INPUT' ||
      activeElement?.tagName === 'TEXTAREA' ||
      activeElement?.isContentEditable;

    if (isTypingTarget) {
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.deleteItem(event, this.focusedItem);
    }
  }

  onWheelZoom(event: WheelEvent) {
    const target = event.target as HTMLElement;
    if (this.focusedItem && target.closest('.canvas-item.is-focused')) {
      return;
    }

    event.preventDefault();

    // browsers report trackpad pinch gestures as wheel events with ctrlKey set
    if (event.ctrlKey) {
      const clampedDelta = Math.max(
        -MAX_ZOOM_WHEEL_DELTA,
        Math.min(MAX_ZOOM_WHEEL_DELTA, event.deltaY),
      );
      const factor = Math.exp(-clampedDelta * ZOOM_WHEEL_SENSITIVITY);
      this.zoomAtPoint(this.zoom * factor, event.clientX, event.clientY);
      return;
    }

    // two-finger trackpad drag pans the canvas
    this.panX -= event.deltaX;
    this.panY -= event.deltaY;
    setTimeout(() => {
      localStorage.setItem('pan', JSON.stringify({ x: this.panX, y: this.panY }));
    }, 2000);
  }

  zoomIn() {
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    this.zoomAtPoint(this.zoom + ZOOM_STEP, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  zoomOut() {
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    this.zoomAtPoint(this.zoom - ZOOM_STEP, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  resetView() {
    this.zoom = 0.5;
    this.panX = 0;
    this.panY = 0;
    setTimeout(() => {
      localStorage.setItem('zoom', this.zoom.toString());
    }, 2000);
  }

  private zoomAtPoint(nextZoom: number, clientX: number, clientY: number) {
    const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;

    const canvasX = (screenX - this.panX) / this.zoom;
    const canvasY = (screenY - this.panY) / this.zoom;

    this.panX = screenX - canvasX * clampedZoom;
    this.panY = screenY - canvasY * clampedZoom;
    this.zoom = clampedZoom;
    setTimeout(() => {
      localStorage.setItem('zoom', this.zoom.toString());
    }, 2000);
  }

  private screenToCanvasPoint(clientX: number, clientY: number) {
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    return {
      x: (screenX - this.panX) / this.zoom,
      y: (screenY - this.panY) / this.zoom,
    };
  }

  private viewportCenterCanvasPoint() {
    const rect = this.viewportRef.nativeElement.getBoundingClientRect();
    return this.screenToCanvasPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  getItemId(type: EnumWorkspaceItemType): string {
    const itemType = this.activeWhiteboard.items.filter((item) => item.type === type);
    return `${type}-${itemType.length + 1}`;
  }

  private createItemForInsert(event: InsertToolEvent): WorkspaceCanvasItem | null {
    const center = this.viewportCenterCanvasPoint();
    const projectId = this.activeWhiteboard.id;

    switch (event.type) {
      case EnumWorkspaceItemType.STICKY_NOTE: {
        if (!event.color) {
          return null;
        }

        // const randomNumber1To3 = (): number => {
        //   return Math.floor(Math.random() * 7) - 3;
        // };
        return {
          // id: this.getItemId(EnumWorkspaceItemType.STICKY_NOTE),
          projectId,
          type: EnumWorkspaceItemType.STICKY_NOTE,
          x: center.x - STICKY_NOTE_SIZE / 2,
          y: center.y - STICKY_NOTE_SIZE / 2,
          zIndex: 0,
          label: '',
          content: '',
          bgColor: event.color.bgColor,
          textColor: event.color.textColor,
          rotation: 0, //randomNumber1To3(),
          icon: '',
          width: STICKY_NOTE_SIZE,
          height: STICKY_NOTE_SIZE,
        };
      }
      case EnumWorkspaceItemType.TEXT:
        return {
          // id: this.getItemId(EnumWorkspaceItemType.TEXT),
          projectId,
          type: EnumWorkspaceItemType.TEXT,
          x: center.x - DEFAULT_TEXT_WIDTH / 2,
          y: center.y - DEFAULT_TEXT_HEIGHT / 2,
          zIndex: 0,
          content: 'Text goes here...',
          fontSize: DEFAULT_TEXT_FONT_SIZE,
          color: DEFAULT_TEXT_COLOR,
          width: DEFAULT_TEXT_WIDTH,
          height: DEFAULT_TEXT_HEIGHT,
        };
      case EnumWorkspaceItemType.LINK:
        return {
          // id: this.getItemId(EnumWorkspaceItemType.LINK),
          projectId,
          type: EnumWorkspaceItemType.LINK,
          x: center.x - DEFAULT_LINK_WIDTH / 2,
          y: center.y - DEFAULT_LINK_HEIGHT / 2,
          zIndex: 0,
          title: 'Link title',
          url: 'https://example.com',
          width: DEFAULT_LINK_WIDTH,
          height: DEFAULT_LINK_HEIGHT,
        };
      case EnumWorkspaceItemType.CODE_SNIPPET:
        return {
          // id: this.getItemId(EnumWorkspaceItemType.CODE_SNIPPET),
          projectId,
          type: EnumWorkspaceItemType.CODE_SNIPPET,
          x: center.x - DEFAULT_CODE_SNIPPET_WIDTH / 2,
          y: center.y - DEFAULT_CODE_SNIPPET_HEIGHT / 2,
          zIndex: 0,
          fileName: DEFAULT_CODE_SNIPPET_FILE_NAME,
          code: 'Code goes here...',
          language: DEFAULT_CODE_SNIPPET_LANGUAGE,
          width: DEFAULT_CODE_SNIPPET_WIDTH,
          height: DEFAULT_CODE_SNIPPET_HEIGHT,
        };
      case EnumWorkspaceItemType.IMAGE:
        return {
          // id: this.getItemId(EnumWorkspaceItemType.IMAGE),
          projectId,
          type: EnumWorkspaceItemType.IMAGE,
          x: center.x - 100,
          y: center.y - 100,
          zIndex: 0,
          fileName: '',
          imageUrl: '',
          imageAlt: '',
          width: 200,
          height: 200,
          statusIcon: 'warning',
          statusIconClass: 'text-error',
          grayscaleHover: false,
        };
      default:
        return null;
    }
  }
  ngOnDestroy() {
    this.cancelPendingWhiteboardSave();
  }

  onSaveWhiteboard() {
    if (!this.focusedItem) {
      return;
    }
    this.isCanvasLoading = true;
    const itemToSave = this.focusedItem;
    this.http.post<SaveCanvasItemResponse>(SAVE_CANVAS_ITEM_ENDPOINT, itemToSave).subscribe({
      next: (res) => {
        itemToSave.id = res.data.id;
        console.log('Canvas item saved successfully', res);
        setTimeout(() => {
          this.isCanvasLoading = false;
          this.cdr.detectChanges();
        }, 1000);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Failed to save canvas item', err);
        this.isCanvasLoading = false;
        this.cdr.detectChanges();
      },
    });
  }

  private scheduleWhiteboardSave() {
    this.cancelPendingWhiteboardSave();
    this.saveWhiteboardTimeoutId = setTimeout(() => {
      this.saveWhiteboardTimeoutId = null;
      this.onSaveWhiteboard();
    }, SAVE_WHITEBOARD_DELAY_MS);
  }

  private cancelPendingWhiteboardSave() {
    if (this.saveWhiteboardTimeoutId !== null) {
      clearTimeout(this.saveWhiteboardTimeoutId);
      this.saveWhiteboardTimeoutId = null;
    }
  }
}
