import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

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
  // Same-origin path (proxied by the dev server / Vercel rewrite) keeps the session cookie first-party.
  private readonly baseUrl = '/api/auth';

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

  logout(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/logout`, {}, { withCredentials: true });
  }
}
