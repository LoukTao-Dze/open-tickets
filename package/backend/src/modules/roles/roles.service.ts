import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { SupabaseService } from '../../supabase/supabase.service';
import {
  PROJECT_ACCESS_LEVELS,
  RolePermissionDto,
  UpdateRolePermissionsDto,
} from './dto/update-role-permissions.dto';

interface RolePermissionRow {
  role: string;
  can_edit: boolean;
  default_access: string;
  project_access: Record<string, string> | null;
}

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async getPermissions() {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('role_permissions')
      .select('role, can_edit, default_access, project_access');
    if (error) {
      throw this.persistenceError('load', error);
    }
    return {
      data: ((data ?? []) as RolePermissionRow[]).map((row) => ({
        role: row.role,
        canEdit: row.can_edit,
        defaultAccess: row.default_access,
        projectAccess: row.project_access ?? {},
      })),
    };
  }

  async updatePermissions(dto: UpdateRolePermissionsDto) {
    const rows = dto.roles.map((permission) => this.toRow(permission));
    const roleNames = new Set(rows.map((row) => row.role));
    if (roleNames.size !== rows.length) {
      throw new BadRequestException('Duplicate role in request');
    }

    const { error } = await this.supabaseService
      .getClient()
      .from('role_permissions')
      .upsert(rows, { onConflict: 'role' });
    if (error) {
      throw this.persistenceError('save', error);
    }
    return {
      message: 'Role permissions saved',
      ...(await this.getPermissions()),
    };
  }

  private toRow(permission: RolePermissionDto) {
    // Admin access is fixed so nobody can lock every admin out of this page.
    if (permission.role === 'admin') {
      return {
        role: 'admin',
        can_edit: true,
        default_access: 'edit',
        project_access: {},
        updated_at: new Date().toISOString(),
      };
    }
    const downgrade = (access: string) =>
      !permission.canEdit && access === 'edit' ? 'view' : access;
    const projectAccess: Record<string, string> = {};
    for (const [projectId, access] of Object.entries(
      permission.projectAccess,
    )) {
      if (
        !isUUID(projectId) ||
        !(PROJECT_ACCESS_LEVELS as readonly string[]).includes(access)
      ) {
        throw new BadRequestException('Invalid project access');
      }
      projectAccess[projectId] = downgrade(access);
    }
    return {
      role: permission.role,
      can_edit: permission.canEdit,
      default_access: downgrade(permission.defaultAccess),
      project_access: projectAccess,
      updated_at: new Date().toISOString(),
    };
  }

  private persistenceError(action: string, error: { message?: string }) {
    this.logger.error(`Failed to ${action} role permissions: ${error.message}`);
    return new InternalServerErrorException(
      `Failed to ${action} role permissions`,
    );
  }
}
