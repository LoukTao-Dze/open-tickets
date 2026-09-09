import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'workspace' },
  {
    path: 'overview',
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'kanban',
    loadComponent: () => import('./pages/kanban/kanban.component').then((m) => m.KanbanComponent),
  },
  {
    path: 'workspace',
    loadComponent: () =>
      import('./pages/workspace/workspace.component').then((m) => m.WorkspaceComponent),
  },
  {
    path: 'files',
    loadComponent: () =>
      import('./pages/page-placeholder/page-placeholder.component').then(
        (m) => m.PagePlaceholderComponent,
      ),
    data: { title: 'Files Storage' },
  },
  {
    path: 'roles',
    loadComponent: () =>
      import('./pages/page-placeholder/page-placeholder.component').then(
        (m) => m.PagePlaceholderComponent,
      ),
    data: { title: 'Roles' },
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/page-placeholder/page-placeholder.component').then(
        (m) => m.PagePlaceholderComponent,
      ),
    data: { title: 'Settings' },
  },
  {
    path: 'support',
    loadComponent: () =>
      import('./pages/page-placeholder/page-placeholder.component').then(
        (m) => m.PagePlaceholderComponent,
      ),
    data: { title: 'Support' },
  },
  {
    path: 'docs',
    loadComponent: () =>
      import('./pages/page-placeholder/page-placeholder.component').then(
        (m) => m.PagePlaceholderComponent,
      ),
    data: { title: 'Docs' },
  },
  { path: '**', redirectTo: 'kanban' },
];
