import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom, switchMap } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { LoadingService } from '../../services/loading.service';

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
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly loading = inject(LoadingService);

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
  generateBypassToken(role: EnumUserRole, time?: string) {
    const MOCK_BYPASS_TOKEN = {
      sub: '0',
      iss: 'open-ticket',
      aud: 'open-ticket-login',
      exp: generateExpiresAt(time ? parseInt(time) : 1, 'days'),
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
      role: role,
      memberships: [],
      created_at: '2027-10-30T00:56:52.287Z',
      expires_at: generateExpiresAt(time ? parseInt(time) : 1, 'days'),
    };
    console.info('[DEBUGGER] ->> MOCK_BYPASS_TOKEN', MOCK_BYPASS_TOKEN);
    setTimeout(() => {
      this.loading.close();
    }, 1000);
  }

  generateUserRoleToken(stringRole: string, time?: string) {
    const normalizedRole = stringRole.trim().toLowerCase();
    const role = Object.values(EnumUserRole).find((enumRole) => enumRole === normalizedRole);
    if (!role) {
      this.showSignInFailed('Sign-in failed', 'Invalid user role.', 'OK');
      setTimeout(() => {
        this.loading.close();
      }, 1000);
      return;
    }
    this.generateBypassToken(role, time);
  }

  submitToken(inputToken: HTMLInputElement, event: SubmitEvent): void {
    event.preventDefault();
    this.loading.open();
    if (inputToken.value.includes('-g')) {
      const consolidatedTokens: string[] = inputToken.value.trim().split(/\s+/).filter(Boolean);
      if (consolidatedTokens.length >= 2) {
        this.generateUserRoleToken(consolidatedTokens[1], consolidatedTokens[2]);
      } else if (consolidatedTokens.length === 1) {
        this.generateBypassToken(EnumUserRole.GUEST);
      } else {
        this.showSignInFailed('Sign-in failed', 'Invalid token format.', 'OK');
      }
      return;
    }
    if (this.isSubmitting) return;
    const trimmedToken = inputToken.value.trim();
    if (!trimmedToken) {
      this.statusMessage = 'Enter an access token to continue.';
      this.cdr.detectChanges();
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
          this.loading.close();
        },
        error: (error) => {
          inputToken.value = '';
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
          this.loading.close();
          this.cdr.detectChanges();
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
