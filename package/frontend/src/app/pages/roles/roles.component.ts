import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { KanbanProject } from '../../interface/kanban.interface';
import { AuthService } from '../../services/auth.service';
import { ProjectApiService } from '../../services/project.service';
import {
  ManagedRole,
  ProjectAccess,
  RolePermissionService,
} from '../../services/role-permission.service';

interface RoleDefinition {
  id: ManagedRole;
  label: string;
  description: string;
}

interface AccessOption {
  value: ProjectAccess;
  label: string;
}

const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    id: 'admin',
    label: 'Admin',
    description: 'Manages roles and every project. Admin access cannot be changed.',
  },
  {
    id: 'user',
    label: 'User',
    description: 'Works on tickets, boards and workspaces in the projects they can open.',
  },
  {
    id: 'guest',
    label: 'Guest',
    description: 'Looks around the workspace without being able to keep any changes.',
  },
];

const ROLE_NAME_MIN_LENGTH = 2;
const ROLE_NAME_MAX_LENGTH = 32;
const ROLE_DESCRIPTION_MAX_LENGTH = 200;
const HTTP_CONFLICT = 409;
const FALLBACK_ROLE_ID: ManagedRole = 'guest';

const ACCESS_OPTIONS: readonly AccessOption[] = [
  { value: 'none', label: 'No access' },
  { value: 'view', label: 'View' },
  { value: 'edit', label: 'Edit' },
];

@Component({
  selector: 'app-roles',
  standalone: true,
  templateUrl: './roles.component.html',
  styleUrl: './roles.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RolesComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly projectApi = inject(ProjectApiService);
  private readonly permissionService = inject(RolePermissionService);
  private readonly confirmDialog = inject(ConfirmDialogService);

  readonly roles = computed<RoleDefinition[]>(() => [
    ...ROLE_DEFINITIONS,
    ...this.permissionService.customRoles(),
  ]);
  readonly accessOptions = ACCESS_OPTIONS;
  readonly roleNameMinLength = ROLE_NAME_MIN_LENGTH;
  readonly roleNameMaxLength = ROLE_NAME_MAX_LENGTH;
  readonly roleDescriptionMaxLength = ROLE_DESCRIPTION_MAX_LENGTH;

  readonly projects = signal<KanbanProject[]>([]);
  readonly isLoading = signal(true);
  readonly loadFailed = signal(false);
  // Deny by default: only a server-confirmed admin can change permissions.
  readonly isAdmin = signal(false);
  readonly selectedRoleId = signal<ManagedRole>('guest');
  readonly isSaving = signal(false);
  readonly saveStatus = signal<'idle' | 'saved' | 'failed'>('idle');

  readonly isAddingRole = signal(false);
  readonly newRoleName = signal('');
  readonly newRoleDescription = signal('');
  readonly newRoleCanEdit = signal(true);
  readonly newRoleDefaultAccess = signal<ProjectAccess>('view');
  readonly isCreating = signal(false);
  readonly createError = signal('');
  readonly roleNotice = signal('');
  readonly isDeleting = signal(false);
  readonly deleteError = signal('');

  readonly selectedRole = computed(
    () => this.roles().find((role) => role.id === this.selectedRoleId()) ?? this.roles()[0],
  );
  readonly isNewRoleNameValid = computed(() => {
    const nameLength = this.newRoleName().trim().length;
    return nameLength >= ROLE_NAME_MIN_LENGTH && nameLength <= ROLE_NAME_MAX_LENGTH;
  });
  readonly canCreateRole = computed(
    () => this.isAdmin() && this.isNewRoleNameValid() && !this.isCreating(),
  );
  readonly selectedPermission = computed(
    () => this.permissionService.permissions()[this.selectedRoleId()],
  );
  readonly isCustomRole = computed(() =>
    this.permissionService.customRoles().some((role) => role.id === this.selectedRoleId()),
  );
  readonly isLocked = computed(() => this.permissionService.isLocked(this.selectedRoleId()));
  readonly isEditable = computed(() => this.isAdmin() && !this.isLocked());
  readonly canSave = computed(
    () => this.isAdmin() && this.permissionService.hasUnsavedChanges() && !this.isSaving(),
  );

  ngOnInit(): void {
    const session = this.auth.cachedSession;
    if (session) {
      const isAdmin = session.user.role === 'admin';
      this.isAdmin.set(isAdmin);
      if (isAdmin) this.loadPermissions();
    } else {
      console.error('Failed to resolve user role: no cached session.');
    }
    this.loadProjects();
  }

  loadProjects(): void {
    this.isLoading.set(true);
    this.loadFailed.set(false);
    this.projectApi.getProjects().subscribe({
      next: (projects) => {
        this.projects.set(projects);
        this.isLoading.set(false);
      },
      error: (error) => {
        console.error('Failed to load projects', error);
        this.loadFailed.set(true);
        this.isLoading.set(false);
      },
    });
  }

  loadPermissions(): void {
    this.permissionService.load().subscribe({
      error: (error) => console.error('Failed to load role permissions', error),
    });
  }

  savePermissions(): void {
    if (!this.canSave()) return;
    this.isSaving.set(true);
    this.saveStatus.set('idle');
    this.permissionService.save().subscribe({
      next: () => {
        this.saveStatus.set('saved');
        this.isSaving.set(false);
      },
      error: (error) => {
        console.error('Failed to save role permissions', error);
        this.saveStatus.set('failed');
        this.isSaving.set(false);
      },
    });
  }

  selectRole(role: ManagedRole): void {
    this.isAddingRole.set(false);
    this.roleNotice.set('');
    this.deleteError.set('');
    this.selectedRoleId.set(role);
  }

  openAddRole(): void {
    this.createError.set('');
    this.isAddingRole.set(true);
  }

  setNewRoleName(event: Event): void {
    this.createError.set('');
    this.newRoleName.set((event.target as HTMLInputElement).value);
  }

  setNewRoleDescription(event: Event): void {
    this.newRoleDescription.set((event.target as HTMLTextAreaElement).value);
  }

  toggleNewRoleCanEdit(): void {
    const canEdit = !this.newRoleCanEdit();
    this.newRoleCanEdit.set(canEdit);
    if (!canEdit && this.newRoleDefaultAccess() === 'edit') this.newRoleDefaultAccess.set('view');
  }

  isNewRoleOptionDisabled(option: AccessOption): boolean {
    return option.value === 'edit' && !this.newRoleCanEdit();
  }

  createRole(event: SubmitEvent): void {
    event.preventDefault();
    if (!this.canCreateRole()) return;
    const name = this.newRoleName().trim();
    this.isCreating.set(true);
    this.createError.set('');
    this.permissionService
      .createRole({
        name,
        description: this.newRoleDescription().trim(),
        canEdit: this.newRoleCanEdit(),
        defaultAccess: this.newRoleDefaultAccess(),
      })
      .subscribe({
        next: (roleId) => {
          this.resetNewRoleForm();
          this.roleNotice.set(`Role ${name} created. Set its project access below.`);
          this.selectedRoleId.set(roleId);
          this.isAddingRole.set(false);
          this.isCreating.set(false);
        },
        error: (error: unknown) => {
          console.error('Failed to create role', error);
          this.createError.set(
            error instanceof HttpErrorResponse && error.status === HTTP_CONFLICT
              ? 'A role with this name already exists. Choose a different name.'
              : 'Could not create the role. Check the name and try again.',
          );
          this.isCreating.set(false);
        },
      });
  }

  deleteSelectedRole(): void {
    if (!this.isAdmin() || !this.isCustomRole() || this.isDeleting()) return;
    const { id, label } = this.selectedRole();
    this.confirmDialog
      .confirm({
        title: 'Delete role?',
        message: `Really delete ${label}? People signed in with this role lose access to every project. This cannot be undone.`,
        confirmText: 'Delete',
        config: { confirmColor: 'error' },
      })
      .subscribe((confirmed) => {
        if (!confirmed) return;
        this.isDeleting.set(true);
        this.deleteError.set('');
        this.permissionService.deleteRole(id).subscribe({
          next: () => {
            this.selectedRoleId.set(FALLBACK_ROLE_ID);
            this.roleNotice.set(`Role ${label} deleted.`);
            this.isDeleting.set(false);
          },
          error: (error: unknown) => {
            console.error('Failed to delete role', error);
            this.deleteError.set('Could not delete the role. Try again.');
            this.isDeleting.set(false);
          },
        });
      });
  }

  private resetNewRoleForm(): void {
    this.newRoleName.set('');
    this.newRoleDescription.set('');
    this.newRoleCanEdit.set(true);
    this.newRoleDefaultAccess.set('view');
  }

  accessFor(projectId: string): ProjectAccess {
    return this.permissionService.accessFor(this.selectedRoleId(), projectId);
  }

  summaryFor(role: ManagedRole): string {
    const accessLevels = this.projects().map((project) =>
      this.permissionService.accessFor(role, project.id),
    );
    const editable = accessLevels.filter((access) => access === 'edit').length;
    const viewable = accessLevels.filter((access) => access === 'view').length;
    if (!accessLevels.length) return 'No projects yet';
    if (!editable && !viewable) return 'No project access';
    return `Edit ${editable}, view ${viewable} of ${accessLevels.length}`;
  }

  toggleCanEdit(): void {
    if (!this.isEditable()) return;
    this.saveStatus.set('idle');
    this.permissionService.setCanEdit(this.selectedRoleId(), !this.selectedPermission().canEdit);
  }

  setAccess(projectId: string, access: ProjectAccess): void {
    if (!this.isEditable()) return;
    this.saveStatus.set('idle');
    this.permissionService.setProjectAccess(this.selectedRoleId(), projectId, access);
  }

  isOptionDisabled(option: AccessOption): boolean {
    return !this.isEditable() || (option.value === 'edit' && !this.selectedPermission().canEdit);
  }
}
