import { Component, inject } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterOutlet,
} from '@angular/router';
import { HeaderComponent } from './header/header.component';
import { SidenavComponent } from './sidenav/sidenav.component';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';
import { LayoutService } from './services/layout.service';
import { AuthService } from './services/auth.service';
import { LoadingService } from './services/loading.service';
import { LoadingComponent } from './shared/loading/loading.component';
import { MenuAccessService } from './services/menu-access.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, SidenavComponent, LoadingComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.scss',
})
export class App {
  http = inject(HttpClient);
  layout = inject(LayoutService);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly loading = inject(LoadingService);
  readonly menuAccess = inject(MenuAccessService);

  isLoginRoute(): boolean {
    return this.router.url.startsWith('/login');
  }

  async retryMenuAccess(): Promise<void> {
    try {
      const session = await firstValueFrom(this.auth.getSession());
      await this.menuAccess.refresh(session);
    } catch {
      console.error('Unable to reload menu access.');
    }
  }

  constructor() {
    // Every NavigationStart ends in exactly one End/Cancel/Error, so open/close stay balanced.
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) this.loading.open();
      else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      )
        this.loading.close();
    });
    this.http.get(`${environment.apiBaseUrl}/api/health`).subscribe({
      next: (res) => {
        console.log('NEXT:=>', res);
      },
      error: (err) => {
        console.warn('ERROR:', err);
      },
    });
  }
}
