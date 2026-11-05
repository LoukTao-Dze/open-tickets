import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../environments/environment';

const API_URL_PREFIX = `${environment.apiBaseUrl}/api/`;

// The backend decides which projects a role may see from the session cookie.
export const apiCredentialsInterceptor: HttpInterceptorFn = (request, next) =>
  request.url.startsWith(API_URL_PREFIX)
    ? next(request.clone({ withCredentials: true }))
    : next(request);
