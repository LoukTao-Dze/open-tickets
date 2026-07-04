import { Component, Input } from '@angular/core';
import { StickyNoteItem } from '../../../interface/workspace.interface';

const MAX_CONTENT_FONT_SIZE = 14;
const MIN_CONTENT_FONT_SIZE = 8;
const CONTENT_SHRINK_START_LENGTH = 60;
const CONTENT_SHRINK_END_LENGTH = 260;

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

  isLabelEditing = false;
  isContentEditing = false;

  get isEditing(): boolean {
    return this.isLabelEditing || this.isContentEditing;
  }

  get noteTransform(): string {
    return this.isDragging ? 'scale(1.05) rotate(0deg)' : `rotate(${this.note.rotation}deg)`;
  }

  get contentFontSize(): number {
    const length = this.note.content.length;

    if (length <= CONTENT_SHRINK_START_LENGTH) {
      return MAX_CONTENT_FONT_SIZE;
    }
    if (length >= CONTENT_SHRINK_END_LENGTH) {
      return MIN_CONTENT_FONT_SIZE;
    }

    const shrinkRange = CONTENT_SHRINK_END_LENGTH - CONTENT_SHRINK_START_LENGTH;
    const ratio = (length - CONTENT_SHRINK_START_LENGTH) / shrinkRange;
    return MAX_CONTENT_FONT_SIZE - ratio * (MAX_CONTENT_FONT_SIZE - MIN_CONTENT_FONT_SIZE);
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
}
