import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UploadImageService {
  private readonly uploadImageUrl = `${environment.apiBaseUrl}/api/upload-image`;

  constructor(private readonly httpClient: HttpClient) {}

  uploadImage(image: File, id?: number) {
    if (!image) {
      throw new Error('Image file is required.');
    }
    if (!id) {
      throw new Error('Image ID is required.');
    }
    const formData = new FormData();
    formData.append('imageBuffer', image);
    return this.httpClient.post(`${this.uploadImageUrl}/${id}`, formData);
  }
}
