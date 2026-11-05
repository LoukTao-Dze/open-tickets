import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../environments/environment';
import { apiCredentialsInterceptor } from './api-credentials.interceptor';

describe('apiCredentialsInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiCredentialsInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  });

  it('sends credentials to the API', () => {
    http.get(`${environment.apiBaseUrl}/api/projects/get-projects`).subscribe();
    const request = controller.expectOne(`${environment.apiBaseUrl}/api/projects/get-projects`);
    expect(request.request.withCredentials).toBe(true);
  });

  it('leaves other requests untouched', () => {
    http.get('https://example.com/data').subscribe();
    const request = controller.expectOne('https://example.com/data');
    expect(request.request.withCredentials).toBe(false);
  });
});
