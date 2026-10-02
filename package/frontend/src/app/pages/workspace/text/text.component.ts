import { Component, HostListener, Input } from '@angular/core';
import { TextItem } from '../../../interface/workspace.interface';
import {
  computeResizedRect,
  ResizeCorner,
  ResizeStart,
  startResize,
} from '../shared/item-resize.util';

const MIN_WIDTH = 80;
const MIN_HEIGHT = 32;

@Component({
  selector: 'app-text',
  standalone: true,
  imports: [],
  templateUrl: './text.component.html',
  styleUrl: './text.component.scss',
})
export class TextComponent {
  @Input({ required: true }) item!: TextItem;
  @Input() zoom = 1;

  isEditing = false;

  private isResizing = false;
  private activeCorner: ResizeCorner | null = null;
  private resizeStart: ResizeStart = { x: 0, y: 0, width: 0, height: 0, itemX: 0, itemY: 0 };

  onContentInput(value: string) {
    this.item.content = value;
  }

  onTextMouseDown(event: PointerEvent) {
    if (this.isEditing) {
      event.stopPropagation();
    }
  }

  startEditing(textarea: HTMLTextAreaElement) {
    this.isEditing = true;
    queueMicrotask(() => textarea.focus());
  }

  stopEditing() {
    this.isEditing = false;
  }

  onResizeMouseDown(event: PointerEvent, corner: ResizeCorner) {
    event.stopPropagation();
    event.preventDefault();

    this.isResizing = true;
    this.activeCorner = corner;
    this.resizeStart = startResize(event, this.item);
  }

  @HostListener('document:pointermove', ['$event'])
  onDocumentMouseMove(event: PointerEvent) {
    if (!this.isResizing || !this.activeCorner) {
      return;
    }

    const rect = computeResizedRect(
      event,
      this.activeCorner,
      this.resizeStart,
      this.zoom,
      MIN_WIDTH,
      MIN_HEIGHT,
    );

    this.item.x = rect.x;
    this.item.y = rect.y;
    this.item.width = rect.width;
    this.item.height = rect.height;
  }

  @HostListener('document:pointerup')
  @HostListener('document:pointercancel')
  onDocumentMouseUp() {
    this.isResizing = false;
    this.activeCorner = null;
  }
}
