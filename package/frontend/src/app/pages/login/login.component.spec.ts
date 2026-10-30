import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../services/auth.service';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  const confirm = vi.fn(() => of(false));
  const auth = { loginWithToken: vi.fn(), getSession: vi.fn() };
  const session = {
    user: {
      user_id: 'mock-user',
      username: 'mock-user',
      auth_provider: 'token' as const,
      role: 'guest' as const,
    },
    expires_at: '2026-10-30T00:00:00Z',
  };
  const submitEvent = () => new Event('submit', { cancelable: true }) as SubmitEvent;

  beforeEach(async () => {
    vi.clearAllMocks();
    auth.loginWithToken.mockReturnValue(of(session));
    auth.getSession.mockReturnValue(of(session));
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: ConfirmDialogService, useValue: { confirm } },
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();
  });

  afterEach(() => vi.restoreAllMocks());

  it('logs in and verifies the server session before navigating', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    const event = submitEvent();
    await component.submitToken(' signed-jwt ', event);
    expect(event.defaultPrevented).toBe(true);
    expect(auth.loginWithToken).toHaveBeenCalledWith('signed-jwt');
    expect(auth.getSession).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('/workspace');
    expect(component.isSubmitting).toBe(false);
  });

  it('rejects empty input without calling the backend', async () => {
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    await component.submitToken('  ', submitEvent());
    expect(auth.loginWithToken).not.toHaveBeenCalled();
    expect(component.statusMessage).toContain('Enter an access token');
  });

  it.each([
    [401, 'Invalid or expired'],
    [429, 'Too many sign-in attempts'],
    [503, 'Unable to sign in'],
    [0, 'Unable to sign in'],
  ])('stays on login for HTTP %s', async (status, message) => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    auth.loginWithToken.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    await component.submitToken('jwt', submitEvent());
    expect(navigate).not.toHaveBeenCalled();
    expect(auth.getSession).not.toHaveBeenCalled();
    expect(component.statusMessage).toContain(message);
    expect(component.isSubmitting).toBe(false);
  });

  it('does not navigate if the browser did not accept the session cookie', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    auth.getSession.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    await component.submitToken('jwt', submitEvent());
    expect(navigate).not.toHaveBeenCalled();
    expect(component.statusMessage).toBeTruthy();
  });

  it('prevents duplicate submissions while waiting', async () => {
    const pending = new Subject<typeof session>();
    auth.loginWithToken.mockReturnValue(pending);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const component = TestBed.createComponent(LoginComponent).componentInstance;
    const first = component.submitToken('jwt', submitEvent());
    await component.submitToken('jwt', submitEvent());
    expect(auth.loginWithToken).toHaveBeenCalledOnce();
    expect(component.isSubmitting).toBe(true);
    pending.next(session);
    pending.complete();
    await first;
    expect(component.isSubmitting).toBe(false);
  });

  it('allows switching methods and toggling token visibility', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.google-button')).toBeTruthy();
    element.querySelectorAll<HTMLButtonElement>('.method-switch button')[1].click();
    fixture.detectChanges();
    const tokenInput = element.querySelector<HTMLInputElement>('#access-token');
    expect(tokenInput?.type).toBe('password');
    element.querySelector<HTMLButtonElement>('.visibility-button')?.click();
    fixture.detectChanges();
    expect(tokenInput?.type).toBe('text');
  });

  it('shows an unavailable dialog for Google sign-in', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.google-button').click();
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sign-in unavailable' }));
  });
});
