import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'overview',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'kanban',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/kanban/kanban.component').then((m) => m.KanbanComponent),
  },
  {
    path: 'projects',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/projects/projects.component').then((m) => m.ProjectsComponent),
  },
  {
    path: 'workspace',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/workspace/workspace.component').then((m) => m.WorkspaceComponent),
  },
  {
    path: 'files',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/page-placeholder/page-placeholder.component').then(
        (m) => m.PagePlaceholderComponent,
      ),
    data: { title: 'Files Storage' },
  },
  {
    path: 'roles',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/page-placeholder/page-placeholder.component').then(
        (m) => m.PagePlaceholderComponent,
      ),
    data: { title: 'Roles' },
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/page-placeholder/page-placeholder.component').then(
        (m) => m.PagePlaceholderComponent,
      ),
    data: { title: 'Settings' },
  },
  {
    path: 'support',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/page-placeholder/page-placeholder.component').then(
        (m) => m.PagePlaceholderComponent,
      ),
    data: { title: 'Support' },
  },
  {
    path: 'docs',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/page-placeholder/page-placeholder.component').then(
        (m) => m.PagePlaceholderComponent,
      ),
    data: { title: 'Docs' },
  },
  { path: '**', redirectTo: 'kanban' },
];
