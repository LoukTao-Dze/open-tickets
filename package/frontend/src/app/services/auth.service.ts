import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { finalize, Observable, of, shareReplay, tap } from 'rxjs';

export interface AuthSession {
  user: {
    user_id: string;
    username: string;
    auth_provider: 'token' | 'bypass';
    role: string;
  };
  expires_at: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  // Same-origin path (proxied by the dev server / Vercel rewrite) keeps the session cookie first-party.
  private readonly baseUrl = '/api/auth';

  private sessionCache: AuthSession | null = null;
  private pendingSession: Observable<AuthSession> | null = null;
  readonly sessionVersion = signal(0);

  // Expired or missing sessions must not grant UI permissions; this getter never requests data.
  get cachedSession(): AuthSession | null {
    return this.sessionCache && new Date(this.sessionCache.expires_at).getTime() > Date.now()
      ? this.sessionCache
      : null;
  }

  loginWithToken(token: string): Observable<AuthSession | { token: string }> {
    this.clearSession();
    return this.http.post<AuthSession | { token: string }>(
      `${this.baseUrl}/login/token`,
      { token },
      { withCredentials: true },
    );
  }

  // Cached until expires_at (a revoked session is only noticed after that or on logout); concurrent calls share one request.
  getSession(): Observable<AuthSession> {
    const session = this.cachedSession;
    if (session) {
      return of(session);
    }
    this.pendingSession ??= this.http
      .get<AuthSession>(`${this.baseUrl}/session`, { withCredentials: true })
      .pipe(
        tap((session) => {
          this.sessionCache = session;
          this.sessionVersion.update((version) => version + 1);
        }),
        finalize(() => (this.pendingSession = null)),
        shareReplay(1),
      );
    return this.pendingSession;
  }

  logout(): Observable<void> {
    this.clearSession();
    return this.http.post<void>(`${this.baseUrl}/logout`, {}, { withCredentials: true });
  }

  private clearSession(): void {
    this.sessionCache = null;
    this.pendingSession = null;
    this.sessionVersion.update((version) => version + 1);
  }
}
