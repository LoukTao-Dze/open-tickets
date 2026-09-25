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
import {
  Whiteboard,
  WorkspaceCanvasItem,
  WorkspaceGroup,
} from '../../interface/workspace.interface';
import { environment } from '../../../environments/environment';
import { switchMap } from 'rxjs';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import {
  computeGroupBounds,
  generateGroupOutline,
  GroupBounds,
  GroupOutline,
  isPointInsideOutline,
} from './shared/group-outline.util';

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
const SAVE_WHITEBOARD_DELAY_MS = 500;
const SAVE_CANVAS_ITEM_ENDPOINT = `${environment.apiBaseUrl}/api/canvas/save-canvas-item`;
const GET_CANVAS_ITEM_ENDPOINT = `${environment.apiBaseUrl}/api/canvas/get-canvas-item`;
const DELETE_CANVAS_ITEM_ENDPOINT = `${environment.apiBaseUrl}/api/canvas/delete-canvas-item`;
const GET_ALL_PROJECTS_ENDPOINT = `${environment.apiBaseUrl}/api/projects`;

// items overlapping past this ratio of the smaller item's area are auto-grouped
const GROUP_OVERLAP_THRESHOLD = 0.05;
// gap kept between an item and its group mates once grouped, so they never overlap
const GROUP_ITEM_GAP = 10;
// safety cap on separation passes when resolving overlaps between many mates
const MAX_OVERLAP_RESOLUTION_PASSES = 20;
// dragging a grouped item this far away from its group mates splits it back out
const GROUP_UNGROUP_DISTANCE = 200;
const DEFAULT_GROUP_NAME = 'NAME';

interface SaveCanvasItemResponse {
  data: {
    id: number;
  };
}

interface ViewportState {
  boardId: string;
  zoom: number;
  panX: number;
  panY: number;
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

  private readonly confirmDialogService = inject(ConfirmDialogService);
  private readonly cdr = inject(ChangeDetectorRef);

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
  private activeGroup: WorkspaceGroup | null = null;
  private groupDragOrigin = { x: 0, y: 0 };
  private groupItemOrigins = new Map<WorkspaceCanvasItem, { x: number; y: number }>();
  hoveredGroupId: string | null = null;
  groupingEnabled = true;
  private zIndexCounter = 100;
  private currentViewportState: ViewportState[] = [];

  focusedItem: WorkspaceCanvasItem | null = null;
  editingGroupId: string | null = null;
  private saveWhiteboardTimeoutId: ReturnType<typeof setTimeout> | null = null;

  get activeWhiteboard(): Whiteboard {
    return (
      this.whiteboards.find((board) => board.id === this.selectedWhiteboardId) ??
      this.whiteboards[0] ?? { id: '', name: '', items: [] }
    );
  }

  get canvasList(): WorkspaceCanvasItem[] {
    return this.activeWhiteboard.items;
  }

  get canvasGroups(): WorkspaceGroup[] {
    return this.activeWhiteboard.groups ?? [];
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

    this.canvasList.forEach((item) => {
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
    this.getCanvasItem();
    this.setValuesFromLocalStorage();
  }

  setValuesFromLocalStorage() {
    this.selectedWhiteboardId = localStorage.getItem('selectedWhiteboardId') ?? '';
    this.groupingEnabled = localStorage.getItem('groupingEnabled') === 'true';
    try {
      const storedViewportState = JSON.parse(localStorage.getItem('viewportState') ?? '[]');
      this.currentViewportState = Array.isArray(storedViewportState)
        ? storedViewportState.filter((state): state is ViewportState => Boolean(state?.boardId))
        : [];
    } catch {
      this.currentViewportState = [];
    }
    this.applyViewportState(this.selectedWhiteboardId);
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
            projects.find((project) =>
              this.selectedWhiteboardId
                ? project.id === this.selectedWhiteboardId
                : project.default,
            )?.id ??
            projects[0]?.id ??
            '';
          this.applyViewportState(this.selectedWhiteboardId);
          return this.http.get(GET_CANVAS_ITEM_ENDPOINT, {
            params: { projectId: this.selectedWhiteboardId },
          });
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
          this.isLoading = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isLoading = false;
          this.cdr.markForCheck();
          console.error('Failed to retrieve canvas items', err);
        },
      });
  }

  isDragging(item: WorkspaceCanvasItem): boolean {
    return this.activeItem === item || (this.activeGroup?.items.includes(item) ?? false);
  }

  isFocused(item: WorkspaceCanvasItem): boolean {
    return this.focusedItem === item;
  }

  trackByItemId(index: number, item: WorkspaceCanvasItem): number | string {
    return item?.id ?? index;
  }

  onWhiteboardChange(id: string) {
    this.selectedWhiteboardId = id;
    localStorage.setItem('selectedWhiteboardId', this.selectedWhiteboardId);
    this.activeItem = null;
    this.focusedItem = null;
    this.isPanning = false;
    this.applyViewportState(id);
    this.getCanvasItem();
  }

  onInsertItem(event: InsertToolEvent) {
    const newItem = this.createItemForInsert(event);
    this.focusedItem = newItem;
    if (!newItem) {
      return;
    }

    newItem.zIndex = ++this.zIndexCounter;
    this.activeWhiteboard.items.push(newItem);
    this.scheduleWhiteboardSave();
  }

  onToggleGrouping(enabled: boolean) {
    localStorage.setItem('groupingEnabled', String(enabled));
    this.groupingEnabled = enabled;
    if (!enabled) {
      this.hoveredGroupId = null;
    }
  }

  onDeleteItem(event: Event, item: WorkspaceCanvasItem) {
    event.stopPropagation();
    this.confirmDialogService
      .confirm({
        title: 'Delete Item',
        message: 'Are you sure you want to delete this item?',
        cancelText: 'Cancel',
        confirmText: 'Delete',
        config: {
          disableClose: false,
          confirmColor: 'error',
          cancelColor: 'neutral',
        },
      })
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.deleteItem(item);
      });
  }

  deleteItem(item: WorkspaceCanvasItem) {
    this.http.post(DELETE_CANVAS_ITEM_ENDPOINT, { id: item.id, type: item.type }).subscribe({
      next: (res) => {
        const board = this.activeWhiteboard;
        board.items = board.items.filter((candidate) => candidate.id !== item.id);
        this.removeItemFromGroups(board, item);

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

    const canvasPoint = this.screenToCanvasPoint(event.clientX, event.clientY);

    this.canvasList.map((canvasItem) => {
      if (canvasItem !== item && canvasItem.zIndex >= item.zIndex) {
        canvasItem.zIndex--;
      } else if (canvasItem === item) {
        canvasItem.zIndex = this.canvasList.length + 1;
      }
    });

    if (item.type === 'sticky-note' && item.isBack) {
      this.activeItem = item;
      this.activeItem.zIndex = 0;
    } else {
      this.activeItem = item;
    }
    this.focusedItem = item;
    this.dragOffset = { x: canvasPoint.x - item.x, y: canvasPoint.y - item.y };
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent) {
    if (this.activeGroup) {
      const canvasPoint = this.screenToCanvasPoint(event.clientX, event.clientY);
      const dx = canvasPoint.x - this.groupDragOrigin.x;
      const dy = canvasPoint.y - this.groupDragOrigin.y;
      this.activeGroup.items.forEach((groupItem) => {
        const origin = this.groupItemOrigins.get(groupItem);
        if (origin) {
          groupItem.x = origin.x + dx;
          groupItem.y = origin.y + dy;
        }
      });
      return;
    }

    if (this.activeItem) {
      const canvasPoint = this.screenToCanvasPoint(event.clientX, event.clientY);
      this.activeItem.x = canvasPoint.x - this.dragOffset.x;
      this.activeItem.y = canvasPoint.y - this.dragOffset.y;
      this.checkUngroupByDistance(this.activeWhiteboard, this.activeItem);
      this.updateHoveredGroup(this.activeItem);
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

    if (this.activeGroup) {
      const groupItems = [...this.activeGroup.items];
      groupItems.forEach((groupItem) =>
        this.handleGroupingOnDrop(groupItem, { reposition: false }),
      );
      this.activeGroup = null;
      this.groupItemOrigins.clear();
      this.scheduleWhiteboardSave();
      return;
    }

    if (this.activeItem) {
      this.handleGroupingOnDrop(this.activeItem);
      this.activeItem = null;
      this.hoveredGroupId = null;
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
      this.onDeleteItem(event, this.focusedItem);
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
    this.saveViewportState();
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
    this.saveViewportState();
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
    this.saveViewportState();
  }

  private applyViewportState(boardId: string) {
    const viewportState = this.currentViewportState.find((state) => state.boardId === boardId);
    this.panX = viewportState?.panX ?? 0;
    this.panY = viewportState?.panY ?? 0;
    this.zoom = viewportState?.zoom ?? 0.5;
  }

  private saveViewportState() {
    setTimeout(() => {
      const boardId = this.activeWhiteboard.id;
      if (!boardId) {
        return;
      }

      const viewportState: ViewportState = {
        boardId,
        panX: this.panX,
        panY: this.panY,
        zoom: this.zoom,
      };
      const index = this.currentViewportState.findIndex((state) => state.boardId === boardId);
      if (index === -1) {
        this.currentViewportState.push(viewportState);
      } else {
        this.currentViewportState[index] = viewportState;
      }
      localStorage.setItem('viewportState', JSON.stringify(this.currentViewportState));
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

  trackByGroupId(index: number, group: WorkspaceGroup): string {
    return group?.id ?? `${index}`;
  }

  isGroupHovered(group: WorkspaceGroup): boolean {
    return this.hoveredGroupId === group.id;
  }

  groupOutline(group: WorkspaceGroup): GroupOutline {
    return generateGroupOutline(group.items, group.seed);
  }

  groupLabelStyle(group: WorkspaceGroup) {
    const { topPoint } = generateGroupOutline(group.items, group.seed);
    return {
      left: `${topPoint.x}px`,
      top: `${topPoint.y}px`,
    };
  }

  onGroupNameBlur(event: FocusEvent, group: WorkspaceGroup) {
    const value = (event.target as HTMLElement).innerText.trim();
    group.name = value || DEFAULT_GROUP_NAME;
    this.editingGroupId = null;
  }

  isEditingGroupName(group: WorkspaceGroup): boolean {
    return this.editingGroupId === group.id;
  }

  onGroupLabelDoubleClick(event: MouseEvent, group: WorkspaceGroup) {
    event.stopPropagation();
    this.editingGroupId = group.id;
    const target = event.currentTarget as HTMLElement;
    requestAnimationFrame(() => target.focus());
  }

  onGroupLabelMouseDown(event: MouseEvent, group: WorkspaceGroup) {
    event.stopPropagation();
    if (this.editingGroupId === group.id || event.button !== 0) {
      return;
    }
    const canvasPoint = this.screenToCanvasPoint(event.clientX, event.clientY);
    this.beginGroupDrag(group, canvasPoint);
  }

  onGroupOutlineMouseDown(event: MouseEvent, group: WorkspaceGroup) {
    event.stopPropagation();
    if (event.button !== 0) {
      return;
    }
    const canvasPoint = this.screenToCanvasPoint(event.clientX, event.clientY);
    this.beginGroupDrag(group, canvasPoint);
  }

  private getOverlapRatio(a: WorkspaceCanvasItem, b: WorkspaceCanvasItem): number {
    const intersectionWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const intersectionHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);

    if (intersectionWidth <= 0 || intersectionHeight <= 0) {
      return 0;
    }

    const intersectionArea = intersectionWidth * intersectionHeight;
    const smallerArea = Math.min(a.width * a.height, b.width * b.height);
    return smallerArea > 0 ? intersectionArea / smallerArea : 0;
  }

  private findGroupContaining(
    board: Whiteboard,
    item: WorkspaceCanvasItem,
  ): WorkspaceGroup | undefined {
    return (board.groups ?? []).find((group) => group.items.includes(item));
  }

  /** Highlights the group whose loop the dragged item currently sits inside, if any. */
  private updateHoveredGroup(item: WorkspaceCanvasItem) {
    if (!this.groupingEnabled) {
      this.hoveredGroupId = null;
      return;
    }

    const itemCenter = { x: item.x + item.width / 2, y: item.y + item.height / 2 };
    const hoveredGroup = (this.activeWhiteboard.groups ?? []).find(
      (group) =>
        !group.items.includes(item) &&
        isPointInsideOutline(generateGroupOutline(group.items, group.seed), itemCenter),
    );
    this.hoveredGroupId = hoveredGroup?.id ?? null;
  }

  private removeItemFromGroups(board: Whiteboard, item: WorkspaceCanvasItem) {
    const group = this.findGroupContaining(board, item);
    if (!group) {
      return;
    }

    group.items = group.items.filter((candidate) => candidate !== item);
    if (group.items.length < 2) {
      board.groups = (board.groups ?? []).filter((candidate) => candidate !== group);
    }
  }

  private bringItemsToFront(items: WorkspaceCanvasItem[]) {
    items.forEach((item) => {
      item.zIndex = ++this.zIndexCounter;
    });
  }

  private beginGroupDrag(group: WorkspaceGroup, canvasPoint: { x: number; y: number }) {
    this.bringItemsToFront(group.items);
    this.activeGroup = group;
    this.groupDragOrigin = canvasPoint;
    this.groupItemOrigins.clear();
    group.items.forEach((groupItem) =>
      this.groupItemOrigins.set(groupItem, { x: groupItem.x, y: groupItem.y }),
    );
  }

  private rectDistance(a: GroupBounds, b: GroupBounds): number {
    const dx = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0);
    const dy = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0);
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** Splits an item out of its group the moment it's dragged GROUP_UNGROUP_DISTANCE away from its mates. */
  private checkUngroupByDistance(board: Whiteboard, item: WorkspaceCanvasItem) {
    const previousGroup = this.findGroupContaining(board, item);
    if (!previousGroup) {
      return;
    }

    const groupMates = previousGroup.items.filter((candidate) => candidate !== item);
    if (groupMates.length === 0) {
      return;
    }

    const itemBounds: GroupBounds = {
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
    };
    if (this.rectDistance(itemBounds, computeGroupBounds(groupMates)) <= GROUP_UNGROUP_DISTANCE) {
      return;
    }

    previousGroup.items = groupMates;
    if (previousGroup.items.length < 2) {
      board.groups = (board.groups ?? []).filter((group) => group !== previousGroup);
    }
  }

  /**
   * Keeps the dropped item at the position the user released it at, only nudging it
   * away from any group mates it overlaps (by the shortest axis) so a GROUP_ITEM_GAP
   * gap separates every item. Runs several passes since separating one mate can
   * introduce a new overlap with another.
   */
  private resolveOverlapPosition(item: WorkspaceCanvasItem, groupMates: WorkspaceCanvasItem[]) {
    for (let pass = 0; pass < MAX_OVERLAP_RESOLUTION_PASSES; pass++) {
      let didSeparate = false;

      for (const mate of groupMates) {
        const overlapX =
          Math.min(item.x + item.width, mate.x + mate.width) - Math.max(item.x, mate.x);
        const overlapY =
          Math.min(item.y + item.height, mate.y + mate.height) - Math.max(item.y, mate.y);

        if (overlapX <= -GROUP_ITEM_GAP || overlapY <= -GROUP_ITEM_GAP) {
          continue;
        }

        const pushX = overlapX + GROUP_ITEM_GAP;
        const pushY = overlapY + GROUP_ITEM_GAP;
        const itemCenterX = item.x + item.width / 2;
        const itemCenterY = item.y + item.height / 2;
        const mateCenterX = mate.x + mate.width / 2;
        const mateCenterY = mate.y + mate.height / 2;

        if (pushX < pushY) {
          item.x += itemCenterX < mateCenterX ? -pushX : pushX;
        } else {
          item.y += itemCenterY < mateCenterY ? -pushY : pushY;
        }
        didSeparate = true;
      }

      if (!didSeparate) {
        break;
      }
    }
  }

  /**
   * Auto-groups items that end a drag overlapping another item by more than
   * GROUP_OVERLAP_THRESHOLD, or that get dropped inside an existing group's hand-drawn
   * loop (see group-outline.util.ts) even without touching another item directly.
   * Overlapping drops stay right where the user dropped them, just nudged apart from
   * their new group mates by GROUP_ITEM_GAP so nothing overlaps.
   * Dragging a grouped item more than GROUP_UNGROUP_DISTANCE away from its group
   * mates splits it back out.
   */
  private handleGroupingOnDrop(item: WorkspaceCanvasItem, options: { reposition?: boolean } = {}) {
    const { reposition = true } = options;
    const board = this.activeWhiteboard;
    board.groups = board.groups ?? [];

    this.checkUngroupByDistance(board, item);

    if (!this.groupingEnabled) {
      return;
    }

    const overlappingItems = board.items.filter(
      (candidate) =>
        candidate !== item && this.getOverlapRatio(item, candidate) > GROUP_OVERLAP_THRESHOLD,
    );

    const itemCenter = { x: item.x + item.width / 2, y: item.y + item.height / 2 };
    const enclosingGroups = board.groups.filter(
      (group) =>
        !group.items.includes(item) &&
        isPointInsideOutline(generateGroupOutline(group.items, group.seed), itemCenter),
    );

    if (overlappingItems.length === 0 && enclosingGroups.length === 0) {
      return;
    }

    const involvedGroups = new Set<WorkspaceGroup>(enclosingGroups);
    const droppedItemGroup = this.findGroupContaining(board, item);
    if (droppedItemGroup) {
      involvedGroups.add(droppedItemGroup);
    }
    overlappingItems.forEach((candidate) => {
      const group = this.findGroupContaining(board, candidate);
      if (group) {
        involvedGroups.add(group);
      }
    });

    const mergedItems = new Set<WorkspaceCanvasItem>([item, ...overlappingItems]);
    involvedGroups.forEach((group) =>
      group.items.forEach((groupItem) => mergedItems.add(groupItem)),
    );

    if (reposition && overlappingItems.length > 0) {
      const groupMates = Array.from(mergedItems).filter((candidate) => candidate !== item);
      this.resolveOverlapPosition(item, groupMates);
    }

    const existingName = involvedGroups.values().next().value?.name;
    board.groups = board.groups.filter((group) => !involvedGroups.has(group));
    board.groups.push({
      id: crypto.randomUUID(),
      name: existingName ?? DEFAULT_GROUP_NAME,
      seed: Math.floor(Math.random() * 1_000_000),
      items: Array.from(mergedItems),
    });
  }

  onSaveWhiteboard() {
    if (!this.focusedItem) {
      return;
    }
    this.isCanvasLoading = true;
    const itemToSave = this.focusedItem;
    this.http.post<SaveCanvasItemResponse>(SAVE_CANVAS_ITEM_ENDPOINT, itemToSave).subscribe({
      next: (res) => {
        itemToSave.id = res?.data?.id;
        console.log('Canvas item saved successfully', res);
        setTimeout(() => {
          this.isCanvasLoading = false;
        }, 1000);
      },
      error: (err) => {
        console.error('Failed to save canvas item', err);
        this.isCanvasLoading = false;
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
