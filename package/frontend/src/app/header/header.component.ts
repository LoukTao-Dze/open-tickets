import { Component, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService, AuthSession } from '../services/auth.service';
import { LayoutService } from '../services/layout.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
export class HeaderComponent {
  layout = inject(LayoutService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly accountMenu = viewChild.required<ElementRef<HTMLDetailsElement>>('accountMenu');
  readonly accountTrigger = viewChild.required<ElementRef<HTMLElement>>('accountTrigger');
  readonly session = signal<AuthSession | null>(null);
  readonly showProfile = signal(false);
  readonly isLoggingOut = signal(false);
  readonly accountError = signal('');
  src = '';
  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: MouseEvent): void {
    if (event.target instanceof Node && !this.accountMenu().nativeElement.contains(event.target)) {
      this.accountMenu().nativeElement.open = false;
    }
  }

  @HostListener('document:keydown.escape')
  closeOnEscape(): void {
    if (!this.accountMenu().nativeElement.open) return;
    this.accountMenu().nativeElement.open = false;
    this.accountTrigger().nativeElement.focus();
  }

  toggleProfile(): void {
    this.showProfile.update((isVisible) => !isVisible);
    if (!this.showProfile()) return;
    this.accountError.set('');
    this.session.set(this.auth.cachedSession);
    if (!this.session()) {
      console.error('Unable to load profile: no cached session.');
      this.accountError.set('Unable to load profile. Close and reopen Profile to retry.');
    }
  }

  async logout(): Promise<void> {
    if (this.isLoggingOut()) return;
    this.isLoggingOut.set(true);
    this.accountError.set('');
    try {
      await firstValueFrom(this.auth.logout());
      await this.router.navigateByUrl('/login');
    } catch {
      console.error('Account logout failed.');
      this.accountError.set('Unable to log out. Please try again.');
    } finally {
      this.isLoggingOut.set(false);
    }
  }
}
