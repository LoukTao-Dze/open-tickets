import { ChangeDetectorRef, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { of, switchMap } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { LoadingService } from '../../services/loading.service';

type LoginMethod = 'google' | 'token';

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

  submitToken(inputToken: HTMLInputElement, event: SubmitEvent): void {
    event.preventDefault();
    if (this.isSubmitting) return;
    const trimmedToken = inputToken.value.trim();
    if (!trimmedToken) {
      this.statusMessage = 'Enter an access token to continue.';
      this.cdr.detectChanges();
      return;
    }
    this.isSubmitting = true;
    this.statusMessage = '';
    this.loading.open();
    this.auth
      .loginWithToken(trimmedToken)
      .pipe(switchMap((response) => ('token' in response ? of(response) : this.auth.getSession())))
      .subscribe({
        next: (response) => {
          inputToken.value = '';
          if ('token' in response) {
            this.loading.close();
            this.isSubmitting = false;
            this.confirmDialog
              .confirm({
                title: 'Access token created',
                message: `Keep this token private. Paste it into the access token field to sign in.\n\n${response.token}`,
                confirmText: 'Close',
                config: { disableClose: true },
              })
              .subscribe();
            this.cdr.detectChanges();
            return;
          }
          this.router.navigateByUrl('/workspace');
          this.loading.close();
        },
        error: (error: unknown) => {
          inputToken.value = '';
          this.handleSignInError(error);
        },
      });
  }

  private handleSignInError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      this.statusMessage = 'Invalid or expired access token.';
    } else if (error instanceof HttpErrorResponse && error.status === 429) {
      this.statusMessage = 'Too many sign-in attempts. Please try again in a minute.';
    } else {
      this.statusMessage = 'Unable to sign in. Please check your connection and cookie settings.';
    }
    this.showSignInFailed('Sign-in failed', this.statusMessage, 'Try again');
    this.isSubmitting = false;
    this.loading.close();
    this.cdr.detectChanges();
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
