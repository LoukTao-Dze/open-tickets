import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
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
const MOCK_USER_PROFILE_TOKEN: UserProfile = {
  user_id: '0',
  auth_provider: 'token',
  provider_user_id: null,
  email: 'falsy@nullist.com',
  email_verified: false,
  username: 'undefinedz',
  fullname: { first: 'undefined', last: 'nullist', nickname: 'falsy' },
  image: '',
  role: EnumUserRole.GUEST,
  memberships: [],
  created_at: new Date().toISOString(),
  expires_at: generateExpiresAt(1, 'days'),
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
    this.showSignInUnavailable();
  }

  async submitToken(token: string, event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (this.isSubmitting) return;
    const trimmedToken = token.trim();
    if (!trimmedToken) {
      this.statusMessage = 'Enter an access token to continue.';
      return;
    }
    this.isSubmitting = true;
    this.statusMessage = '';
    try {
      await firstValueFrom(this.auth.loginWithToken(trimmedToken));
      // Confirm the browser accepted the HttpOnly cookie before leaving login.
      await firstValueFrom(this.auth.getSession());
      await this.router.navigateByUrl('/workspace');
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.statusMessage = 'Invalid or expired access token.';
      } else if (error instanceof HttpErrorResponse && error.status === 429) {
        this.statusMessage = 'Too many sign-in attempts. Please try again in a minute.';
      } else {
        console.error('Token sign-in failed.');
        this.statusMessage = 'Unable to sign in. Please check your connection and cookie settings.';
      }
      this.isSubmitting = false;
    } finally {
      this.isSubmitting = false;
    }
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
}
