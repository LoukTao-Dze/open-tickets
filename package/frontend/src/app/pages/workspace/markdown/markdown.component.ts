import {
  Component,
  ElementRef,
  HostListener,
  Input,
  ViewChild,
  inject,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MarkdownItem } from '../../../interface/workspace.interface';
import {
  computeResizedRect,
  ResizeCorner,
  ResizeStart,
  startResize,
} from '../shared/item-resize.util';
import { renderMarkdown } from '../shared/markdown-render.util';

const MIN_WIDTH = 200;
const MIN_HEIGHT = 120;

@Component({
  selector: 'app-markdown',
  standalone: true,
  imports: [],
  templateUrl: './markdown.component.html',
  styleUrl: './markdown.component.scss',
})
export class MarkdownComponent {
  @Input({ required: true }) item!: MarkdownItem;
  @Input() zoom = 1;

  @ViewChild('sourceInput')
  set sourceInput(element: ElementRef<HTMLTextAreaElement> | undefined) {
    element?.nativeElement.focus();
  }

  isEditing = false;

  private readonly sanitizer = inject(DomSanitizer);
  private renderedSource: string | null = null;
  private renderedHtml: SafeHtml = '';

  private isResizing = false;
  private activeCorner: ResizeCorner | null = null;
  private resizeStart: ResizeStart = { x: 0, y: 0, width: 0, height: 0, itemX: 0, itemY: 0 };

  get previewHtml(): SafeHtml {
    if (this.renderedSource !== this.item.content) {
      this.renderedSource = this.item.content;
      // Security: renderMarkdown sanitizes with DOMPurify, so bypassing Angular's sanitizer here is safe.
      this.renderedHtml = this.sanitizer.bypassSecurityTrustHtml(renderMarkdown(this.item.content));
    }
    return this.renderedHtml;
  }

  get isEmpty(): boolean {
    return this.item.content.trim() === '';
  }

  onContentInput(value: string) {
    this.item.content = value;
  }

  onSourceMouseDown(event: MouseEvent) {
    event.stopPropagation();
  }

  startEditing() {
    this.isEditing = true;
  }

  stopEditing() {
    this.isEditing = false;
  }

  onResizeMouseDown(event: MouseEvent, corner: ResizeCorner) {
    event.stopPropagation();
    event.preventDefault();

    this.isResizing = true;
    this.activeCorner = corner;
    this.resizeStart = startResize(event, this.item);
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

    this.item.x = rect.x;
    this.item.y = rect.y;
    this.item.width = rect.width;
    this.item.height = rect.height;
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp() {
    this.isResizing = false;
    this.activeCorner = null;
  }
}
