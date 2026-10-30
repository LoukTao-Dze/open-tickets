import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { routes } from '../app.routes';
import { AuthService } from '../services/auth.service';

@Component({ template: '' })
class TestPageComponent {}

describe('Auth guard routing', () => {
  const getSession = vi.fn();

  beforeEach(() => {
    getSession.mockReset();
    getSession.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { getSession } },
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
    '/overview',
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
});
