import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

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
      `${environment.apiBaseUrl}/api/auth/login/token`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ token: 'signed-jwt' });
    expect(request.request.withCredentials).toBe(true);
    request.flush({});
  });

  it('checks the HttpOnly cookie session with credentials enabled', () => {
    TestBed.inject(AuthService).getSession().subscribe();
    const request = TestBed.inject(HttpTestingController).expectOne(
      `${environment.apiBaseUrl}/api/auth/session`,
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    request.flush({});
  });
});
