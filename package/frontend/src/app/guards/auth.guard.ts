import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../services/auth.service';

const LOGIN_ROUTE = '/login';

// HttpOnly cookies are verified by the backend, never read by browser JavaScript.
export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const auth = inject(AuthService);

  try {
    await firstValueFrom(auth.getSession());
    return true;
  } catch (error: unknown) {
    if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
      console.error('Unable to verify the session; redirecting to login.');
    }
    return router.parseUrl(LOGIN_ROUTE);
  }
};
