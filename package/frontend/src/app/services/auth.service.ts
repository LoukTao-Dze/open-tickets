import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AuthSession {
  user: {
    user_id: string;
    username: string;
    auth_provider: 'token';
    role: 'guest';
  };
  expires_at: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/api/auth`;

  loginWithToken(token: string): Observable<AuthSession> {
    return this.http.post<AuthSession>(
      `${this.baseUrl}/login/token`,
      { token },
      { withCredentials: true },
    );
  }

  getSession(): Observable<AuthSession> {
    return this.http.get<AuthSession>(`${this.baseUrl}/session`, { withCredentials: true });
  }
}
