import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { EnumUserRole } from '../../auth/auth.dto';
import { SupabaseService } from '../../supabase/supabase.service';
import { ProjectAccess } from './dto/update-role-permissions.dto';

interface StoredPermission {
  default_access: ProjectAccess;
  project_access: Record<string, ProjectAccess> | null;
}

// Used only when a role has no saved row yet; mirrors the migration seed.
const FALLBACK_DEFAULT_ACCESS: Record<EnumUserRole, ProjectAccess> = {
  [EnumUserRole.ADMIN]: 'edit',
  [EnumUserRole.USER]: 'edit',
  [EnumUserRole.GUEST]: 'view',
};

@Injectable()
export class ProjectAccessService {
  private readonly logger = new Logger(ProjectAccessService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  // Removes items whose project is set to "none" for the role. Fails closed on errors.
  async filterByProject<T>(
    role: EnumUserRole,
    items: T[],
    projectIdOf: (item: T) => string | undefined,
  ): Promise<T[]> {
    if (role === EnumUserRole.ADMIN) {
      return items;
    }
    const permission = await this.loadPermission(role);
    return items.filter(
      (item) => this.accessFor(role, permission, projectIdOf(item)) !== 'none',
    );
  }

  private accessFor(
    role: EnumUserRole,
    permission: StoredPermission | null,
    projectId?: string,
  ): ProjectAccess {
    const defaultAccess =
      permission?.default_access ?? FALLBACK_DEFAULT_ACCESS[role];
    if (!projectId) {
      return defaultAccess;
    }
    return permission?.project_access?.[projectId] ?? defaultAccess;
  }

  private async loadPermission(
    role: EnumUserRole,
  ): Promise<StoredPermission | null> {
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
