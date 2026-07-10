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

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;
const MINIMAP_WORLD_WIDTH = 2000;
const MINIMAP_WORLD_HEIGHT = 1400;

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
  get minimapScaleX(): number {
    return this.miniMapRef.nativeElement.clientWidth / MINIMAP_WORLD_WIDTH;
  }

  get minimapScaleY(): number {
    return this.miniMapRef.nativeElement.clientHeight / MINIMAP_WORLD_HEIGHT;
  }

  get minimapViewportStyle() {
    const viewportEl = this.viewportRef.nativeElement;
    const visibleWidth = viewportEl.clientWidth / this.zoom;
    const visibleHeight = viewportEl.clientHeight / this.zoom;
    const visibleLeft = -this.panX / this.zoom;
    const visibleTop = -this.panY / this.zoom;

    return {
      left: `${visibleLeft * this.minimapScaleX}px`,
      top: `${visibleTop * this.minimapScaleY}px`,
      width: `${visibleWidth * this.minimapScaleX}px`,
      height: `${visibleHeight * this.minimapScaleY}px`,
    };
  }

  get canvasTransform(): string {
    return `translate(${this.panX}px, ${this.panY}px) scale(${this.zoom})`;
  }

  get zoomPercent(): number {
    return Math.round(this.zoom * 100);
  }

  ngOnInit() {
    this.getCanvasItem();
  }

  getCanvasItem() {
    this.isLoading = true;

    this.http
      .get(GET_ALL_PROJECTS_ENDPOINT)
      .pipe(
        switchMap((res) => {
          const projects = (res as any)?.data as { id: string; name: string }[];
          this.whiteboards = projects.map((project) => ({
            id: project.id,
            name: project.name,
            items: [],
          }));
          this.selectedWhiteboardId = this.whiteboards[0]?.id ?? '';
          return this.http.get(GET_CANVAS_ITEM_ENDPOINT, {
            params: { projectId: this.activeWhiteboard.id },
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
          console.info('\x1b[7;31;40m[DEBUGGER] ->> this.whiteboards\x1b[0m', this.whiteboards);
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

  trackByItemId(_index: number, item: WorkspaceCanvasItem): string {
    return item.id;
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
  }

  deleteItem(event: Event, item: WorkspaceCanvasItem) {
    event.stopPropagation();
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
    return {
      left: `${item.x * this.minimapScaleX}px`,
      top: `${item.y * this.minimapScaleY}px`,
    };
  }

  minimapBlockClass(item: WorkspaceCanvasItem): string {
    if (item.type === 'sticky-note' || item.type === 'text') {
      return 'mini-map-block--sm';
    }
    if (item.type === 'code-snippet' || item.type === 'link') {
      return 'mini-map-block--wide';
    }
    return item.width >= item.height ? 'mini-map-block--wide' : 'mini-map-block--tall';
  }

  onMinimapMouseDown(event: MouseEvent) {
    event.stopPropagation();

    const rect = this.miniMapRef.nativeElement.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const worldX = clickX / this.minimapScaleX;
    const worldY = clickY / this.minimapScaleY;

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

    // this.cancelPendingWhiteboardSave();

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
    const factor = event.deltaY < 0 ? 1 + ZOOM_STEP : 1 - ZOOM_STEP;
    this.zoomAtPoint(this.zoom * factor, event.clientX, event.clientY);
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
    const itemType = this.canvasItemResponse.filter((item) => item.type === type);
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

        const randomNumber1To3 = (): number => {
          return Math.floor(Math.random() * 7) - 3;
        };
        return {
          id: this.getItemId(EnumWorkspaceItemType.STICKY_NOTE),
          projectId,
          type: EnumWorkspaceItemType.STICKY_NOTE,
          x: center.x - STICKY_NOTE_SIZE / 2,
          y: center.y - STICKY_NOTE_SIZE / 2,
          zIndex: 0,
          label: '',
          content: '',
          bgColor: event.color.bgColor,
          textColor: event.color.textColor,
          rotation: randomNumber1To3(),
          icon: '',
          width: STICKY_NOTE_SIZE,
          height: STICKY_NOTE_SIZE,
        };
      }
      case EnumWorkspaceItemType.TEXT:
        return {
          id: this.getItemId(EnumWorkspaceItemType.TEXT),
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
          id: this.getItemId(EnumWorkspaceItemType.LINK),
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
          id: this.getItemId(EnumWorkspaceItemType.CODE_SNIPPET),
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
          id: this.getItemId(EnumWorkspaceItemType.IMAGE),
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

    this.http.post(SAVE_CANVAS_ITEM_ENDPOINT, this.focusedItem).subscribe({
      next: (res) => {
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
