import { Injectable, signal } from '@angular/core';

/** Tracks whether the off-canvas mobile sidenav drawer is open. */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly _isMobileNavOpen = signal(false);
  readonly isMobileNavOpen = this._isMobileNavOpen.asReadonly();

  toggleMobileNav(): void {
    this._isMobileNavOpen.update((open) => !open);
  }

  closeMobileNav(): void {
    this._isMobileNavOpen.set(false);
  }
}
