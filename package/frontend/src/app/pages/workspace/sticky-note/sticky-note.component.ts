import { Component, HostListener, Input } from '@angular/core';
import { StickyNoteItem } from '../../../interface/workspace.interface';
import {
  computeResizedRect,
  ResizeCorner,
  ResizeStart,
  startResize,
} from '../shared/item-resize.util';

const MIN_CONTENT_FONT_SIZE = 8;
const MAX_CONTENT_FONT_SIZE = 64;
const MIN_WIDTH = 140;
const MIN_HEIGHT = 140;
// note padding (p-md) taken off both sides of width/height
const NOTE_PADDING = 16;
// approximate space used by the label row (font-size + margin-bottom)
const LABEL_RESERVED_HEIGHT = 20;
// average glyph width/line-height as a ratio of font-size, for a proportional sans-serif font
const CHAR_WIDTH_RATIO = 0.55;
const LINE_HEIGHT_RATIO = 1.25;
const FONT_SIZE_SEARCH_ITERATIONS = 20;
const FONT_SIZE_OPTIONS = [12, 16, 20, 24, 28, 32] as const;

@Component({
  selector: 'app-sticky-note',
  standalone: true,
  imports: [],
  templateUrl: './sticky-note.component.html',
  styleUrls: ['./sticky-note.component.scss'],
})
export class StickyNoteComponent {
  @Input({ required: true }) note!: StickyNoteItem;
  @Input() isDragging = false;
  @Input() zoom = 1;

  readonly fontSizeOptions = FONT_SIZE_OPTIONS;
  isLabelEditing = false;
  isContentEditing = false;

  private isResizing = false;
  private activeCorner: ResizeCorner | null = null;
  private resizeStart: ResizeStart = { x: 0, y: 0, width: 0, height: 0, itemX: 0, itemY: 0 };

  get isEditing(): boolean {
    return this.isLabelEditing || this.isContentEditing;
  }

  get noteTransform(): string {
    return this.isDragging ? 'scale(1.05) rotate(0deg)' : `rotate(${this.note.rotation}deg)`;
  }

  get contentFontSize(): number {
    if (this.note.fontSize) {
      return this.note.fontSize;
    }

    const availableWidth = Math.max(this.note.width - NOTE_PADDING * 2, 20);
    const availableHeight = Math.max(
      this.note.height - NOTE_PADDING * 2 - LABEL_RESERVED_HEIGHT,
      20,
    );
    const lines = this.note.content.length ? this.note.content.split('\n') : [''];

    /** binary search the largest font size whose wrapped text still fits the box */
    let low = MIN_CONTENT_FONT_SIZE;
    let high = MAX_CONTENT_FONT_SIZE;
    for (let i = 0; i < FONT_SIZE_SEARCH_ITERATIONS; i++) {
      const candidate = (low + high) / 2;
      if (this.estimatedTextHeight(lines, availableWidth, candidate) <= availableHeight) {
        low = candidate;
      } else {
        high = candidate;
      }
    }

    return low;
  }

  private estimatedTextHeight(lines: string[], availableWidth: number, fontSize: number): number {
    const charsPerLine = Math.max(Math.floor(availableWidth / (fontSize * CHAR_WIDTH_RATIO)), 1);
    const wrappedLineCount = lines.reduce(
      (total, line) => total + Math.max(Math.ceil(line.length / charsPerLine), 1),
      0,
    );
    return wrappedLineCount * fontSize * LINE_HEIGHT_RATIO;
  }

  onLabelInput(value: string) {
    this.note.label = value;
  }

  onLabelMouseDown(event: MouseEvent) {
    if (this.isLabelEditing) {
      event.stopPropagation();
    }
  }

  startEditingLabel(labelInput: HTMLInputElement) {
    this.isLabelEditing = true;
    queueMicrotask(() => labelInput.focus());
  }

  stopEditingLabel() {
    this.isLabelEditing = false;
  }

  onContentInput(value: string) {
    this.note.content = value;
  }

  setContentFontSize(value: string) {
    this.note.fontSize = Number(value);
  }

  toggleBold() {
    this.note.isBold = !this.note.isBold;
  }

  toggleUnderline() {
    this.note.isUnderlined = !this.note.isUnderlined;
  }

  onToolbarMouseDown(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  onContentMouseDown(event: MouseEvent) {
    if (this.isContentEditing) {
      event.stopPropagation();
    }
  }

  startEditing(textarea: HTMLTextAreaElement) {
    this.isContentEditing = true;
    queueMicrotask(() => textarea.focus());
  }

  stopEditing() {
    this.isContentEditing = false;
  }

  onResizeMouseDown(event: MouseEvent, corner: ResizeCorner) {
    event.stopPropagation();
    event.preventDefault();

    this.isResizing = true;
    this.activeCorner = corner;
    this.resizeStart = startResize(event, this.note);
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent) {
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

    this.note.x = rect.x;
    this.note.y = rect.y;
    this.note.width = rect.width;
    this.note.height = rect.height;
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp() {
    this.isResizing = false;
    this.activeCorner = null;
  }
}
