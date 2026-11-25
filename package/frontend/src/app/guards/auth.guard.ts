import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { MenuAccessService } from '../services/menu-access.service';
import { MAIN_MENUS } from '../shared/menu-access';

const LOGIN_ROUTE = '/login';

// HttpOnly cookies are verified by the backend, never read by browser JavaScript.
export const authGuard: CanActivateFn = async (route) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  const menuAccess = inject(MenuAccessService);

  try {
    const session = await firstValueFrom(auth.getSession());
    try {
      await menuAccess.refresh(session);
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse && error.status === 401) throw error;
      console.error('Unable to load menu access.');
    }
    const menu = MAIN_MENUS.find((item) => item.key === route.routeConfig?.path);
    if (!menu || menuAccess.menus().includes(menu.key)) return true;
    const firstAllowed = MAIN_MENUS.find((item) => menuAccess.menus().includes(item.key));
    return router.parseUrl(firstAllowed ? `/${firstAllowed.key}` : '/support');
  } catch (error: unknown) {
    menuAccess.clear();
    if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
      console.error('Unable to verify the session; redirecting to login.');
    }
    return router.parseUrl(LOGIN_ROUTE);
  }
};
