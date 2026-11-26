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
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { StickyNoteComponent } from './sticky-note/sticky-note.component';
import { UploadedImageComponent } from './uploaded-image/uploaded-image.component';
import { CodeSnippetComponent } from './code-snippet/code-snippet.component';
import { TextComponent } from './text/text.component';
import { LinkComponent } from './link/link.component';
import { MarkdownComponent } from './markdown/markdown.component';
import { ToolHubsComponent, InsertToolEvent } from './tool-hubs/tool-hubs.component';
import { EnumWorkspaceItemType } from '../../enum/workspace.enum';
import {
  CanvasConnectionAnchor,
  CanvasConnection,
  Whiteboard,
  WorkspaceCanvasItem,
  WorkspaceGroup,
} from '../../interface/workspace.interface';
import { environment } from '../../../environments/environment';
import { finalize, firstValueFrom, forkJoin, map, switchMap } from 'rxjs';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { AuthService } from '../../services/auth.service';
import { isReadOnlyRole } from '../../shared/editor-roles';
import { LoadingOverlayComponent } from '../../shared/loading-overlay/loading-overlay.component';
import {
  CONNECTION_ARROW_REF_X,
  connectionAnchorOffset,
  connectionAnchorPoint,
  connectionArrowClearance,
  connectionArrowMarkerSize,
  connectionArrowSizeForDistance,
  routeCanvasConnection,
} from './connection-routing.util';
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

const STICKY_NOTE_SIZE = 200;
const DEFAULT_TEXT_FONT_SIZE = 20;
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
const CANVAS_CONNECTIONS_ENDPOINT = `${environment.apiBaseUrl}/api/canvas/connections`;
const UPDATE_CANVAS_CONNECTION_ENDPOINT = `${CANVAS_CONNECTIONS_ENDPOINT}/update`;
const DELETE_CANVAS_CONNECTION_ENDPOINT = `${CANVAS_CONNECTIONS_ENDPOINT}/delete`;
const DELETE_CANVAS_ITEMS_ENDPOINT = `${environment.apiBaseUrl}/api/canvas/delete-canvas-items`;
const CANVAS_GROUPS_ENDPOINT = `${environment.apiBaseUrl}/api/canvas/groups`;
const GROUP_PADDING = 24;
const DEFAULT_GROUP_COLOR = '#414752';
const GET_ALL_PROJECTS_ENDPOINT = `${environment.apiBaseUrl}/api/projects`;
const DEFAULT_MARKDOWN_WIDTH = 360;
const DEFAULT_MARKDOWN_HEIGHT = 280;
const DEFAULT_MARKDOWN_CONTENT = '# Untitled\n\nWrite **Markdown** here.';
const CONNECTION_ANCHORS: CanvasConnectionAnchor[] = ['top', 'right', 'bottom', 'left'];
const CONNECTION_ANCHOR_HIT_RADIUS = 12;

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

interface CanvasPoint {
  x: number;
  y: number;
}

interface CanvasBounds extends CanvasPoint {
  width: number;
  height: number;
}

interface ConnectionPath {
  id: number | 'preview';
  path: string;
  connection: CanvasConnection;
  color: string;
  strokeWidth: number;
  markerSize: number;
  selected: boolean;
}

@Component({
  selector: 'app-workspace',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    StickyNoteComponent,
    UploadedImageComponent,
    CodeSnippetComponent,
    TextComponent,
    LinkComponent,
    MarkdownComponent,
    ToolHubsComponent,
    LoadingOverlayComponent,
  ],
  templateUrl: './workspace.component.html',
  styleUrls: ['./workspace.component.scss'],
})
export class WorkspaceComponent implements OnDestroy, OnInit {
  readonly connectionArrowRefX = CONNECTION_ARROW_REF_X;
  @ViewChild('viewport', { static: true }) viewportRef!: ElementRef<HTMLDivElement>;
  @ViewChild('miniMap', { static: true }) miniMapRef!: ElementRef<HTMLDivElement>;

  private readonly http = inject(HttpClient);

  private readonly confirmDialogService = inject(ConfirmDialogService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly auth = inject(AuthService);

  // Deny by default: stays read-only until the server confirms a non-guest role.
  isReadOnly = true;

  zoom = 0.5;
  panX = 0;
  panY = 0;
  EnumWorkspaceItemType = EnumWorkspaceItemType;

  whiteboards: Whiteboard[] = []; //MOCK_WORKSPACES;

  selectedWhiteboardId = '';
  isWhiteboardMenuOpen = false;
  isLoading = false;
  isCanvasLoading = false;
  canvasItemResponse: WorkspaceCanvasItem[] = [];
  interactionTool = EnumWorkspaceItemType.HAND;
  readonly connectionAnchors = CONNECTION_ANCHORS;
  groups: WorkspaceGroup[] = [];
  connections: CanvasConnection[] = [];
  selectedConnectionId: number | null = null;
  connectionColorDraft = '#414752';
  connectionStrokeWidthDraft = 2;
  connectionTarget: { item: WorkspaceCanvasItem; anchor: CanvasConnectionAnchor } | null = null;
  selectedItems: WorkspaceCanvasItem[] = [];
  selectionBounds: CanvasBounds | null = null;
  isNamingGroup = false;
  groupName = '';
  groupColor = DEFAULT_GROUP_COLOR;
  editingGroup: WorkspaceGroup | null = null;
  isSelectionBusy = false;
  actionError = '';
  private selectionStart: CanvasPoint | null = null;
  private groupDrag: {
    group: WorkspaceGroup;
    start: CanvasPoint;
    positions: { item: WorkspaceCanvasItem; x: number; y: number }[];
  } | null = null;
  private pendingSaveItem: WorkspaceCanvasItem | null = null;
  private readonly pendingItemSaves = new Map<WorkspaceCanvasItem, Promise<void>>();
  private readonly failedItemSaves = new Set<WorkspaceCanvasItem>();

  private isPanning = false;
  private panStartScreen = { x: 0, y: 0 };
  private panStartOffset = { x: 0, y: 0 };

  // two-finger touch pinch-to-zoom tracking (keyed by PointerEvent.pointerId)
  private readonly activeTouchPointers = new Map<number, { x: number; y: number }>();
  private isPinching = false;
  private pinchStartDistance = 0;
  private pinchStartZoom = 1;

  private activeItem: WorkspaceCanvasItem | null = null;
  private connectionDrag: {
    source: WorkspaceCanvasItem;
    sourceAnchor: CanvasConnectionAnchor | null;
    point: CanvasPoint;
  } | null = null;
  private dragOffset = { x: 0, y: 0 };
  private zIndexCounter = 100;
  private currentViewportState: ViewportState[] = [];
  private isOnInit = false;

  focusedItem: WorkspaceCanvasItem | null = null;
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

  get isSelecting(): boolean {
    return (
      !!this.selectionBounds &&
      (this.selectionBounds.width > 0 || this.selectionBounds.height > 0)
    );
  }

  get connectionPaths(): ConnectionPath[] {
    return this.connections.flatMap((connection) => {
      const source = this.canvasList.find(
        (item) => item.id === connection.sourceItemId && item.type === connection.sourceItemType,
      );
      const target = this.canvasList.find(
        (item) => item.id === connection.targetItemId && item.type === connection.targetItemType,
      );
      const selected = connection.id === this.selectedConnectionId;
      const color = selected ? this.connectionColorDraft : connection.color;
      const strokeWidth = selected ? this.connectionStrokeWidthDraft : connection.strokeWidth;
      return source && target
        ? [
            {
              id: connection.id,
              path: this.connectionPath(
                source,
                target,
                connection.sourceAnchor,
                connection.targetAnchor,
                strokeWidth,
              ),
              connection,
              color,
              strokeWidth,
              markerSize: connection.targetAnchor
                ? connectionArrowMarkerSize(source, target, connection.targetAnchor, strokeWidth)
                : this.legacyConnectionMarkerSize(source, target, connection, strokeWidth),
              selected,
            },
          ]
        : [];
    });
  }

  get selectedConnection(): CanvasConnection | null {
    return (
      this.connections.find((connection) => connection.id === this.selectedConnectionId) ?? null
    );
  }

  get connectionPreviewPath(): string | null {
    const target = this.connectionTarget;
    return this.connectionDrag
      ? this.connectionPath(
          this.connectionDrag.source,
          target?.item ?? this.connectionDrag.point,
          this.connectionDrag.sourceAnchor,
          target?.anchor,
        )
      : null;
  }

  private findConnectionTarget(): {
    item: WorkspaceCanvasItem;
    anchor: CanvasConnectionAnchor;
  } | null {
    if (!this.connectionDrag) return null;
    const { point, source } = this.connectionDrag;
    const hitRadius = CONNECTION_ANCHOR_HIT_RADIUS / this.zoom;
    for (const item of [...this.canvasList].sort((left, right) => right.zIndex - left.zIndex)) {
      if (item === source) continue;
      const anchor = CONNECTION_ANCHORS.reduce((closest, candidate) =>
        this.anchorDistance(item, candidate, point) < this.anchorDistance(item, closest, point)
          ? candidate
          : closest,
      );
      const inside =
        point.x >= item.x &&
        point.x <= item.x + item.width &&
        point.y >= item.y &&
        point.y <= item.y + item.height;
      if (inside || this.anchorDistance(item, anchor, point) <= hitRadius) {
        return { item, anchor };
      }
    }
    return null;
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
    const session = this.auth.cachedSession;
    if (session) {
      this.isReadOnly = isReadOnlyRole(session.user.role);
    } else {
      console.error('Failed to resolve user role: no cached session.');
    }
    this.isOnInit = true;
    this.getCanvasItem();
    this.setValuesFromLocalStorage();
  }

  setValuesFromLocalStorage() {
    this.selectedWhiteboardId = localStorage.getItem('selectedWhiteboardId') ?? '';
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

  getCanvasItem(preserveViewport = false) {
    if (!this.isOnInit) {
      this.isLoading = true;
    }
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
          const whiteboards = projects
            .map((project) => ({
              id: project.id,
              name: project.name,
              items: [],
              default: project.default,
            }))
            .sort((a, b) => Number(b.default) - Number(a.default));
          const selectedWhiteboardId =
            projects.find((project) =>
              this.selectedWhiteboardId
                ? project.id === this.selectedWhiteboardId
                : project.default,
            )?.id ??
            projects[0]?.id ??
            '';
          const params = { projectId: selectedWhiteboardId };
          return forkJoin({
            items: this.http.get<{ data: WorkspaceCanvasItem[] }>(GET_CANVAS_ITEM_ENDPOINT, {
              params,
            }),
            connections: this.http.get<{ data: CanvasConnection[] }>(CANVAS_CONNECTIONS_ENDPOINT, {
              params,
            }),
            groups: this.http.get<{ data: WorkspaceGroup[]; canEdit: boolean }>(
              CANVAS_GROUPS_ENDPOINT,
              { params },
            ),
          }).pipe(map((response) => ({ ...response, whiteboards, selectedWhiteboardId })));
        }),
        finalize(() => {
          if (preserveViewport) {
            this.isSelectionBusy = false;
            this.cdr.markForCheck();
          }
        }),
      )
      .subscribe({
        next: (res) => {
          const items = res.items.data;
          if (!preserveViewport || this.selectedWhiteboardId !== res.selectedWhiteboardId) {
            this.applyViewportState(res.selectedWhiteboardId);
          }
          this.whiteboards = res.whiteboards;
          this.selectedWhiteboardId = res.selectedWhiteboardId;
          this.clearSelection();
          this.focusedItem = null;
          this.selectedConnectionId = null;
          this.groups = res.groups.data;
          this.connections = res.connections.data;
          this.isReadOnly = !res.groups.canEdit;
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
          if (!this.isOnInit) {
            this.isLoading = false;
          }
          this.cdr.markForCheck();
          if (this.isOnInit) {
            this.isOnInit = false;
          }
        },
        error: (err) => {
          this.isLoading = false;
          this.isOnInit = false;
          this.reportActionError('Failed to load workspace. Reload the page to try again.', err);
        },
      });
  }

  async refreshWorkspace() {
    if (this.isLoading || this.isSelectionBusy) return;
    this.isSelectionBusy = true;
    this.actionError = '';
    try {
      this.blurItemEditor();
      await this.flushItemSaves();
      for (const item of this.failedItemSaves) {
        if (this.canvasList.includes(item)) await this.persistItem(item);
      }
      this.getCanvasItem(true);
    } catch (error) {
      this.isSelectionBusy = false;
      this.reportActionError('Failed to save items before refreshing. Try again.', error);
    } finally {
      this.cdr.markForCheck();
    }
  }

  isDragging(item: WorkspaceCanvasItem): boolean {
    return this.activeItem === item;
  }

  isFocused(item: WorkspaceCanvasItem): boolean {
    return this.focusedItem === item;
  }

  trackByItemId(index: number, item: WorkspaceCanvasItem): number | string {
    return `${item.type}:${item.id ?? index}`;
  }

  onWhiteboardChange(id: string) {
    if (this.isSelectionBusy) return;
    this.clearSelection();
    this.connectionDrag = null;
    this.connectionTarget = null;
    this.groups = [];
    this.connections = [];
    this.selectedConnectionId = null;
    this.selectedWhiteboardId = id;
    localStorage.setItem('selectedWhiteboardId', this.selectedWhiteboardId);
    this.activeItem = null;
    this.focusedItem = null;
    this.isPanning = false;
    this.applyViewportState(id);
    this.getCanvasItem();
  }

  toggleWhiteboardMenu() {
    this.isWhiteboardMenuOpen = !this.isWhiteboardMenuOpen;
  }

  selectWhiteboard(id: string) {
    this.isWhiteboardMenuOpen = false;
    this.onWhiteboardChange(id);
  }

  // closes the whiteboard menu on any interaction outside it, since its own pointerdown stops propagation
  @HostListener('document:pointerdown')
  closeWhiteboardMenu() {
    this.isWhiteboardMenuOpen = false;
  }

  onInsertItem(event: InsertToolEvent) {
    if (this.isReadOnly || this.isSelectionBusy) return;
    this.clearSelection();
    this.interactionTool = EnumWorkspaceItemType.SELECT;
    const newItem = this.createItemForInsert(event);
    this.focusedItem = newItem;
    if (!newItem) {
      return;
    }

    newItem.zIndex = ++this.zIndexCounter;
    this.activeWhiteboard.items.push(newItem);
    this.scheduleWhiteboardSave();
  }

  onDeleteItem(event: Event, item: WorkspaceCanvasItem) {
    event.stopPropagation();
    void this.confirmDeleteItems([item]);
  }

  private async deleteItems(items: WorkspaceCanvasItem[]) {
    const board = this.activeWhiteboard;
    this.isSelectionBusy = true;
    this.actionError = '';
    try {
      await this.prepareSelection(items);
      const response = await firstValueFrom(
        this.http.post<{ deletedCount: number }>(DELETE_CANVAS_ITEMS_ENDPOINT, {
          projectId: board.id,
          items: this.itemReferences(items),
        }),
      );
      if (response.deletedCount !== items.length) throw new Error('Unexpected deleted item count');
      board.items = board.items.filter((item) => !items.includes(item));
      this.connections = this.connections.filter(
        (connection) =>
          !items.some(
            (item) =>
              item.id === connection.sourceItemId && item.type === connection.sourceItemType,
          ) &&
          !items.some(
            (item) =>
              item.id === connection.targetItemId && item.type === connection.targetItemType,
          ),
      );
      if (!this.selectedConnection) this.selectedConnectionId = null;
      if (this.focusedItem && items.includes(this.focusedItem)) this.focusedItem = null;
      this.clearSelection();
    } catch (error) {
      this.reportActionError('Failed to delete items. Reload the board and try again.', error);
    } finally {
      this.isSelectionBusy = false;
      this.cdr.markForCheck();
    }
  }

  deleteSelectedItems() {
    return this.confirmDeleteItems([...this.selectedItems]);
  }

  private async confirmDeleteItems(items: WorkspaceCanvasItem[]) {
    if (this.isReadOnly || this.isSelectionBusy || !items.length) return;
    this.isSelectionBusy = true;
    try {
      const confirmed = await firstValueFrom(
        this.confirmDialogService.confirm({
          title: 'Delete items',
          message: `Delete ${items.length} selected item(s)? This cannot be undone.`,
          cancelText: 'Cancel',
          confirmText: 'Delete',
          config: { disableClose: false, confirmColor: 'error', cancelColor: 'neutral' },
        }),
      );
      if (confirmed) await this.deleteItems(items);
    } finally {
      this.isSelectionBusy = false;
      this.cdr.markForCheck();
    }
  }

  changeInteractionTool(tool: EnumWorkspaceItemType) {
    if (this.isSelectionBusy) return;
    this.interactionTool = tool;
    this.connectionDrag = null;
    this.connectionTarget = null;
    this.clearSelection();
    this.focusedItem = null;
  }

  clearSelection() {
    if (this.groupDrag) {
      this.restoreGroupPositions(this.groupDrag.positions);
      this.groupDrag = null;
    }
    this.selectedItems = [];
    this.selectedConnectionId = null;
    this.selectionStart = null;
    this.selectionBounds = null;
    this.cancelGroupEditor();
  }

  cancelGroupEditor() {
    this.isNamingGroup = false;
    this.groupName = '';
    this.groupColor = DEFAULT_GROUP_COLOR;
    this.editingGroup = null;
  }

  get selectedGroup(): WorkspaceGroup | null {
    const groupId = this.selectedItems[0]?.groupId;
    if (!groupId || !this.selectedItems.every((item) => item.groupId === groupId)) return null;
    return this.groups.find((group) => group.id === groupId) ?? null;
  }

  editGroup(group: WorkspaceGroup) {
    if (this.isReadOnly || this.isSelectionBusy) return;
    this.editingGroup = group;
    this.groupName = group.name;
    this.groupColor = group.color;
    this.isNamingGroup = true;
  }

  async updateGroup() {
    const group = this.editingGroup;
    if (this.isReadOnly || this.isSelectionBusy || !group) return;
    this.isSelectionBusy = true;
    this.actionError = '';
    try {
      const { data } = await firstValueFrom(
        this.http.post<{ data: WorkspaceGroup }>(`${CANVAS_GROUPS_ENDPOINT}/update`, {
          projectId: group.project_id,
          groupId: group.id,
          name: this.groupName.trim(),
          color: this.groupColor,
        }),
      );
      this.groups = this.groups.map((candidate) => (candidate.id === data.id ? data : candidate));
      this.cancelGroupEditor();
    } catch (error) {
      this.reportActionError('Failed to update group. Try saving again.', error);
    } finally {
      this.isSelectionBusy = false;
      this.cdr.markForCheck();
    }
  }

  async ungroup(group: WorkspaceGroup) {
    if (this.isReadOnly || this.isSelectionBusy) return;
    const board = this.activeWhiteboard;
    this.isSelectionBusy = true;
    this.actionError = '';
    try {
      await this.flushItemSaves();
      const response = await firstValueFrom(
        this.http.post<{ groupId: number }>(`${CANVAS_GROUPS_ENDPOINT}/ungroup`, {
          projectId: group.project_id,
          groupId: group.id,
        }),
      );
      if (response.groupId !== group.id) throw new Error('Unexpected ungrouped group ID');
      for (const item of board.items) {
        if (item.groupId === group.id) item.groupId = null;
      }
      this.groups = this.groups.filter((candidate) => candidate.id !== group.id);
      this.interactionTool = EnumWorkspaceItemType.SELECT;
      this.clearSelection();
    } catch (error) {
      this.reportActionError('Failed to ungroup items. Reload the board and try again.', error);
    } finally {
      this.isSelectionBusy = false;
      this.cdr.markForCheck();
    }
  }

  private updateSelection(point: CanvasPoint) {
    if (!this.selectionStart) return;
    const bounds = {
      x: Math.min(this.selectionStart.x, point.x),
      y: Math.min(this.selectionStart.y, point.y),
      width: Math.abs(point.x - this.selectionStart.x),
      height: Math.abs(point.y - this.selectionStart.y),
    };
    this.selectionBounds = bounds;
    const enclosed = this.canvasList.filter(
      (item) =>
        item.x >= bounds.x &&
        item.y >= bounds.y &&
        item.x + item.width <= bounds.x + bounds.width &&
        item.y + item.height <= bounds.y + bounds.height,
    );
    const groupIds = new Set(enclosed.map((item) => item.groupId).filter(Boolean));
    this.selectedItems = this.canvasList.filter(
      (item) => enclosed.includes(item) || (item.groupId && groupIds.has(item.groupId)),
    );
  }

  get groupFrames() {
    return this.groups.flatMap((group) => {
      const members = this.canvasList.filter((item) => item.groupId === group.id);
      if (!members.length) return [];
      const x = Math.min(...members.map((item) => item.x)) - GROUP_PADDING;
      const y = Math.min(...members.map((item) => item.y)) - GROUP_PADDING;
      return [
        {
          group,
          x,
          y,
          width: Math.max(...members.map((item) => item.x + item.width)) - x + GROUP_PADDING,
          height: Math.max(...members.map((item) => item.y + item.height)) - y + GROUP_PADDING,
        },
      ];
    });
  }

  async createGroup() {
    if (this.isReadOnly || this.isSelectionBusy || !this.selectedItems.length) return;
    const items = [...this.selectedItems];
    const name = this.groupName.trim();
    this.isSelectionBusy = true;
    this.actionError = '';
    try {
      await this.prepareSelection(items);
      const response = await firstValueFrom(
        this.http.post<{ data: WorkspaceGroup }>(CANVAS_GROUPS_ENDPOINT, {
          projectId: this.activeWhiteboard.id,
          items: this.itemReferences(items),
          name,
        }),
      );
      for (const item of items) item.groupId = response.data.id;
      this.groups.push(response.data);
      this.cancelGroupEditor();
    } catch (error) {
      this.reportActionError('Failed to group items. Reload the board and try again.', error);
    } finally {
      this.isSelectionBusy = false;
      this.cdr.markForCheck();
    }
  }

  onGroupMouseDown(event: PointerEvent, group: WorkspaceGroup) {
    event.stopPropagation();
    if (this.isSelectionBusy || event.button !== 0) return;
    if (event.pointerType === 'touch' && this.trackTouchPointer(event)) return;
    this.blurItemEditor();
    event.preventDefault();
    this.focusedItem = null;
    this.clearSelection();
    this.selectedItems = this.canvasList.filter((item) => item.groupId === group.id);
    if (this.isReadOnly) return;
    this.groupDrag = {
      group,
      start: this.screenToCanvasPoint(event.clientX, event.clientY),
      positions: this.selectedItems.map((item) => ({ item, x: item.x, y: item.y })),
    };
  }

  private async finishGroupDrag(cancelled = false) {
    const drag = this.groupDrag;
    this.groupDrag = null;
    if (!drag?.positions.length) return;
    const first = drag.positions[0];
    const dx = first.item.x - first.x;
    const dy = first.item.y - first.y;
    if (!dx && !dy) return;
    this.isSelectionBusy = true;
    this.actionError = '';
    try {
      if (cancelled) return;
      await this.flushItemSaves(drag.positions);
      await firstValueFrom(
        this.http.post(`${CANVAS_GROUPS_ENDPOINT}/move`, {
          projectId: drag.group.project_id,
          groupId: drag.group.id,
          dx,
          dy,
        }),
      );
    } catch (error) {
      this.restoreGroupPositions(drag.positions);
      this.reportActionError('Failed to move group. Reload the board and try again.', error);
    } finally {
      if (cancelled) this.restoreGroupPositions(drag.positions);
      this.isSelectionBusy = false;
      this.cdr.markForCheck();
    }
  }

  private restoreGroupPositions(positions: { item: WorkspaceCanvasItem; x: number; y: number }[]) {
    for (const position of positions) {
      position.item.x = position.x;
      position.item.y = position.y;
    }
  }

  private itemReferences(items: WorkspaceCanvasItem[]) {
    return items.map((item) => ({ id: item.id, type: item.type }));
  }

  private async prepareSelection(items: WorkspaceCanvasItem[]) {
    await this.flushItemSaves();
    await Promise.all(items.filter((item) => !item.id).map((item) => this.persistItem(item)));
  }

  private async flushItemSaves(
    positions: { item: WorkspaceCanvasItem; x: number; y: number }[] = [],
  ) {
    const pending = this.pendingSaveItem;
    this.cancelPendingWhiteboardSave();
    await Promise.all(this.pendingItemSaves.values());
    if (pending) {
      const position = positions.find((entry) => entry.item === pending);
      await this.persistItem(pending, position);
    }
  }

  onItemFocusOut(item: WorkspaceCanvasItem) {
    if (this.pendingSaveItem === item) this.cancelPendingWhiteboardSave();
    const position = this.groupDrag?.positions.find((entry) => entry.item === item);
    void this.onSaveWhiteboard(item, position);
  }

  private blurItemEditor() {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement.closest('.canvas-item')) {
      activeElement.blur();
    }
  }

  private async persistItem(item: WorkspaceCanvasItem, position?: CanvasPoint) {
    const previous = this.pendingItemSaves.get(item);
    const payload = { ...item, ...(position ? { x: position.x, y: position.y } : {}) };
    const request = (async () => {
      if (previous) await previous;
      const response = await firstValueFrom(
        this.http.post<SaveCanvasItemResponse>(SAVE_CANVAS_ITEM_ENDPOINT, {
          ...payload,
          id: item.id,
        }),
      );
      if (!Number.isSafeInteger(response.data.id) || response.data.id <= 0) {
        throw new Error('Invalid saved canvas item id');
      }
      item.id = response.data.id;
    })();
    this.pendingItemSaves.set(item, request);
    try {
      await request;
      this.failedItemSaves.delete(item);
    } catch (error) {
      this.failedItemSaves.add(item);
      throw error;
    } finally {
      if (this.pendingItemSaves.get(item) === request) this.pendingItemSaves.delete(item);
    }
  }

  private reportActionError(message: string, error: unknown) {
    console.error(message, error);
    this.actionError ||= message;
    this.cdr.markForCheck();
  }

  selectGroup(group: WorkspaceGroup) {
    if (
      this.isSelectionBusy ||
      this.groupDrag ||
      this.interactionTool !== EnumWorkspaceItemType.SELECT
    )
      return;
    this.clearSelection();
    this.selectedItems = this.canvasList.filter((item) => item.groupId === group.id);
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

  onMinimapMouseDown(event: PointerEvent) {
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

  onCanvasMouseDown(event: PointerEvent) {
    if (this.isSelectionBusy) return;
    if (event.pointerType === 'touch' && this.trackTouchPointer(event)) {
      return;
    }
    if (event.button !== 0) {
      return;
    }
    this.blurItemEditor();
    this.focusedItem = null;
    this.clearSelection();
    if (this.interactionTool === EnumWorkspaceItemType.SELECT) {
      event.preventDefault();
      this.selectionStart = this.screenToCanvasPoint(event.clientX, event.clientY);
      this.selectionBounds = { ...this.selectionStart, width: 0, height: 0 };
      return;
    }
    this.isPanning = true;
    this.panStartScreen = { x: event.clientX, y: event.clientY };
    this.panStartOffset = { x: this.panX, y: this.panY };
  }

  onItemMouseDown(event: PointerEvent, item: WorkspaceCanvasItem) {
    event.stopPropagation();
    if (this.isSelectionBusy) return;
    if (event.pointerType === 'touch' && this.trackTouchPointer(event)) {
      return;
    }
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (
      target?.closest('button, select, a, .resize-handle, .item-delete-btn') &&
      !target.closest('.image-upload-placeholder')
    ) {
      return;
    }
    this.selectedConnectionId = null;
    if (this.interactionTool === EnumWorkspaceItemType.CONNECT) {
      if (this.isReadOnly) return;
      this.blurItemEditor();
      this.clearSelection();
      this.focusedItem = null;
      event.preventDefault();
      this.connectionDrag = {
        source: item,
        sourceAnchor: null,
        point: this.screenToCanvasPoint(event.clientX, event.clientY),
      };
      this.connectionTarget = this.findConnectionTarget();
      return;
    }
    if (item.groupId) {
      const group = this.groups.find((candidate) => candidate.id === item.groupId);
      if (group) {
        this.onGroupMouseDown(event, group);
        return;
      }
    }
    this.blurItemEditor();
    event.preventDefault();
    this.clearSelection();
    this.startItemDrag(event, item);
  }

  onConnectionAnchorMouseDown(
    event: PointerEvent,
    item: WorkspaceCanvasItem,
    sourceAnchor: CanvasConnectionAnchor,
  ) {
    event.stopPropagation();
    if (this.isReadOnly || this.isSelectionBusy || event.button !== 0) return;
    if (event.pointerType === 'touch' && this.trackTouchPointer(event)) return;
    this.blurItemEditor();
    this.clearSelection();
    this.focusedItem = item;
    this.selectedConnectionId = null;
    event.preventDefault();
    this.connectionDrag = {
      source: item,
      sourceAnchor,
      point: connectionAnchorPoint(item, sourceAnchor),
    };
    this.connectionTarget = this.findConnectionTarget();
  }

  private startItemDrag(event: PointerEvent, item: WorkspaceCanvasItem) {
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
    const canvasPoint = this.screenToCanvasPoint(event.clientX, event.clientY);
    this.dragOffset = { x: canvasPoint.x - item.x, y: canvasPoint.y - item.y };
  }

  @HostListener('document:pointermove', ['$event'])
  onDocumentMouseMove(event: PointerEvent) {
    if (this.updateTouchZoom(event)) return;

    if (this.connectionDrag) {
      this.connectionDrag.point = this.screenToCanvasPoint(event.clientX, event.clientY);
      this.connectionTarget = this.findConnectionTarget();
      return;
    }
    if (this.selectionStart) {
      this.updateSelection(this.screenToCanvasPoint(event.clientX, event.clientY));
      return;
    }
    if (this.groupDrag) {
      const point = this.screenToCanvasPoint(event.clientX, event.clientY);
      for (const position of this.groupDrag.positions) {
        position.item.x = position.x + point.x - this.groupDrag.start.x;
        position.item.y = position.y + point.y - this.groupDrag.start.y;
      }
      return;
    }
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

  private updateTouchZoom(event: PointerEvent): boolean {
    if (event.pointerType === 'touch' && this.activeTouchPointers.has(event.pointerId)) {
      this.activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (this.isPinching && this.activeTouchPointers.size >= 2) {
        const [a, b] = Array.from(this.activeTouchPointers.values());
        const distance = Math.hypot(b.x - a.x, b.y - a.y);
        const factor = this.pinchStartDistance > 0 ? distance / this.pinchStartDistance : 1;
        this.zoomAtPoint(this.pinchStartZoom * factor, (a.x + b.x) / 2, (a.y + b.y) / 2);
        return true;
      }
    }
    return false;
  }

  @HostListener('document:pointerup', ['$event'])
  @HostListener('document:pointercancel', ['$event'])
  onDocumentMouseUp(event?: PointerEvent) {
    if (event?.pointerType === 'touch') {
      this.activeTouchPointers.delete(event.pointerId);
      if (this.activeTouchPointers.size < 2) {
        this.isPinching = false;
      }
    }

    this.isPanning = false;
    if (this.connectionDrag) {
      const drag = this.connectionDrag;
      if (event) drag.point = this.screenToCanvasPoint(event.clientX, event.clientY);
      const target = this.findConnectionTarget();
      this.connectionDrag = null;
      this.connectionTarget = null;
      if (event && event.type !== 'pointercancel' && target) {
        void this.createConnection(drag.source, target.item, drag.sourceAnchor, target.anchor);
      }
      return;
    }
    if (this.selectionStart) {
      if (event?.type === 'pointercancel') this.clearSelection();
      this.selectionStart = null;
      this.selectionBounds = null;
      return;
    }
    if (this.groupDrag) {
      void this.finishGroupDrag(event?.type === 'pointercancel');
      return;
    }

    if (this.activeItem) {
      this.activeItem = null;
      this.scheduleWhiteboardSave();
      return;
    }

    this.activeItem = null;
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeyDown(event: KeyboardEvent) {
    const activeElement = document.activeElement as HTMLElement | null;
    const isTypingTarget =
      activeElement?.tagName === 'INPUT' ||
      activeElement?.tagName === 'TEXTAREA' ||
      activeElement?.isContentEditable;

    if (isTypingTarget) {
      return;
    }
    if (this.isSelectionBusy) return;

    if (event.key === 'Escape') {
      this.clearSelection();
      return;
    }
    if (this.groupDrag || this.selectionStart) return;
    if (this.selectedItems.length && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault();
      void this.deleteSelectedItems();
      return;
    }
    if (
      this.selectedConnectionId !== null &&
      (event.key === 'Delete' || event.key === 'Backspace')
    ) {
      event.preventDefault();
      void this.deleteSelectedConnection();
      return;
    }
    if (!this.focusedItem) return;

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

  /** Records a touch contact and starts pinch-to-zoom once a second finger joins. Returns true if this pointerdown should not also start a pan/drag. */
  private trackTouchPointer(event: PointerEvent): boolean {
    this.activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.activeTouchPointers.size === 2) {
      const [a, b] = Array.from(this.activeTouchPointers.values());
      this.isPinching = true;
      this.isPanning = false;
      this.activeItem = null;
      this.connectionDrag = null;
      this.connectionTarget = null;
      this.clearSelection();
      this.pinchStartDistance = Math.hypot(b.x - a.x, b.y - a.y);
      this.pinchStartZoom = this.zoom;
      return true;
    }

    return this.activeTouchPointers.size > 2;
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

  private anchorDistance(
    item: WorkspaceCanvasItem,
    anchor: CanvasConnectionAnchor,
    point: CanvasPoint,
  ) {
    const anchorPoint = connectionAnchorPoint(item, anchor);
    return Math.hypot(anchorPoint.x - point.x, anchorPoint.y - point.y);
  }

  private legacyConnectionMarkerSize(
    source: WorkspaceCanvasItem,
    target: WorkspaceCanvasItem,
    connection: CanvasConnection,
    strokeWidth: number,
  ): number {
    const targetCenterX = target.x + target.width / 2;
    const targetCenterY = target.y + target.height / 2;
    const sourceAnchor =
      connection.sourceAnchor ?? (targetCenterX >= source.x + source.width / 2 ? 'right' : 'left');
    const start = connectionAnchorPoint(source, sourceAnchor);
    const vertical = sourceAnchor === 'top' || sourceAnchor === 'bottom';
    const end = vertical
      ? start.y <= targetCenterY
        ? target.y
        : target.y + target.height
      : (connection.sourceAnchor ? start.x <= targetCenterX : sourceAnchor === 'right')
        ? target.x
        : target.x + target.width;
    const distance = Math.abs((vertical ? start.y : start.x) - end) / 2;
    return connectionArrowSizeForDistance(distance, strokeWidth);
  }

  private connectionPath(
    source: WorkspaceCanvasItem,
    target: WorkspaceCanvasItem | CanvasPoint,
    sourceAnchor: CanvasConnectionAnchor | null = null,
    targetAnchor: CanvasConnectionAnchor | null = null,
    strokeWidth = 2,
  ) {
    if (targetAnchor && 'width' in target) {
      const startAnchor =
        sourceAnchor ??
        (target.x + target.width / 2 >= source.x + source.width / 2 ? 'right' : 'left');
      const start = connectionAnchorPoint(source, startAnchor);
      const end = connectionAnchorPoint(target, targetAnchor);
      const path = routeCanvasConnection(source, target, startAnchor, targetAnchor, strokeWidth);
      if (path) return path;
      const startOffset = connectionAnchorOffset(start, startAnchor);
      const endOffset = connectionAnchorOffset(
        end,
        targetAnchor,
        connectionArrowClearance(strokeWidth),
      );
      const vertical = startAnchor === 'top' || startAnchor === 'bottom';
      const middle = vertical
        ? `V ${(startOffset.y + endOffset.y) / 2} H ${endOffset.x} V ${endOffset.y}`
        : `H ${(startOffset.x + endOffset.x) / 2} V ${endOffset.y} H ${endOffset.x}`;
      return `M ${start.x} ${start.y} L ${startOffset.x} ${startOffset.y} ${middle} L ${end.x} ${end.y}`;
    }

    if (sourceAnchor) {
      const start = connectionAnchorPoint(source, sourceAnchor);
      const targetIsItem = 'width' in target;
      const targetCenterX = targetIsItem ? target.x + target.width / 2 : target.x;
      const targetCenterY = targetIsItem ? target.y + target.height / 2 : target.y;
      const verticalRoute = sourceAnchor === 'top' || sourceAnchor === 'bottom';
      const end = targetIsItem
        ? verticalRoute
          ? {
              x: targetCenterX,
              y: start.y <= targetCenterY ? target.y : target.y + target.height,
            }
          : {
              x: start.x <= targetCenterX ? target.x : target.x + target.width,
              y: targetCenterY,
            }
        : target;

      if (verticalRoute) {
        const middleY = (start.y + end.y) / 2;
        return `M ${start.x} ${start.y} V ${middleY} H ${end.x} V ${end.y}`;
      }
      const middleX = (start.x + end.x) / 2;
      return `M ${start.x} ${start.y} H ${middleX} V ${end.y} H ${end.x}`;
    }

    const sourceCenterX = source.x + source.width / 2;
    const targetCenterX = 'width' in target ? target.x + target.width / 2 : target.x;
    const sourceRight = targetCenterX >= sourceCenterX;
    const startX = sourceRight ? source.x + source.width : source.x;
    const startY = source.y + source.height / 2;
    const endX = 'width' in target ? (sourceRight ? target.x : target.x + target.width) : target.x;
    const endY = 'height' in target ? target.y + target.height / 2 : target.y;
    const middleX = (startX + endX) / 2;
    return `M ${startX} ${startY} H ${middleX} V ${endY} H ${endX}`;
  }

  selectConnection(event: Event, connection: CanvasConnection) {
    event.preventDefault();
    event.stopPropagation();
    if (this.isSelectionBusy) return;
    this.clearSelection();
    this.focusedItem = null;
    this.selectedConnectionId = connection.id;
    this.connectionColorDraft = connection.color;
    this.connectionStrokeWidthDraft = connection.strokeWidth;
  }

  onConnectionKeyDown(event: KeyboardEvent, connection: CanvasConnection) {
    if (event.key === 'Enter' || event.key === ' ') {
      this.selectConnection(event, connection);
    }
  }

  async saveConnectionStyle() {
    const connection = this.selectedConnection;
    if (this.isReadOnly || this.isSelectionBusy || !connection) return;
    this.isSelectionBusy = true;
    this.actionError = '';
    try {
      const { data } = await firstValueFrom(
        this.http.post<{ data: CanvasConnection }>(UPDATE_CANVAS_CONNECTION_ENDPOINT, {
          projectId: this.activeWhiteboard.id,
          connectionId: connection.id,
          color: this.connectionColorDraft,
          strokeWidth: this.connectionStrokeWidthDraft,
        }),
      );
      if (data.id !== connection.id) {
        throw new Error('Unexpected updated canvas connection id');
      }
      this.connections = this.connections.map((item) => (item.id === data.id ? data : item));
      this.connectionColorDraft = data.color;
      this.connectionStrokeWidthDraft = data.strokeWidth;
    } catch (error) {
      this.reportActionError('Failed to update connection style. Try again.', error);
    } finally {
      this.isSelectionBusy = false;
      this.cdr.markForCheck();
    }
  }

  async deleteSelectedConnection() {
    const connection = this.selectedConnection;
    if (this.isReadOnly || this.isSelectionBusy || !connection) return;
    this.isSelectionBusy = true;
    this.actionError = '';
    try {
      const confirmed = await firstValueFrom(
        this.confirmDialogService.confirm({
          title: 'Delete connection',
          message: 'Delete this connection? This cannot be undone.',
          cancelText: 'Cancel',
          confirmText: 'Delete',
          config: { disableClose: false, confirmColor: 'error', cancelColor: 'neutral' },
        }),
      );
      if (!confirmed) return;
      const response = await firstValueFrom(
        this.http.post<{ id: number }>(DELETE_CANVAS_CONNECTION_ENDPOINT, {
          projectId: this.activeWhiteboard.id,
          connectionId: connection.id,
        }),
      );
      if (response.id !== connection.id) {
        throw new Error('Unexpected deleted canvas connection id');
      }
      this.connections = this.connections.filter((item) => item.id !== connection.id);
      this.selectedConnectionId = null;
    } catch (error) {
      this.reportActionError('Failed to delete connection. Reload the board and try again.', error);
    } finally {
      this.isSelectionBusy = false;
      this.cdr.markForCheck();
    }
  }

  private async createConnection(
    source: WorkspaceCanvasItem,
    target: WorkspaceCanvasItem,
    sourceAnchor: CanvasConnectionAnchor | null,
    targetAnchor: CanvasConnectionAnchor,
  ) {
    if (this.isReadOnly || this.isSelectionBusy) return;
    if (source === target) return;
    const resolvedSourceAnchor =
      sourceAnchor ??
      (target.x + target.width / 2 >= source.x + source.width / 2 ? 'right' : 'left');
    this.isSelectionBusy = true;
    this.actionError = '';
    try {
      await this.prepareSelection([source, target]);
      if (!source.id || !target.id) throw new Error('Canvas items must be saved before linking');
      const { data } = await firstValueFrom(
        this.http.post<{ data: CanvasConnection }>(CANVAS_CONNECTIONS_ENDPOINT, {
          projectId: this.activeWhiteboard.id,
          sourceItemId: source.id,
          sourceItemType: source.type,
          sourceAnchor: resolvedSourceAnchor,
          targetItemId: target.id,
          targetItemType: target.type,
          targetAnchor,
        }),
      );
      if (!Number.isSafeInteger(data.id) || data.id <= 0) {
        throw new Error('Invalid saved canvas connection id');
      }
      this.connections = [
        ...this.connections.filter((connection) => connection.id !== data.id),
        data,
      ];
    } catch (error) {
      this.reportActionError('Failed to connect items. Reload the board and try again.', error);
    } finally {
      this.isSelectionBusy = false;
      this.cdr.markForCheck();
    }
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

        const randomNumberMinus3To3 = (): number => {
          return Math.floor(Math.random() * 7) - 3;
        };
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
          rotation: randomNumberMinus3To3(),
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
      case EnumWorkspaceItemType.MARKDOWN:
        return {
          projectId,
          type: EnumWorkspaceItemType.MARKDOWN,
          x: center.x - DEFAULT_MARKDOWN_WIDTH / 2,
          y: center.y - DEFAULT_MARKDOWN_HEIGHT / 2,
          zIndex: 0,
          content: DEFAULT_MARKDOWN_CONTENT,
          width: DEFAULT_MARKDOWN_WIDTH,
          height: DEFAULT_MARKDOWN_HEIGHT,
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

  async onSaveWhiteboard(item = this.focusedItem, position?: CanvasPoint) {
    if (this.isReadOnly || !item) {
      return;
    }
    this.isCanvasLoading = true;
    this.cdr.detectChanges();
    try {
      await this.persistItem(item, position);
    } catch (error) {
      this.reportActionError(
        'Failed to save canvas item. Try again before leaving the board.',
        error,
      );
    } finally {
      this.isCanvasLoading = this.pendingItemSaves.size > 0;
      this.cdr.markForCheck();
    }
  }

  private scheduleWhiteboardSave() {
    if (this.isReadOnly) {
      return;
    }
    this.cancelPendingWhiteboardSave();
    this.pendingSaveItem = this.focusedItem;
    const item = this.pendingSaveItem;
    const position = item ? { x: item.x, y: item.y } : undefined;
    this.saveWhiteboardTimeoutId = setTimeout(() => {
      this.saveWhiteboardTimeoutId = null;
      this.pendingSaveItem = null;
      void this.onSaveWhiteboard(item, position);
    }, SAVE_WHITEBOARD_DELAY_MS);
  }

  private cancelPendingWhiteboardSave() {
    if (this.saveWhiteboardTimeoutId !== null) {
      clearTimeout(this.saveWhiteboardTimeoutId);
      this.saveWhiteboardTimeoutId = null;
    }
    this.pendingSaveItem = null;
  }
}
