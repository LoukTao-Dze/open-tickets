import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MenuAccessService } from '../services/menu-access.service';
import { MenuKey } from '../shared/menu-access';
import { SidenavComponent } from './sidenav.component';

describe('SidenavComponent menu access', () => {
  it('shows only permitted main menus while keeping Support and Docs', () => {
    const menus = signal<MenuKey[]>(['projects']);
    TestBed.configureTestingModule({
      imports: [SidenavComponent],
      providers: [provideRouter([]), { provide: MenuAccessService, useValue: { menus } }],
    });
    const fixture = TestBed.createComponent(SidenavComponent);
    fixture.detectChanges();
    const routes = () =>
      Array.from(fixture.nativeElement.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>).map(
        (link) => link.getAttribute('href'),
      );
    expect(routes()).toEqual(['/projects', '/support', '/docs']);
    menus.set(['workspace']);
    fixture.detectChanges();
    expect(routes()).toEqual(['/workspace', '/support', '/docs']);
  });
});
