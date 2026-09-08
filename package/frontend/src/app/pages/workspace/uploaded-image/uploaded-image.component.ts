import { Component, HostListener, Input, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UploadImageService } from '../../../services/upload-image.service';
import { UploadedImageItem } from '../../../interface/workspace.interface';
import {
  computeResizedRect,
  ResizeCorner,
  ResizeStart,
  startResize,
} from '../shared/item-resize.util';

const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const MIN_WIDTH = 80;
const MIN_HEIGHT = 80;

@Component({
  selector: 'app-uploaded-image',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './uploaded-image.component.html',
  styleUrl: './uploaded-image.component.scss',
})
export class UploadedImageComponent {
  @Input({ required: true }) image!: UploadedImageItem;
  @Input() zoom = 1;
  constructor(
    private cdr: ChangeDetectorRef,
    private uploadImageService: UploadImageService,
  ) {}

  private isResizing = false;
  private activeCorner: ResizeCorner | null = null;
  private resizeStart: ResizeStart = { x: 0, y: 0, width: 0, height: 0, itemX: 0, itemY: 0 };

  triggerUpload(fileInput: HTMLInputElement) {
    if (this.image.imageUrl) return;
    fileInput.click();
  }

  onUploadMouseDown(event: MouseEvent) {
    event.stopPropagation();
  }

  onResizeMouseDown(event: MouseEvent, corner: ResizeCorner) {
    event.stopPropagation();
    event.preventDefault();

    this.isResizing = true;
    this.activeCorner = corner;
    this.resizeStart = startResize(event, this.image);
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

    this.image.x = rect.x;
    this.image.y = rect.y;
    this.image.width = rect.width;
    this.image.height = rect.height;
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp() {
    this.isResizing = false;
    this.activeCorner = null;
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      console.warn('Image upload rejected: selected file is not an image', {
        fileType: file.type,
      });
      return;
    }

    if (file.size > MAX_IMAGE_FILE_SIZE_BYTES) {
      console.warn('Image upload rejected: file exceeds max allowed size', {
        fileSize: file.size,
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.image.imageUrl = reader.result as string;
      this.image.fileName = file.name;
      this.image.imageAlt = file.name;
      this.image.statusIcon = 'check_circle';
      this.image.statusIconClass = 'text-primary';
    };

    this.uploadImageService.uploadImage(file, this.image.id).subscribe({
      next: (response) => {
        reader.readAsDataURL(file);
        this.cdr.detectChanges();
      },
      error: (error) => {
        console.error('Failed to upload image:', error);
      },
    });
  }
}
