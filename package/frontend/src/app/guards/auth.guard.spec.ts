import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, vi } from 'vitest';
import { routes } from '../app.routes';

@Component({ template: '' })
class TestPageComponent {}

describe('Auth guard routing', () => {
  const getCookie = vi.fn();

  beforeEach(() => {
    getCookie.mockReset();
    vi.stubGlobal('cookieStore', { get: getCookie });
    TestBed.configureTestingModule({
      providers: [
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

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

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
    getCookie.mockResolvedValue(null);

    await RouterTestingHarness.create(path);

    expect(TestBed.inject(Router).url).toBe('/login');
    expect(getCookie).toHaveBeenCalledWith('access_token');
  });

  it('allows login without reading the session cookie', async () => {
    await RouterTestingHarness.create('/login');

    expect(TestBed.inject(Router).url).toBe('/login');
    expect(getCookie).not.toHaveBeenCalled();
  });

  it('allows navigation with a non-empty session cookie', async () => {
    getCookie.mockResolvedValue({ value: 'byPass' });

    const harness = await RouterTestingHarness.create('/workspace');
    expect(TestBed.inject(Router).url).toBe('/workspace');

    await harness.navigateByUrl('/projects');
    expect(TestBed.inject(Router).url).toBe('/projects');
    expect(getCookie).toHaveBeenCalledTimes(2);
  });

  it.each(['', '   '])('rejects an empty session cookie (%j)', async (value) => {
    getCookie.mockResolvedValue({ value });

    await RouterTestingHarness.create('/workspace');

    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('redirects on the next navigation after the cookie expires', async () => {
    getCookie.mockResolvedValueOnce({ value: 'byPass' }).mockResolvedValue(null);
    const harness = await RouterTestingHarness.create('/workspace');

    await harness.navigateByUrl('/projects');

    expect(TestBed.inject(Router).url).toBe('/login');
  });

  it('logs cookie read failures and denies navigation', async () => {
    getCookie.mockRejectedValue(new Error('Cookie store unavailable'));
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await RouterTestingHarness.create('/workspace');

    expect(TestBed.inject(Router).url).toBe('/login');
    expect(logError).toHaveBeenCalled();
  });
});
