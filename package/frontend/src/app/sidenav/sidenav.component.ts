import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { LayoutService } from '../services/layout.service';
import { MenuAccessService } from '../services/menu-access.service';
import { MAIN_MENUS } from '../shared/menu-access';

export interface SidenavLink {
  icon: string;
  label: string;
  route: string;
  isActive: boolean;
}

@Component({
  selector: 'app-sidenav',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidenav.component.html',
  styleUrls: ['./sidenav.component.scss'],
})
export class SidenavComponent {
  layout = inject(LayoutService);
  private readonly menuAccess = inject(MenuAccessService);
  readonly navLinks = computed<SidenavLink[]>(() =>
    MAIN_MENUS.filter((menu) => this.menuAccess.menus().includes(menu.key)).map((menu) => ({
      icon: menu.icon,
      label: menu.label,
      route: `/${menu.key}`,
      isActive: true,
    })),
  );

  bottomNavLinks: SidenavLink[] = [
    { icon: 'help', label: 'Support', route: '/support', isActive: true },
    { icon: 'description', label: 'Docs', route: '/docs', isActive: true },
  ];
}
