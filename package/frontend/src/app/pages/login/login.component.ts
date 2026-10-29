import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';

type LoginMethod = 'google' | 'token';
type TimeUnit = 'days' | 'hours' | 'minutes' | 'seconds';

enum EnumPermission {
  USER_MANAGE = 'user:manage',
  TEAM_READ = 'team:read',
  TEAM_MANAGE = 'team:manage',
  MEMBER_MANAGE = 'member:manage',
  PROJECT_READ = 'project:read',
  PROJECT_MANAGE = 'project:manage',
  TICKET_READ = 'ticket:read',
  TICKET_CREATE = 'ticket:create',
  TICKET_UPDATE = 'ticket:update',
  TICKET_DELETE = 'ticket:delete',
}

interface TeamMembership {
  team_id: string;
  role: EnumTeamRole;
}

interface UserProfile {
  user_id: string;
  auth_provider: LoginMethod;
  provider_user_id: string | null;
  email: string | null;
  email_verified: boolean;
  username: string;
  fullname: {
    first: string;
    last: string;
    nickname: string;
  };
  image: string;
  role: EnumUserRole;
  memberships: TeamMembership[];
  created_at: string; // ISO 8601
  expires_at: string; // ISO 8601
}
enum EnumUserRole {
  ADMIN = 'admin',
  USER = 'user',
  GUEST = 'guest',
}

enum EnumTeamRole {
  LEADER = 'leader',
  DEVELOPER = 'developer',
  QA = 'qa',
  SA = 'sa',
  GUEST = 'guest',
}

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly router = inject(Router);
  private readonly confirmDialog = inject(ConfirmDialogService);
  selectedMethod: LoginMethod = 'google';
  isTokenVisible = false;
  statusMessage = '';

  selectMethod(method: LoginMethod): void {
    this.selectedMethod = method;
    this.statusMessage = '';
  }

  continueWithGoogle(): void {
    const isImplemented = false;
    if (isImplemented) {
      const _mockUserProfile: UserProfile = {
        user_id: '',
        auth_provider: 'token',
        provider_user_id: null,
        email: null,
        email_verified: false,
        username: '',
        fullname: { first: '', last: '', nickname: '' },
        image: '',
        role: EnumUserRole.GUEST,
        memberships: [],
        created_at: '',
        expires_at: '',
      };
      console.info('\x1b[7;31;40m[DEBUGGER] ->> _mockUserProfile\x1b[0m', _mockUserProfile);
      return;
    }
    this.showSignInUnavailable();
  }

  async submitToken(token: string, event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (token === 'byPass') {
      try {
        await this.setCookieStore('access_token', token);
      } catch {
        console.error('Unable to save the session cookie.');
        this.statusMessage = 'Unable to save your session. Please try again.';
        return;
      }
      await this.router.navigateByUrl('/workspace');
      return;
    }
    this.statusMessage = token.trim() ? '' : 'Enter an access token to continue.';
  }

  private showSignInUnavailable(): void {
    this.confirmDialog
      .confirm({
        title: 'Sign-in unavailable',
        message: 'This sign-in option is not set up yet. Please try again later.',
        confirmText: 'Got it',
        config: { disableClose: true },
      })
      .subscribe();
  }

  generateTimeToExpiry(time: number, unit: TimeUnit): number {
    const unitToMs: Record<TimeUnit, number> = {
      days: 24 * 60 * 60 * 1000,
      hours: 60 * 60 * 1000,
      minutes: 60 * 1000,
      seconds: 1000,
    };
    return Date.now() + time * unitToMs[unit];
  }

  async setCookieStore(name: string, token: string) {
    await window.cookieStore.set({
      name: name,
      value: token,
      expires: this.generateTimeToExpiry(1, 'days'),
    });
  }
}
