import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { MAIN_MENUS, MenuKey } from '../shared/menu-access';
import { AuthService, AuthSession } from './auth.service';

@Injectable({ providedIn: 'root' })
export class MenuAccessService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly state = signal<{
    identity: string;
    sessionVersion: number;
    menus: MenuKey[];
  } | null>(null);
  private requestVersion = 0;
  readonly loadFailed = signal(false);
  readonly menus = computed(() => {
    const sessionVersion = this.auth.sessionVersion();
    const session = this.auth.cachedSession;
    const state = this.state();
    return session &&
      state?.identity === this.identity(session) &&
      state.sessionVersion === sessionVersion
      ? state.menus
      : [];
  });

  async refresh(session: AuthSession): Promise<void> {
    const identity = this.identity(session);
    const requestVersion = ++this.requestVersion;
    const sessionVersion = this.auth.sessionVersion();
    if (this.state()?.identity !== identity) this.state.set(null);
    try {
      const menus = await firstValueFrom(
        this.http.get<MenuKey[]>(`${environment.apiBaseUrl}/api/roles/my-menu`, {
          withCredentials: true,
        }),
      );
      if (
        !Array.isArray(menus) ||
        menus.some((key) => !MAIN_MENUS.some((menu) => menu.key === key))
      ) {
        throw new Error('Invalid menu access response');
      }
      if (
        requestVersion === this.requestVersion &&
        sessionVersion === this.auth.sessionVersion() &&
        this.auth.cachedSession &&
        this.identity(this.auth.cachedSession) === identity
      ) {
        this.state.set({ identity, sessionVersion, menus });
        this.loadFailed.set(false);
      }
    } catch (error: unknown) {
      if (requestVersion === this.requestVersion && sessionVersion === this.auth.sessionVersion()) {
        this.state.set(null);
        this.loadFailed.set(true);
      }
      throw error;
    }
  }

  clear(): void {
    this.requestVersion++;
    this.state.set(null);
    this.loadFailed.set(false);
  }

  private identity(session: AuthSession): string {
    return JSON.stringify([session.user.user_id, session.user.role]);
  }
}
