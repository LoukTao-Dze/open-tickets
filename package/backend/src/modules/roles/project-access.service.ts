import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ADMIN_ROLE } from '../../auth/auth.constants';
import { EnumUserRole } from '../../auth/auth.dto';
import { SupabaseService } from '../../supabase/supabase.service';
import { ProjectAccess } from './dto/update-role-permissions.dto';

interface StoredPermission {
  can_edit?: boolean;
  default_access: ProjectAccess;
  project_access: Record<string, ProjectAccess> | null;
}

// Used only when a role has no saved row yet; mirrors the migration seed.
// Any other role (for example a deleted custom role) gets no access.
const FALLBACK_DEFAULT_ACCESS = new Map<string, ProjectAccess>([
  [EnumUserRole.ADMIN, 'edit'],
  [EnumUserRole.USER, 'edit'],
  [EnumUserRole.GUEST, 'view'],
]);
const ACCESS_LEVEL: Record<ProjectAccess, number> = {
  none: 0,
  view: 1,
  edit: 2,
};

@Injectable()
export class ProjectAccessService {
  private readonly logger = new Logger(ProjectAccessService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  // Removes items whose project is set to "none" for the role. Fails closed on errors.
  async filterByProject<T>(
    role: string,
    items: T[],
    projectIdOf: (item: T) => string | undefined,
  ): Promise<T[]> {
    if (role === ADMIN_ROLE) {
      return items;
    }
    const permission = await this.loadPermission(role);
    return items.filter(
      (item) => this.accessFor(role, permission, projectIdOf(item)) !== 'none',
    );
  }

  async assertProjectAccess(
    role: string,
    projectId: string,
    requiredAccess: Exclude<ProjectAccess, 'none'>,
  ): Promise<Exclude<ProjectAccess, 'none'>> {
    const access = await this.getProjectAccess(role, projectId);
    if (
      access === 'none' ||
      ACCESS_LEVEL[access] < ACCESS_LEVEL[requiredAccess]
    ) {
      throw new ForbiddenException();
    }
    return access;
  }

  async getProjectAccess(
    role: string,
    projectId: string,
  ): Promise<ProjectAccess> {
    if (role === ADMIN_ROLE) {
      return 'edit';
    }

    const permission = await this.loadPermission(role);
    const access = this.accessFor(role, permission, projectId);
    return permission?.can_edit === false && access === 'edit'
      ? 'view'
      : access;
  }

  private accessFor(
    role: string,
    permission: StoredPermission | null,
    projectId?: string,
  ): ProjectAccess {
    const defaultAccess =
      permission?.default_access ?? FALLBACK_DEFAULT_ACCESS.get(role) ?? 'none';
    if (!projectId) {
      return defaultAccess;
    }
    return permission?.project_access?.[projectId] ?? defaultAccess;
  }

  private async loadPermission(role: string): Promise<StoredPermission | null> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('role_permissions')
      .select('default_access, project_access')
      .eq('role', role)
      .maybeSingle();
    if (error) {
      this.logger.error(
        `Failed to load permissions for role: ${error.message}`,
      );
      throw new InternalServerErrorException('Failed to check project access');
    }
    return (data as StoredPermission | null) ?? null;
  }
}
