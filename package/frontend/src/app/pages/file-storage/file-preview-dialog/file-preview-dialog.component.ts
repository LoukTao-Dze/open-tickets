import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { SafeResourceUrl } from '@angular/platform-browser';
import { StorageFile } from '../../../services/file-storage-api.service';

export type StorageFileKind = 'pdf' | 'image' | 'code' | 'document' | 'other';

@Component({
  selector: 'app-file-preview-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './file-preview-dialog.component.html',
  styleUrl: './file-preview-dialog.component.scss',
})
export class FilePreviewDialogComponent {
  @Input({ required: true }) file!: StorageFile;
  @Input({ required: true }) fileKind!: StorageFileKind;
  @Input({ required: true }) fileIcon!: string;
  @Input({ required: true }) formattedFileSize!: string;
  @Input() previewUrl: SafeResourceUrl | null = null;
  @Input() previewObjectUrl: string | null = null;
  @Input() previewText: string | null = null;
  @Input() isLoading = false;
  @Input() error = '';

  @Output() closed = new EventEmitter<void>();
  @Output() downloadRequested = new EventEmitter<void>();

  close(): void {
    this.closed.emit();
  }

  requestDownload(): void {
    this.downloadRequested.emit();
  }
}
