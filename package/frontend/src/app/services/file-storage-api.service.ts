import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface StorageFolder {
  id: string;
  name: string;
  parentId: string | null;
  modifiedAt: string;
}

export interface StorageFile {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  parentId: string | null;
  modifiedAt: string;
}

export interface StorageItems {
  folders: StorageFolder[];
  files: StorageFile[];
}

@Injectable({ providedIn: 'root' })
export class FileStorageApiService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/file-storage/projects`;

  constructor(private readonly httpClient: HttpClient) {}

  getItems(projectId: string): Observable<StorageItems> {
    return this.httpClient.get<StorageItems>(`${this.baseUrl}/${projectId}/items`);
  }

  createFolder(projectId: string, name: string, parentFolderId: string | null) {
    console.info(
      '\x1b[7;31;40m[DEBUGGER] ->> createFolder\x1b[0m',
      `${this.baseUrl}/${projectId}/folders`,
    );
    return this.httpClient.post<StorageFolder>(`${this.baseUrl}/${projectId}/folders`, {
      name,
      parentFolderId,
    });
  }

  deleteFolder(projectId: string, folderId: string): Observable<{ id: string }> {
    return this.httpClient.delete<{ id: string }>(
      `${this.baseUrl}/${projectId}/folders/${folderId}`,
    );
  }

  uploadFile(projectId: string, file: File, folderId: string | null): Observable<StorageFile> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    let params = new HttpParams();
    if (folderId) {
      params = params.set('folderId', folderId);
    }
    return this.httpClient.post<StorageFile>(`${this.baseUrl}/${projectId}/files`, formData, {
      params,
    });
  }

  moveFile(projectId: string, fileId: string, folderId: string | null) {
    return this.httpClient.patch<{ id: string; folderId: string | null }>(
      `${this.baseUrl}/${projectId}/files/${fileId}`,
      { folderId },
    );
  }

  deleteFile(projectId: string, fileId: string) {
    return this.httpClient.delete<{ id: string }>(`${this.baseUrl}/${projectId}/files/${fileId}`);
  }

  downloadFile(projectId: string, fileId: string): Observable<Blob> {
    return this.httpClient.get(`${this.baseUrl}/${projectId}/files/${fileId}/download`, {
      responseType: 'blob',
    });
  }

  getQuota(): Observable<{
    service: string;
    projectId: string;
    usage: StorageItems[];
    limits: StorageItems[];
  }> {
    return this.httpClient.get<{
      service: string;
      projectId: string;
      usage: StorageItems[];
      limits: StorageItems[];
    }>(`${this.baseUrl}/quota`);
  }
}
