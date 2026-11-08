import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService, AuthSession } from './auth.service';

const SESSION: AuthSession = {
  user: { user_id: 'account-1', username: 'ticket-user', auth_provider: 'token', role: 'guest' },
  expires_at: '2099-01-01T00:00:00Z',
};

describe('AuthService', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('sends JWT to the backend with credentials enabled', () => {
    TestBed.inject(AuthService).loginWithToken('signed-jwt').subscribe();
    const request = TestBed.inject(HttpTestingController).expectOne(
      '/api/auth/login/token',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ token: 'signed-jwt' });
    expect(request.request.withCredentials).toBe(true);
    request.flush({});
  });

  it('checks the HttpOnly cookie session with credentials enabled', () => {
    TestBed.inject(AuthService).getSession().subscribe();
    const request = TestBed.inject(HttpTestingController).expectOne(
      '/api/auth/session',
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    request.flush({});
  });

  it('reuses the cached session until logout', () => {
    const auth = TestBed.inject(AuthService);
    const http = TestBed.inject(HttpTestingController);
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    auth.getSession().subscribe();
    auth.getSession().subscribe();
    http.expectOne('/api/auth/session').flush({ user: {}, expires_at: expiresAt });
    auth.getSession().subscribe();
    http.expectNone('/api/auth/session');
    auth.logout().subscribe();
    http.expectOne('/api/auth/logout').flush(null);
    auth.getSession().subscribe();
    http.expectOne('/api/auth/session').flush({ user: {}, expires_at: expiresAt });
  });

  it('exposes the cached session without sending a request', () => {
    const auth = TestBed.inject(AuthService);
    const http = TestBed.inject(HttpTestingController);
    expect(auth.cachedSession).toBeNull();
    http.expectNone('/api/auth/session');

    auth.getSession().subscribe();
    http.expectOne('/api/auth/session').flush(SESSION);
    expect(auth.cachedSession).toEqual(SESSION);
    http.expectNone('/api/auth/session');

    auth.logout().subscribe();
    expect(auth.cachedSession).toBeNull();
    http.expectOne('/api/auth/logout').flush(null);
  });

  it.each(['2000-01-01T00:00:00Z', 'invalid'])(
    'does not expose an expired or invalid session (%s)',
    (expiresAt) => {
      const auth = TestBed.inject(AuthService);
      const http = TestBed.inject(HttpTestingController);
      auth.getSession().subscribe();
      http.expectOne('/api/auth/session').flush({ ...SESSION, expires_at: expiresAt });
      expect(auth.cachedSession).toBeNull();
      http.expectNone('/api/auth/session');
    },
  );

  it('clears the cached session when signing in again', () => {
    const auth = TestBed.inject(AuthService);
    const http = TestBed.inject(HttpTestingController);
    auth.getSession().subscribe();
    http.expectOne('/api/auth/session').flush(SESSION);

    auth.loginWithToken('signed-jwt').subscribe();
    expect(auth.cachedSession).toBeNull();
    http.expectOne('/api/auth/login/token').flush(SESSION);
  });

  it('logs out through the backend with credentials enabled', () => {
    TestBed.inject(AuthService).logout().subscribe();
    const request = TestBed.inject(HttpTestingController).expectOne(
      '/api/auth/logout',
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    expect(request.request.withCredentials).toBe(true);
    request.flush(null, { status: 204, statusText: 'No Content' });
  });
});
