import { Component, HostListener, Input, OnChanges, SimpleChanges } from '@angular/core';
import { StickyNoteItem } from '../../../interface/workspace.interface';
import {
  STICKY_NOTE_COLOR_OPTIONS,
  StickyNoteColorOption,
} from '../../../shared/sticky-note-colors';
import {
  computeResizedRect,
  ResizeCorner,
  ResizeStart,
  startResize,
} from '../shared/item-resize.util';

const MIN_CONTENT_FONT_SIZE = 8;
const MAX_CONTENT_FONT_SIZE = 32;
const MIN_WIDTH = 200;
const MIN_HEIGHT = 80;
// note padding (p-md) taken off both sides of width/height
const NOTE_PADDING = 16;
// approximate space used by the label row (font-size + margin-bottom)
const LABEL_RESERVED_HEIGHT = 20;
// average glyph width/line-height as a ratio of font-size, for a proportional sans-serif font
const CHAR_WIDTH_RATIO = 0.55;
const LINE_HEIGHT_RATIO = 1.25;
const FONT_SIZE_SEARCH_ITERATIONS = 16;
const FONT_SIZE_OPTIONS = [12, 16, 18, 20, 24, 28, 32, 64] as const;

interface ContentSelectionPoint {
  path: number[];
  offset: number;
}

interface ContentSelection {
  start: ContentSelectionPoint;
  end: ContentSelectionPoint;
}

@Component({
  selector: 'app-sticky-note',
  standalone: true,
  imports: [],
  templateUrl: './sticky-note.component.html',
  styleUrls: ['./sticky-note.component.scss'],
})
export class StickyNoteComponent implements OnChanges {
  @Input({ required: true }) note!: StickyNoteItem;
  @Input() isDragging = false;
  @Input() zoom = 1;
  @Input() isFocused: boolean = false;

  readonly fontSizeOptions = FONT_SIZE_OPTIONS;
  readonly stickyNoteColorOptions = STICKY_NOTE_COLOR_OPTIONS;
  isLabelEditing = false;
  isContentEditing = false;
  isColorPickerOpen = false;
  isBoldActive = false;
  isItalicActive = false;
  isUnderlineActive = false;
  isBack = false;

  private isResizing = false;
  private activeCorner: ResizeCorner | null = null;
  private resizeStart: ResizeStart = { x: 0, y: 0, width: 0, height: 0, itemX: 0, itemY: 0 };
  // preserves the content's text selection across toolbar interactions (e.g. opening the font-size select)
  private savedContentRange: Range | null = null;

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

  ngOnChanges(changes: SimpleChanges) {
    if (changes['isFocused']) {
      this.isContentEditing = changes['isFocused']?.currentValue || false;
    }
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

  onLabelMouseDown(event: PointerEvent) {
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

  onContentInput(value: string, contentEl: HTMLElement) {
    const selection = this.getContentSelection(contentEl);
    this.note.content = value;

    if (selection) {
      setTimeout(() => this.restoreContentSelectionPoints(contentEl, selection));
    }
  }

  setContentFontSize(value: string, contentEl: HTMLElement) {
    this.note.fontSize = Number(value);
    // restore focus/selection to the content so it doesn't look cleared after using the select
    queueMicrotask(() => this.restoreContentSelection(contentEl));
  }

  toggleColorPicker() {
    this.isColorPickerOpen = !this.isColorPickerOpen;
  }

  chooseColor(color: StickyNoteColorOption) {
    this.note.bgColor = color.bgColor;
    this.note.textColor = color.textColor;
    this.isColorPickerOpen = false;
  }

  sendToBack() {
    this.note.isBack = !this.note.isBack;
    this.isBack = this.note.isBack;
    this.note.zIndex = this.note.isBack ? 0 : this.note.zIndex;
  }

  /** Applies bold/italic/underline to the current text selection inside the note content. */
  applyFormat(command: 'bold' | 'italic' | 'underline', contentEl: HTMLElement) {
    this.restoreContentSelection(contentEl);
    document.execCommand(command);
    this.note.content = contentEl.innerHTML;
    this.updateActiveFormats();

    const selection = this.getContentSelection(contentEl);
    if (selection) {
      setTimeout(() => this.restoreContentSelectionPoints(contentEl, selection));
    }
  }

  updateActiveFormats() {
    this.isBoldActive = document.queryCommandState('bold');
    this.isItalicActive = document.queryCommandState('italic');
    this.isUnderlineActive = document.queryCommandState('underline');
    this.isBack = this.note?.isBack || false;
  }

  onToolbarMouseDown(event: PointerEvent) {
    event.stopPropagation();
    this.saveContentSelection();

    // don't preventDefault on the <select> itself, or the browser won't open its dropdown
    if ((event.target as HTMLElement).tagName !== 'SELECT') {
      event.preventDefault();
    }
  }

  /** Remembers the current text selection so it can survive focus moving to a toolbar control. */
  private saveContentSelection() {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      this.savedContentRange = selection.getRangeAt(0).cloneRange();
    }
  }

  /** Re-applies the previously saved selection to the note content before formatting it. */
  private restoreContentSelection(contentEl: HTMLElement) {
    contentEl.focus();

    if (!this.savedContentRange) {
      return;
    }

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(this.savedContentRange);
  }

  private getContentSelection(root: HTMLElement): ContentSelection | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
      return null;
    }

    return {
      start: this.getContentSelectionPoint(root, range.startContainer, range.startOffset),
      end: this.getContentSelectionPoint(root, range.endContainer, range.endOffset),
    };
  }

  private getContentSelectionPoint(
    root: Node,
    container: Node,
    offset: number,
  ): ContentSelectionPoint {
    const path: number[] = [];
    let currentNode = container;
    while (currentNode !== root && currentNode.parentNode) {
      const parentNode = currentNode.parentNode;
      path.unshift(Array.from(parentNode.childNodes).indexOf(currentNode as ChildNode));
      currentNode = parentNode;
    }
    return { path, offset };
  }

  private resolveContentSelectionPoint(root: Node, point: ContentSelectionPoint): Node | null {
    let currentNode = root;
    for (const childIndex of point.path) {
      const childNode = currentNode.childNodes.item(childIndex);
      if (!childNode) {
        return null;
      }
      currentNode = childNode;
    }
    const maxOffset =
      currentNode.nodeType === Node.TEXT_NODE
        ? (currentNode as Text).length
        : currentNode.childNodes.length;
    return point.offset <= maxOffset ? currentNode : null;
  }

  private restoreContentSelectionPoints(root: HTMLElement, selectionPoints: ContentSelection) {
    const startNode = this.resolveContentSelectionPoint(root, selectionPoints.start);
    const endNode = this.resolveContentSelectionPoint(root, selectionPoints.end);
    if (!startNode || !endNode) {
      return;
    }

    const range = document.createRange();
    range.setStart(startNode, selectionPoints.start.offset);
    range.setEnd(endNode, selectionPoints.end.offset);
    root.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    this.updateActiveFormats();
  }

  onContentMouseDown(event: PointerEvent) {
    if (this.isContentEditing) {
      event.stopPropagation();
    }
  }

  startEditing(contentEl: HTMLElement) {
    this.isContentEditing = true;
    queueMicrotask(() => {
      contentEl.focus();
      this.updateActiveFormats();
    });
  }

  stopEditing(event?: FocusEvent) {
    const nextFocusTarget = event?.relatedTarget as HTMLElement | null;

    if (nextFocusTarget?.closest('.sticky-note-toolbar')) {
      return;
    }

    this.isContentEditing = false;
  }

  onResizeMouseDown(event: PointerEvent, corner: ResizeCorner) {
    event.stopPropagation();
    event.preventDefault();

    this.isResizing = true;
    this.activeCorner = corner;
    this.resizeStart = startResize(event, this.note);
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

    this.note.x = rect.x;
    this.note.y = rect.y;
    this.note.width = rect.width;
    this.note.height = rect.height;
  }

  @HostListener('document:pointerup')
  @HostListener('document:pointercancel')
  onDocumentMouseUp() {
    this.isResizing = false;
    this.activeCorner = null;
  }
}
