import { Component, ElementRef, HostListener, Input, ViewChild } from '@angular/core';
import { LinkItem } from '../../../interface/workspace.interface';
import {
  computeResizedRect,
  ResizeCorner,
  ResizeStart,
  startResize,
} from '../shared/item-resize.util';

const MIN_WIDTH = 180;
const MIN_HEIGHT = 48;

@Component({
  selector: 'app-link',
  standalone: true,
  imports: [],
  templateUrl: './link.component.html',
  styleUrl: './link.component.scss',
})
export class LinkComponent {
  @Input({ required: true }) item!: LinkItem;
  @Input() zoom = 1;
  @ViewChild('titleInput') titleInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('editFields') editFieldsRef?: ElementRef<HTMLDivElement>;

  isEditing = false;

  private isResizing = false;
  private activeCorner: ResizeCorner | null = null;
  private resizeStart: ResizeStart = { x: 0, y: 0, width: 0, height: 0, itemX: 0, itemY: 0 };

  startEditing() {
    this.isEditing = true;
    queueMicrotask(() => this.titleInputRef?.nativeElement.focus());
  }

  stopEditing() {
    this.isEditing = false;
  }

  onFieldsFocusOut(event: FocusEvent) {
    const nextFocus = event.relatedTarget as HTMLElement | null;
    if (!nextFocus || !this.editFieldsRef?.nativeElement.contains(nextFocus)) {
      this.stopEditing();
    }
  }

  onTitleInput(value: string) {
    this.item.title = value;
  }

  onUrlInput(value: string) {
    this.item.url = value;
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
