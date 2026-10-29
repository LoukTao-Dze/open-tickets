import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  const confirm = vi.fn(() => of(false));

  beforeEach(async () => {
    confirm.mockClear();
    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [provideRouter([]), { provide: ConfirmDialogService, useValue: { confirm } }],
    }).compileComponents();
  });

  it('saves the session before navigating to the workspace', async () => {
    const router = TestBed.inject(Router);
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(LoginComponent);
    const saveCookie = vi
      .spyOn(fixture.componentInstance, 'setCookieStore')
      .mockImplementation(async () => {
        expect(navigateByUrl).not.toHaveBeenCalled();
      });
    const event = new Event('submit', { cancelable: true }) as SubmitEvent;

    await fixture.componentInstance.submitToken('byPass', event);

    expect(event.defaultPrevented).toBe(true);
    expect(saveCookie).toHaveBeenCalledWith('access_token', 'byPass');
    expect(navigateByUrl).toHaveBeenCalledWith('/workspace');
  });

  it('stays on login and reports a session cookie failure', async () => {
    const navigateByUrl = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    const fixture = TestBed.createComponent(LoginComponent);
    vi.spyOn(fixture.componentInstance, 'setCookieStore').mockRejectedValue(
      new Error('Cookie store unavailable'),
    );
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await fixture.componentInstance.submitToken(
        'byPass',
        new Event('submit', { cancelable: true }) as SubmitEvent,
      );

      expect(navigateByUrl).not.toHaveBeenCalled();
      expect(fixture.componentInstance.statusMessage).toContain('Unable to save your session');
      expect(logError).toHaveBeenCalled();
    } finally {
      logError.mockRestore();
    }
  });

  it('calculates the expiry timestamp for the requested time unit', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const fixture = TestBed.createComponent(LoginComponent);

      expect(fixture.componentInstance.generateTimeToExpiry(2, 'hours')).toBe(
        Date.now() + 2 * 60 * 60 * 1000,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('allows switching between Google and token sign-in', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const methodButtons = element.querySelectorAll<HTMLButtonElement>('.method-switch button');

    expect(element.querySelector('.google-button')).toBeTruthy();
    expect(element.querySelector('#access-token')).toBeNull();

    methodButtons[1].click();
    fixture.detectChanges();

    const tokenInput = element.querySelector<HTMLInputElement>('#access-token');
    expect(tokenInput?.type).toBe('password');
    expect(element.querySelector('.google-button')).toBeNull();

    element.querySelector<HTMLButtonElement>('.visibility-button')?.click();
    fixture.detectChanges();
    expect(tokenInput?.type).toBe('text');

    tokenInput!.value = 'preview-token';
    element
      .querySelector('form')
      ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(confirm).not.toHaveBeenCalled();
  });

  it('shows an unavailable dialog when Google sign-in is not implemented', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.google-button').click();

    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Sign-in unavailable',
        message: 'This sign-in option is not set up yet. Please try again later.',
      }),
    );
  });
});
