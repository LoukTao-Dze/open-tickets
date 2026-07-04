import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UploadedImageItem } from '../../../interface/workspace.interface';

const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024;

@Component({
  selector: 'app-uploaded-image',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './uploaded-image.component.html',
  styleUrl: './uploaded-image.component.scss',
})
export class UploadedImageComponent {
  @Input({ required: true }) image!: UploadedImageItem;

  triggerUpload(fileInput: HTMLInputElement) {
    fileInput.click();
  }

  onUploadMouseDown(event: MouseEvent) {
    event.stopPropagation();
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
    reader.readAsDataURL(file);
  }
}
