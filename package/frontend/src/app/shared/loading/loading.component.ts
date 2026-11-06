import { Component, inject } from '@angular/core';
import { LoadingService } from '../../services/loading.service';

@Component({
  selector: 'app-loading',
  template: `
    @if (loading.isLoading()) {
      <div class="loading-overlay" role="status" aria-live="polite" aria-label="Loading">
        <div class="loader"></div>
      </div>
    }
  `,
  styles: `
    .loading-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgb(255 255 255 / 0.5);
    }
    .loader {
      width: fit-content;
      font-size: 40px;
      font-family: system-ui, sans-serif;
      font-weight: bold;
      text-transform: uppercase;
      color: #0000;
      -webkit-text-stroke: 1px #000;
      background: conic-gradient(#000 0 0) 50% / 0 100% no-repeat text;
      animation: l4 1.5s linear infinite;
    }
    .loader:before {
      content: 'Loading';
    }
    @keyframes l4 {
      to {
        background-size: 120% 100%;
      }
    }
  `,
})
export class LoadingComponent {
  readonly loading = inject(LoadingService);
}
