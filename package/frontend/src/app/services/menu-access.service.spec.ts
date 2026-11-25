import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService, AuthSession } from './auth.service';
import { MenuAccessService } from './menu-access.service';

describe('MenuAccessService', () => {
  const session: AuthSession = {
    user: { user_id: 'user-1', username: 'user', role: 'user', auth_provider: 'token' },
    expires_at: '2099-01-01T00:00:00Z',
  };
  let currentSession: AuthSession | null;
  const sessionVersion = signal(0);
  let service: MenuAccessService;
  let http: HttpTestingController;

  beforeEach(() => {
    currentSession = session;
    sessionVersion.set(0);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            get cachedSession() {
              return currentSession;
            },
            sessionVersion,
          },
        },
      ],
    });
    service = TestBed.inject(MenuAccessService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses only server-saved menus and refreshes on later navigation', async () => {
    const first = service.refresh(session);
    const request = http.expectOne('/api/roles/my-menu');
    expect(request.request.withCredentials).toBe(true);
    request.flush(['workspace', 'projects']);
    await first;
    expect(service.menus()).toEqual(['workspace', 'projects']);

    const second = service.refresh(session);
    http.expectOne('/api/roles/my-menu').flush(['projects']);
    await second;
    expect(service.menus()).toEqual(['projects']);
  });

  it('fails closed on a malformed or failed response', async () => {
    const first = service.refresh(session);
    http.expectOne('/api/roles/my-menu').flush(['workspace']);
    await first;
    const second = service.refresh(session);
    http.expectOne('/api/roles/my-menu').flush(['unknown']);
    await expect(second).rejects.toThrow('Invalid menu access response');
    expect(service.menus()).toEqual([]);
    expect(service.loadFailed()).toBe(true);

    const third = service.refresh(session);
    http.expectOne('/api/roles/my-menu').flush({}, { status: 500, statusText: 'Error' });
    await expect(third).rejects.toBeDefined();
    expect(service.menus()).toEqual([]);
  });

  it('does not expose previous-session menus or accept a stale response', async () => {
    const first = service.refresh(session);
    const request = http.expectOne('/api/roles/my-menu');
    currentSession = null;
    sessionVersion.update((version) => version + 1);
    expect(service.menus()).toEqual([]);
    currentSession = { ...session, user: { ...session.user, user_id: 'user-2', role: 'guest' } };
    sessionVersion.update((version) => version + 1);
    const second = service.refresh(currentSession);
    http.expectOne('/api/roles/my-menu').flush(['scenes']);
    await second;
    request.flush(['workspace']);
    await first;
    expect(service.menus()).toEqual(['scenes']);
  });

  it('does not reuse menus when the same user starts a new session', async () => {
    const first = service.refresh(session);
    http.expectOne('/api/roles/my-menu').flush(['workspace']);
    await first;
    currentSession = null;
    sessionVersion.update((version) => version + 1);
    currentSession = session;
    sessionVersion.update((version) => version + 1);
    expect(service.menus()).toEqual([]);
  });
});
