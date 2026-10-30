import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { HeaderComponent } from './header/header.component';
import { SidenavComponent } from './sidenav/sidenav.component';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';
import { LayoutService } from './services/layout.service';
import { AuthService } from './services/auth.service';

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
  private readonly auth = inject(AuthService);

  isLoginRoute(): boolean {
    return this.router.url.startsWith('/login');
  }

  constructor() {
    this.http.get(`${environment.apiBaseUrl}/api/health`).subscribe({
      next: (res) => {
        console.log('NEXT:=>', res);
      },
      error: (err) => {
        console.warn('ERROR:', err);
      },
    });
    this.auth.getSession().subscribe({
      next: (session) => {
        console.log('Session:', session);
      },
      error: (err) => {
        console.warn('Failed to get session:', err);
      },
    });
  }
}
