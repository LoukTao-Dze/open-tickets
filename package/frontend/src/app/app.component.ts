import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './header/header.component';
import { SidenavComponent } from './sidenav/sidenav.component';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, HeaderComponent, SidenavComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.scss',
})
export class App {
  http = inject(HttpClient);

  constructor() {
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
