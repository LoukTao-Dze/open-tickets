import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import {
  KanbanColumn,
  KanbanColumnId,
  KanbanProject,
  KanbanTicket,
} from '../interface/kanban.interface';

export interface KanbanTicketPayload {
  columnId: KanbanColumnId;
  title: string;
  detail?: string;
  priority: string;
  projectId: string;
  assigneeAlt: string;
  createDate?: string;
  updateDate?: string;
  taskType?: string;
  jobType?: string;
}

interface ApiResponse<T> {
  message?: string;
  data: T;
}

@Injectable({ providedIn: 'root' })
export class KanbanApiService {
  private readonly baseUrl = `${environment.apiBaseUrl}/api/kanban`;

  constructor(private readonly httpClient: HttpClient) {}

  getBoard(): Observable<KanbanColumn[]> {
    return this.httpClient
      .get<ApiResponse<KanbanColumn[]>>(`${this.baseUrl}/board`)
      .pipe(map((response) => response.data));
  }

  getProjects(): Observable<KanbanProject[]> {
    return this.httpClient
      .get<ApiResponse<KanbanProject[]>>(`${this.baseUrl}/projects`)
      .pipe(map((response) => response.data));
  }

  createTicket(payload: KanbanTicketPayload): Observable<KanbanTicket> {
    return this.httpClient
      .post<ApiResponse<KanbanTicket>>(`${this.baseUrl}/tickets`, payload)
      .pipe(map((response) => response.data));
  }

  updateTicket(id: string, payload: Partial<KanbanTicketPayload>): Observable<KanbanTicket> {
    return this.httpClient
      .put<ApiResponse<KanbanTicket>>(`${this.baseUrl}/tickets/${id}`, payload)
      .pipe(map((response) => response.data));
  }

  moveTicket(id: string, columnId: KanbanColumnId): Observable<KanbanTicket> {
    return this.httpClient
      .patch<ApiResponse<KanbanTicket>>(`${this.baseUrl}/tickets/${id}/column`, { columnId })
      .pipe(map((response) => response.data));
  }

  deleteTicket(id: string): Observable<{ id: string }> {
    return this.httpClient
      .delete<ApiResponse<{ id: string }>>(`${this.baseUrl}/tickets/${id}`)
      .pipe(map((response) => response.data));
  }
}
