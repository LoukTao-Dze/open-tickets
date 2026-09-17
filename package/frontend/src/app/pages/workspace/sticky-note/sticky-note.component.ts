import { Component, HostListener, Input, OnChanges, SimpleChanges } from '@angular/core';
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
const FONT_SIZE_SEARCH_ITERATIONS = 16;
const FONT_SIZE_OPTIONS = [12, 16, 20, 24, 28, 32, 64] as const;

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
  isLabelEditing = false;
  isContentEditing = false;
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

  setContentFontSize(value: string, contentEl: HTMLElement) {
    this.note.fontSize = Number(value);
    // restore focus/selection to the content so it doesn't look cleared after using the select
    queueMicrotask(() => this.restoreContentSelection(contentEl));
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

    // re-setting [innerHTML] on the next change detection cycle rebuilds the DOM and clears the
    // live selection, so capture it as character offsets now and restore it once that rebuild happens
    const offsets = this.getSelectionOffsets(contentEl);
    if (offsets) {
      setTimeout(() => this.restoreSelectionOffsets(contentEl, offsets));
    }
  }

  updateActiveFormats() {
    this.isBoldActive = document.queryCommandState('bold');
    this.isItalicActive = document.queryCommandState('italic');
    this.isUnderlineActive = document.queryCommandState('underline');
    this.isBack = this.note?.isBack || false;
  }

  onToolbarMouseDown(event: MouseEvent) {
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

  /** Captures the current selection as character offsets relative to `root`, so it survives `root`'s DOM being rebuilt. */
  private getSelectionOffsets(root: HTMLElement): { start: number; end: number } | null {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
      return null;
    }

    const preStartRange = document.createRange();
    preStartRange.selectNodeContents(root);
    preStartRange.setEnd(range.startContainer, range.startOffset);

    const preEndRange = document.createRange();
    preEndRange.selectNodeContents(root);
    preEndRange.setEnd(range.endContainer, range.endOffset);

    return { start: preStartRange.toString().length, end: preEndRange.toString().length };
  }

  /** Restores a selection previously captured by `getSelectionOffsets` after `root`'s DOM has been rebuilt. */
  private restoreSelectionOffsets(root: HTMLElement, offsets: { start: number; end: number }) {
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(true);

    const nodeStack: Node[] = [root];
    let charIndex = 0;
    let startSet = false;
    let endSet = false;
    let node: Node | undefined;

    while (!endSet && (node = nodeStack.pop())) {
      if (node.nodeType === Node.TEXT_NODE) {
        const textNode = node as Text;
        const nextCharIndex = charIndex + textNode.length;

        if (!startSet && offsets.start <= nextCharIndex) {
          range.setStart(textNode, offsets.start - charIndex);
          startSet = true;
        }
        if (!endSet && offsets.end <= nextCharIndex) {
          range.setEnd(textNode, offsets.end - charIndex);
          endSet = true;
        }
        charIndex = nextCharIndex;
      } else {
        const children = node.childNodes;
        for (let i = children.length - 1; i >= 0; i--) {
          nodeStack.push(children[i]);
        }
      }
    }

    if (!startSet || !endSet) {
      return;
    }

    root.focus();
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    this.updateActiveFormats();
  }

  onContentMouseDown(event: MouseEvent) {
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
