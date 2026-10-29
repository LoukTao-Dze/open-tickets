import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

const ACCESS_TOKEN_COOKIE = 'access_token';
const LOGIN_ROUTE = '/login';

// Client-side navigation check only; protected APIs must validate the session server-side.
export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);

  try {
    const cookie = await window.cookieStore.get(ACCESS_TOKEN_COOKIE);
    return cookie?.value?.trim() ? true : router.parseUrl(LOGIN_ROUTE);
  } catch {
    console.error('Unable to read the session cookie; redirecting to login.');
    return router.parseUrl(LOGIN_ROUTE);
  }
};
