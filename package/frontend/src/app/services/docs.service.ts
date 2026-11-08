import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export interface UserGuide {
  content: string;
  updatedAt: string;
}

export interface GuideResponse {
  data: UserGuide;
}

@Injectable({ providedIn: 'root' })
export class DocsService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/api/docs`;

  load() {
    return this.http.get<GuideResponse>(this.url, { withCredentials: true });
  }

  save(guide: UserGuide) {
    return this.http.put<GuideResponse>(this.url, guide, { withCredentials: true });
  }
}
