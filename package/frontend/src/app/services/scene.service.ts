import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiResponse } from './kanban-api.service';

export enum SceneStatus {
  NotStart = 'not-start',
  InProgress = 'in-progress',
  Pass = 'pass',
}

export interface SceneInput {
  suiteId: string;
  sceneNo: string;
  test: string;
  status: SceneStatus;
  detailsIssue: string;
  expectedResult: string;
  action: string;
  dataTest: string;
  remark: string;
}

export interface TestSuite {
  id: string;
  projectId: string;
  name: string;
  description: string;
  createdAt: string;
  lastSceneUpdateAt: string | null;
  kanbanTicketIds: string[];
}

export interface SuiteInput {
  name: string;
  description: string;
  kanbanTicketIds: string[];
  projectId?: string;
}

export interface Scene extends Omit<SceneInput, 'suiteId'> {
  suiteId: string | null;
  id: string;
  projectId: string;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class SceneService {
  constructor(private readonly http: HttpClient) {}

  private url(projectId: string): string {
    return `${environment.apiBaseUrl}/api/projects/${encodeURIComponent(projectId)}/scenes`;
  }

  private suiteUrl(projectId: string): string {
    return `${environment.apiBaseUrl}/api/projects/${encodeURIComponent(projectId)}/test-suites`;
  }

  list(projectId: string) {
    return this.http
      .get<ApiResponse<{ scenes: Scene[]; suites: TestSuite[]; canEdit: boolean }>>(
        this.url(projectId),
      )
      .pipe(map((response) => response.data));
  }

  createSuite(projectId: string, suite: SuiteInput) {
    return this.http
      .post<ApiResponse<TestSuite>>(this.suiteUrl(projectId), suite)
      .pipe(map((response) => response.data));
  }

  updateSuite(projectId: string, suiteId: string, suite: SuiteInput) {
    return this.http
      .put<ApiResponse<TestSuite>>(
        `${this.suiteUrl(projectId)}/${encodeURIComponent(suiteId)}`,
        suite,
      )
      .pipe(map((response) => response.data));
  }

  deleteSuite(projectId: string, suiteId: string) {
    return this.http
      .delete<ApiResponse<{ id: string }>>(
        `${this.suiteUrl(projectId)}/${encodeURIComponent(suiteId)}`,
      )
      .pipe(map((response) => response.data));
  }

  create(projectId: string, scene: SceneInput) {
    return this.http
      .post<ApiResponse<Scene>>(this.url(projectId), scene)
      .pipe(map((response) => response.data));
  }

  update(projectId: string, sceneId: string, scene: SceneInput) {
    return this.http
      .put<ApiResponse<Scene>>(`${this.url(projectId)}/${encodeURIComponent(sceneId)}`, scene)
      .pipe(map((response) => response.data));
  }

  delete(projectId: string, sceneId: string) {
    return this.http
      .delete<ApiResponse<{ id: string }>>(`${this.url(projectId)}/${encodeURIComponent(sceneId)}`)
      .pipe(map((response) => response.data));
  }

  updateStatus(projectId: string, sceneId: string, status: SceneStatus) {
    return this.http
      .patch<ApiResponse<Scene>>(`${this.url(projectId)}/${encodeURIComponent(sceneId)}/status`, {
        status,
      })
      .pipe(map((response) => response.data));
  }
}
