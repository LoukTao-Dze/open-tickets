import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-loading-page',
  standalone: true,
  templateUrl: './loading-page.component.html',
  styleUrl: './loading-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoadingPageComponent {}
