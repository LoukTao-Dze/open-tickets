import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService, AuthSession } from '../services/auth.service';
import { HeaderComponent } from './header.component';

const ACCOUNT_SESSION: AuthSession = {
  user: { user_id: 'account-1', username: 'ticket-user', auth_provider: 'token', role: 'guest' },
  expires_at: '2026-11-01T00:00:00Z',
};

describe('HeaderComponent account options', () => {
  let fixture: ComponentFixture<HeaderComponent>;
  const auth = {
    getSession: vi.fn(),
    logout: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    auth.getSession.mockReturnValue(of(ACCOUNT_SESSION));
    auth.logout.mockReturnValue(of(undefined));
    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    }).compileComponents();
    fixture = TestBed.createComponent(HeaderComponent);
    fixture.detectChanges();
  });

  it('opens the disclosure and closes on outside click or Escape, restoring keyboard focus', () => {
    const menu = fixture.componentInstance.accountMenu().nativeElement;
    const trigger = fixture.componentInstance.accountTrigger().nativeElement;
    trigger.click();
    expect(menu.open).toBe(true);
    document.body.click();
    expect(menu.open).toBe(false);
    trigger.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('loads the username and role only when Profile is expanded', async () => {
    expect(auth.getSession).not.toHaveBeenCalled();
    await fixture.componentInstance.toggleProfile();
    fixture.detectChanges();
    const profile: HTMLElement = fixture.nativeElement.querySelector('#account-profile');
    expect(profile.hidden).toBe(false);
    expect(profile.textContent).toContain(ACCOUNT_SESSION.user.username);
    expect(profile.textContent).toContain(ACCOUNT_SESSION.user.role);
    await fixture.componentInstance.toggleProfile();
    fixture.detectChanges();
    expect(profile.hidden).toBe(true);
    await fixture.componentInstance.toggleProfile();
    expect(auth.getSession).toHaveBeenCalledTimes(1);
  });

  it('shows a profile failure and allows retrying', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    auth.getSession.mockReturnValueOnce(throwError(() => new Error('Offline')));
    await fixture.componentInstance.toggleProfile();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Unable to load profile',
    );
    await fixture.componentInstance.toggleProfile();
    await fixture.componentInstance.toggleProfile();
    expect(fixture.componentInstance.session()).toEqual(ACCOUNT_SESSION);
    expect(fixture.componentInstance.accountError()).toBe('');
    vi.restoreAllMocks();
  });

  it('waits for logout confirmation and prevents duplicate logout requests', async () => {
    const pendingLogout = new Subject<void>();
    auth.logout.mockReturnValue(pendingLogout);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const logout = fixture.componentInstance.logout();
    await fixture.componentInstance.logout();
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.componentInstance.isLoggingOut()).toBe(true);
    pendingLogout.next();
    pendingLogout.complete();
    await logout;
    expect(navigate).toHaveBeenCalledWith('/login');
    expect(fixture.componentInstance.isLoggingOut()).toBe(false);
  });

  it('keeps the user on the current page when logout fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    auth.logout.mockReturnValue(throwError(() => new Error('Offline')));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');
    await fixture.componentInstance.logout();
    fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();
    expect(fixture.componentInstance.isLoggingOut()).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Unable to log out',
    );
    vi.restoreAllMocks();
  });
});
