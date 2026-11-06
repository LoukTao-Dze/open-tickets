import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, throwError } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';

export type ManagedRole = string;
export type ProjectAccess = 'none' | 'view' | 'edit';

export interface RolePermission {
  canEdit: boolean;
  // Projects missing from this map fall back to defaultAccess.
  projectAccess: Record<string, ProjectAccess>;
  defaultAccess: ProjectAccess;
}

export type RolePermissionMap = Record<ManagedRole, RolePermission>;

export interface CustomRole {
  id: ManagedRole;
  label: string;
  description: string;
}

export interface NewRole {
  name: string;
  description: string;
  canEdit: boolean;
  defaultAccess: ProjectAccess;
}

interface RolePermissionRecord extends RolePermission {
  role: ManagedRole;
  description: string | null;
  isSystem: boolean;
}

interface RolePermissionsResponse {
  data: RolePermissionRecord[];
}

interface CreatedRoleResponse {
  data: RolePermissionRecord;
}

const toPermission = ({ canEdit, defaultAccess, projectAccess }: RolePermissionRecord) => ({
  canEdit,
  defaultAccess,
  projectAccess,
});

const toCustomRole = (record: RolePermissionRecord): CustomRole => ({
  id: record.role,
  label: record.role,
  description: record.description ?? '',
});

const INITIAL_PERMISSIONS: RolePermissionMap = {
  admin: { canEdit: true, projectAccess: {}, defaultAccess: 'edit' },
  user: { canEdit: true, projectAccess: {}, defaultAccess: 'edit' },
  guest: { canEdit: false, projectAccess: {}, defaultAccess: 'view' },
};

const INITIAL_ROLE_NAMES: readonly ManagedRole[] = Object.keys(INITIAL_PERMISSIONS);

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
  private readonly rolesUrl = `${environment.apiBaseUrl}/api/roles`;
  private readonly url = `${this.rolesUrl}/permissions`;
  private readonly customRolesState = signal<CustomRole[]>([]);
  private readonly state = signal<RolePermissionMap>(INITIAL_PERMISSIONS);
  private readonly savedState = signal<RolePermissionMap>(INITIAL_PERMISSIONS);
  readonly permissions = this.state.asReadonly();
  readonly customRoles = this.customRolesState.asReadonly();
  readonly hasUnsavedChanges = computed(
    () => stableSerialize(this.state()) !== stableSerialize(this.savedState()),
  );

  load(): Observable<void> {
    return this.http
      .get<RolePermissionsResponse>(this.url, { withCredentials: true })
      .pipe(map((response) => this.applySaved(response.data)));
  }

  save(): Observable<void> {
    const roles = Object.entries(this.state()).map(([role, permission]) => ({
      role,
      ...permission,
    }));
    return this.http
      .put<RolePermissionsResponse>(this.url, { roles }, { withCredentials: true })
      .pipe(map((response) => this.applySaved(response.data)));
  }

  createRole(role: NewRole): Observable<ManagedRole> {
    return this.http.post<CreatedRoleResponse>(this.rolesUrl, role, { withCredentials: true }).pipe(
      map(({ data }) => {
        // Only the new role is added so other unsaved edits stay untouched.
        this.state.update((current) => ({ ...current, [data.role]: toPermission(data) }));
        this.savedState.update((current) => ({ ...current, [data.role]: toPermission(data) }));
        this.customRolesState.update((current) => [...current, toCustomRole(data)]);
        return data.role;
      }),
    );
  }

  deleteRole(role: ManagedRole): Observable<void> {
    if (this.isSystemRole(role))
      return throwError(() => new Error('System roles cannot be deleted'));
    return this.http
      .delete(`${this.rolesUrl}/${encodeURIComponent(role)}`, { withCredentials: true })
      .pipe(
        map(() => {
          const withoutRole = (current: RolePermissionMap): RolePermissionMap =>
            Object.fromEntries(Object.entries(current).filter(([name]) => name !== role));
          this.state.update(withoutRole);
          this.savedState.update(withoutRole);
          this.customRolesState.update((current) => current.filter(({ id }) => id !== role));
        }),
      );
  }

  private isSystemRole(role: ManagedRole): boolean {
    return INITIAL_ROLE_NAMES.includes(role);
  }

  private applySaved(records: RolePermissionRecord[]): void {
    const next = { ...this.state() };
    for (const record of records) {
      if (this.isLocked(record.role)) continue;
      if (!record.isSystem || Object.hasOwn(next, record.role))
        next[record.role] = toPermission(record);
    }
    this.state.set(next);
    this.savedState.set(next);
    this.customRolesState.set(records.filter((record) => !record.isSystem).map(toCustomRole));
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
