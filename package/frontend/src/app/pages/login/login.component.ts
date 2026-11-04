import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, switchMap } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';

type LoginMethod = 'google' | 'token';

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
  expires_at: number | null; // Unix timestamp in seconds
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
const generateExpiresAt = (
  time?: number,
  unit?: 'seconds' | 'minutes' | 'hours' | 'days',
): number => {
  const now = Math.floor(Date.now() / 1000);
  if (!time || !unit) return now;
  switch (unit) {
    case 'seconds':
      return now + time;
    case 'minutes':
      return now + time * 60;
    case 'hours':
      return now + time * 3600;
    case 'days':
      return now + time * 86400;
    default:
      return now;
  }
};

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly router = inject(Router);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly auth = inject(AuthService);
  selectedMethod: LoginMethod = 'google';
  isTokenVisible = false;
  statusMessage = '';
  isSubmitting = false;

  constructor() {}

  selectMethod(method: LoginMethod): void {
    this.selectedMethod = method;
    this.statusMessage = '';
  }

  continueWithGoogle(): void {
    const isImplemented = false;
    if (isImplemented) {
      return;
    }
    this.showSignInFailed('Sign-in failed', 'Google sign-in is not implemented.', 'OK');
  }
  generateBypassToken() {
    const MOCK_BYPASS_TOKEN = {
      sub: '0',
      iss: 'open-ticket',
      aud: 'open-ticket-login',
      exp: generateExpiresAt(1, 'days'),
      user_id: '0',
      auth_provider: 'bypass',
      provider_user_id: null,
      email: 'falsy@nullist.com',
      email_verified: false,
      username: 'undefinedz',
      fullname: {
        first: 'undefined',
        last: 'nullist',
        nickname: 'falsy',
      },
      image: '',
      role: 'guest',
      memberships: [],
      created_at: '2027-10-30T00:56:52.287Z',
      expires_at: generateExpiresAt(1, 'days'),
    };
    console.info('\x1b[7;31;40m[DEBUGGER] ->> MOCK_BYPASS_TOKEN\x1b[0m', MOCK_BYPASS_TOKEN);
  }

  submitToken(token: string, event: SubmitEvent): void {
    event.preventDefault();
    if (token === '-g') {
      this.generateBypassToken();
      return;
    }
    if (this.isSubmitting) return;
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      this.statusMessage = 'Enter an access token to continue.';
      return;
    }
    this.isSubmitting = true;
    this.statusMessage = '';
    this.auth
      .loginWithToken(trimmedToken)
      .pipe(switchMap(() => this.auth.getSession()))
      .subscribe({
        next: (response) => {
          console.log('Login successful', response);
          this.router.navigateByUrl('/workspace');
        },
        error: (error) => {
          console.log('Login failed', error);
          if (error instanceof HttpErrorResponse && error.status === 401) {
            this.statusMessage = 'Invalid or expired access token.';
          } else if (error instanceof HttpErrorResponse && error.status === 429) {
            this.statusMessage = 'Too many sign-in attempts. Please try again in a minute.';
          } else {
            this.statusMessage =
              'Unable to sign in. Please check your connection and cookie settings.';
          }
          this.showSignInFailed('Sign-in failed', this.statusMessage, 'Try again');
          this.isSubmitting = false;
        },
      });
  }

  private showSignInFailed(title: string, message: string, confirmText: string): void {
    this.confirmDialog
      .confirm({
        title,
        message,
        confirmText,
        config: { confirmColor: 'error', disableClose: true },
      })
      .subscribe();
  }
}
