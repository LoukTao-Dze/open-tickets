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

  getProjects(): Observable<KanbanProject[]> {
    return this.httpClient
      .get<ApiResponse<KanbanProject[]>>(`${this.baseUrl}/get-projects`)
      .pipe(map((response) => response.data));
  }

  getProgressLogs(projectId: string): Observable<ProjectProgressLogsResponse> {
    return this.httpClient
      .get<ApiResponse<{ logs: ProjectProgressLog[]; canEdit: boolean }>>(
        `${this.baseUrl}/${encodeURIComponent(projectId)}/progress-logs`,
      )
      .pipe(map((response) => response.data));
  }

  createProgressLog(
    projectId: string,
    payload: CreateProjectProgressLog,
  ): Observable<ProjectProgressLog> {
    return this.httpClient
      .post<ApiResponse<ProjectProgressLog>>(
        `${this.baseUrl}/${encodeURIComponent(projectId)}/progress-logs`,
        payload,
      )
      .pipe(map((response) => response.data));
  }

  deleteProgressLog(projectId: string, logId: string): Observable<{ id: string }> {
    return this.httpClient
      .delete<ApiResponse<{ id: string }>>(
        `${this.baseUrl}/${encodeURIComponent(projectId)}/progress-logs/${encodeURIComponent(logId)}`,
      )
      .pipe(map((response) => response.data));
  }

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

export interface ProjectProgressLog {
  id: string;
  projectId: string;
  date: string;
  details: string;
  createdBy: string;
  createdAt: string;
}

export interface ProjectProgressLogsResponse {
  logs: ProjectProgressLog[];
  canEdit: boolean;
}

export interface CreateProjectProgressLog {
  date: string;
  details: string;
}
