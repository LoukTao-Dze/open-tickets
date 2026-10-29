import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { HeaderComponent } from './header/header.component';
import { SidenavComponent } from './sidenav/sidenav.component';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';
import { LayoutService } from './services/layout.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, SidenavComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.scss',
})
export class App {
  http = inject(HttpClient);
  layout = inject(LayoutService);
  private readonly router = inject(Router);

  isLoginRoute(): boolean {
    return this.router.url.startsWith('/login');
  }

  constructor() {
    this.http.get(`${environment.apiBaseUrl}/api/health`).subscribe({
      next: (res) => {
        console.log('NEXT:=>', res);
        void this.checkAccessToken();
      },
      error: (err) => {
        console.warn('ERROR:', err);
      },
    });
  }
  async checkAccessToken(): Promise<void> {
    const accessToken = await this.getCookieStore('access_token');
    if (accessToken) {
      void this.router.navigateByUrl('/workspace');
    } else {
      void this.router.navigateByUrl('/login');
    }
  }

  async getCookieStore(name: string) {
    return await window.cookieStore.get(name);
  }
}
