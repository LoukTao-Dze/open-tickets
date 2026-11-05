import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
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

  readonly roles = ROLE_DEFINITIONS;
  readonly accessOptions = ACCESS_OPTIONS;

  readonly projects = signal<KanbanProject[]>([]);
  readonly isLoading = signal(true);
  readonly loadFailed = signal(false);
  // Deny by default: only a server-confirmed admin can change permissions.
  readonly isAdmin = signal(false);
  readonly selectedRoleId = signal<ManagedRole>('guest');
  readonly isSaving = signal(false);
  readonly saveStatus = signal<'idle' | 'saved' | 'failed'>('idle');

  readonly selectedRole = computed(
    () => this.roles.find((role) => role.id === this.selectedRoleId()) ?? this.roles[0],
  );
  readonly selectedPermission = computed(
    () => this.permissionService.permissions()[this.selectedRoleId()],
  );
  readonly isLocked = computed(() => this.permissionService.isLocked(this.selectedRoleId()));
  readonly isEditable = computed(() => this.isAdmin() && !this.isLocked());
  readonly canSave = computed(
    () => this.isAdmin() && this.permissionService.hasUnsavedChanges() && !this.isSaving(),
  );

  ngOnInit(): void {
    this.auth.getSession().subscribe({
      next: (session) => {
        const isAdmin = session.user.role === 'admin';
        this.isAdmin.set(isAdmin);
        if (isAdmin) this.loadPermissions();
      },
      error: (error) => console.error('Failed to resolve user role', error),
    });
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
    this.selectedRoleId.set(role);
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
