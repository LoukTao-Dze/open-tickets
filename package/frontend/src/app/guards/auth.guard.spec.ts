import { HttpErrorResponse } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { routes } from '../app.routes';
import { AuthService } from '../services/auth.service';
import { MenuAccessService } from '../services/menu-access.service';
import { MAIN_MENUS, MenuKey } from '../shared/menu-access';

@Component({ template: '' })
class TestPageComponent {}

describe('Auth guard routing', () => {
  const getSession = vi.fn();
  const menus = signal<MenuKey[]>([]);
  const refresh = vi.fn();
  const clear = vi.fn();

  beforeEach(() => {
    getSession.mockReset();
    getSession.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
    menus.set(MAIN_MENUS.map((menu) => menu.key));
    refresh.mockReset().mockResolvedValue(undefined);
    clear.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { getSession } },
        { provide: MenuAccessService, useValue: { menus, refresh, clear } },
        provideRouter(
          routes.map((route) => ({
            ...route,
            loadComponent: undefined,
            component: route.loadComponent ? TestPageComponent : undefined,
          })),
        ),
      ],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it.each([
    '/kanban',
    '/projects',
    '/workspace',
    '/files',
    '/roles',
    '/settings',
    '/support',
    '/docs',
    '/unknown',
  ])('redirects unauthenticated navigation from %s to login', async (path) => {
    await RouterTestingHarness.create(path);
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(getSession).toHaveBeenCalled();
  });

  it('allows login without checking the backend session', async () => {
    await RouterTestingHarness.create('/login');
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(getSession).not.toHaveBeenCalled();
  });

  it('allows navigation only after server-side session verification', async () => {
    getSession.mockReturnValue(of({ user: { user_id: 'mock-user' } }));
    const harness = await RouterTestingHarness.create('/workspace');
    expect(TestBed.inject(Router).url).toBe('/workspace');
    await harness.navigateByUrl('/projects');
    expect(TestBed.inject(Router).url).toBe('/projects');
    expect(getSession).toHaveBeenCalledTimes(2);
  });

  it('redirects on the next navigation after the session expires', async () => {
    getSession.mockReturnValueOnce(of({ user: { user_id: 'mock-user' } }));
    const harness = await RouterTestingHarness.create('/workspace');
    await harness.navigateByUrl('/projects');
    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('logs backend failures and denies navigation', async () => {
    getSession.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await RouterTestingHarness.create('/workspace');
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(logError).toHaveBeenCalled();
  });

  it('redirects a denied menu to the first permitted main menu', async () => {
    getSession.mockReturnValue(of({ user: { user_id: 'mock-user' } }));
    menus.set(['projects', 'scenes']);
    await RouterTestingHarness.create('/workspace');
    expect(TestBed.inject(Router).url).toBe('/projects');
  });

  it('uses Support when no main menu is permitted', async () => {
    getSession.mockReturnValue(of({ user: { user_id: 'mock-user' } }));
    menus.set([]);
    await RouterTestingHarness.create('/workspace');
    expect(TestBed.inject(Router).url).toBe('/support');
  });

  it('refreshes permissions on the next navigation', async () => {
    getSession.mockReturnValue(of({ user: { user_id: 'mock-user' } }));
    const harness = await RouterTestingHarness.create('/workspace');
    menus.set(['projects']);
    await harness.navigateByUrl('/roles');
    expect(TestBed.inject(Router).url).toBe('/projects');
    expect(refresh).toHaveBeenCalled();
  });

  it('denies main menu access when refreshing permissions fails', async () => {
    getSession.mockReturnValue(of({ user: { user_id: 'mock-user' } }));
    refresh.mockImplementation(async () => {
      menus.set([]);
      throw new Error('unavailable');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await RouterTestingHarness.create('/workspace');
    expect(TestBed.inject(Router).url).toBe('/support');
    expect(clear).not.toHaveBeenCalled();
  });

  it('redirects to login if the menu endpoint reports a revoked session', async () => {
    getSession.mockReturnValue(of({ user: { user_id: 'mock-user' } }));
    refresh.mockRejectedValue(new HttpErrorResponse({ status: 401 }));
    await RouterTestingHarness.create('/workspace');
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(clear).toHaveBeenCalled();
  });
});
