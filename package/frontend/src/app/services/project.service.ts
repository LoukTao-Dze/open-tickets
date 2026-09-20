import { Injectable } from '@angular/core';
import { ApiResponse, KanbanProjectPayload } from './kanban-api.service';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { KanbanProject } from '../interface/kanban.interface';

@Injectable({ providedIn: 'root' })
export class ProjectApiService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/projects`;

  constructor(private readonly httpClient: HttpClient) {}

  createProject(payload: KanbanProjectPayload): Observable<KanbanProject> {
    return this.httpClient
      .post<ApiResponse<KanbanProject>>(`${this.baseUrl}/projects`, payload)
      .pipe(map((response) => response.data));
  }

  updateProject(id: string, payload: Partial<KanbanProjectPayload>): Observable<KanbanProject> {
    return this.httpClient
      .put<ApiResponse<KanbanProject>>(`${this.baseUrl}/update/${id}`, payload)
      .pipe(map((response) => response.data));
  }

  deleteProject(id: string): Observable<{ id: string }> {
    return this.httpClient
      .delete<ApiResponse<{ id: string }>>(`${this.baseUrl}/delete/${id}`)
      .pipe(map((response) => response.data));
  }
}
