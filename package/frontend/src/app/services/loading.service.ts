import { Injectable, computed, signal } from '@angular/core';

/** Ref-counted so overlapping callers don't hide the loader early. */
@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly pending = signal(0);
  readonly isLoading = computed(() => this.pending() > 0);

  open(): void {
    this.pending.update((count) => count + 1);
  }

  close(): void {
    this.pending.update((count) => Math.max(0, count - 1));
  }
}
