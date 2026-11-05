import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export type ManagedRole = 'admin' | 'user' | 'guest';
export type ProjectAccess = 'none' | 'view' | 'edit';

export interface RolePermission {
  canEdit: boolean;
  // Projects missing from this map fall back to defaultAccess.
  projectAccess: Record<string, ProjectAccess>;
  defaultAccess: ProjectAccess;
}

export type RolePermissionMap = Record<ManagedRole, RolePermission>;

interface RolePermissionRecord extends RolePermission {
  role: ManagedRole;
}

interface RolePermissionsResponse {
  data: RolePermissionRecord[];
}

const INITIAL_PERMISSIONS: RolePermissionMap = {
  admin: { canEdit: true, projectAccess: {}, defaultAccess: 'edit' },
  user: { canEdit: true, projectAccess: {}, defaultAccess: 'edit' },
  guest: { canEdit: false, projectAccess: {}, defaultAccess: 'view' },
};

// The admin role is locked so nobody can remove their own way back into this page.
const LOCKED_ROLES: readonly ManagedRole[] = ['admin'];

const stableSerialize = (permissions: RolePermissionMap): string =>
  JSON.stringify(permissions, (_key, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );

@Injectable({ providedIn: 'root' })
export class RolePermissionService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiBaseUrl}/api/roles/permissions`;
  private readonly state = signal<RolePermissionMap>(INITIAL_PERMISSIONS);
  private readonly savedState = signal<RolePermissionMap>(INITIAL_PERMISSIONS);
  readonly permissions = this.state.asReadonly();
  readonly hasUnsavedChanges = computed(
    () => stableSerialize(this.state()) !== stableSerialize(this.savedState()),
  );

  load(): Observable<void> {
    return this.http
      .get<RolePermissionsResponse>(this.url, { withCredentials: true })
      .pipe(map((response) => this.applySaved(response.data)));
  }

  save(): Observable<void> {
    const { admin, user, guest } = this.state();
    const roles = [
      { role: 'admin', ...admin },
      { role: 'user', ...user },
      { role: 'guest', ...guest },
    ];
    return this.http
      .put<RolePermissionsResponse>(this.url, { roles }, { withCredentials: true })
      .pipe(map((response) => this.applySaved(response.data)));
  }

  private applySaved(records: RolePermissionRecord[]): void {
    const next = { ...this.state() };
    for (const { role, ...permission } of records) {
      if (this.isLocked(role) || !(role in next)) continue;
      next[role] = permission;
    }
    this.state.set(next);
    this.savedState.set(next);
  }

  isLocked(role: ManagedRole): boolean {
    return LOCKED_ROLES.includes(role);
  }

  accessFor(role: ManagedRole, projectId: string): ProjectAccess {
    const permission = this.state()[role];
    const access = permission.projectAccess[projectId] ?? permission.defaultAccess;
    return !permission.canEdit && access === 'edit' ? 'view' : access;
  }

  setCanEdit(role: ManagedRole, canEdit: boolean): void {
    if (this.isLocked(role)) return;
    this.state.update((current) => {
      const permission = current[role];
      const downgrade = (access: ProjectAccess): ProjectAccess =>
        !canEdit && access === 'edit' ? 'view' : access;
      return {
        ...current,
        [role]: {
          canEdit,
          defaultAccess: downgrade(permission.defaultAccess),
          projectAccess: Object.fromEntries(
            Object.entries(permission.projectAccess).map(([projectId, access]) => [
              projectId,
              downgrade(access),
            ]),
          ),
        },
      };
    });
  }

  setProjectAccess(role: ManagedRole, projectId: string, access: ProjectAccess): void {
    if (this.isLocked(role)) return;
    if (access === 'edit' && !this.state()[role].canEdit) return;
    this.state.update((current) => ({
      ...current,
      [role]: {
        ...current[role],
        projectAccess: { ...current[role].projectAccess, [projectId]: access },
      },
    }));
  }
}
