import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../environments/environment';
import { App } from './app.component';

describe('App', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    httpTesting.verify();
    vi.restoreAllMocks();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    httpTesting.expectOne(`${environment.apiBaseUrl}/api/health`);

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should request the health endpoint on startup', () => {
    TestBed.createComponent(App);

    const request = httpTesting.expectOne(`${environment.apiBaseUrl}/api/health`);
    expect(request.request.method).toBe('GET');
  });
});
