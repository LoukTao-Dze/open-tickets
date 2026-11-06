import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import { SupabaseService } from '../../supabase/supabase.service';
import { CreateRoleDto } from './dto/create-role.dto';
import {
  MAX_ROLES,
  PROJECT_ACCESS_LEVELS,
  ProjectAccess,
  RolePermissionDto,
  SYSTEM_ROLES,
  UpdateRolePermissionsDto,
} from './dto/update-role-permissions.dto';

const UNIQUE_VIOLATION_CODE = '23505';
const ROLE_COLUMNS =
  'role, description, can_edit, default_access, project_access';

interface RolePermissionRow {
  role: string;
  description: string | null;
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
      .select(ROLE_COLUMNS)
      .order('created_at', { ascending: true });
    if (error) {
      throw this.persistenceError('load', error);
    }
    return {
      data: ((data ?? []) as RolePermissionRow[]).map((row) =>
        this.toRecord(row),
      ),
    };
  }

  async createRole(dto: CreateRoleDto) {
    const role = dto.name;
    const existingRoles = await this.getExistingRoles();
    const lowerCaseRole = role.toLowerCase();
    if (
      [...existingRoles].some((name) => name.toLowerCase() === lowerCaseRole)
    ) {
      throw new ConflictException('A role with this name already exists');
    }
    if (existingRoles.size >= MAX_ROLES) {
      throw new BadRequestException('Role limit reached');
    }
    const downgrade = this.downgrade(dto.canEdit);
    const { data, error } = await this.supabaseService
      .getClient()
      .from('role_permissions')
      .insert({
        role,
        description: dto.description || null,
        can_edit: dto.canEdit,
        default_access: downgrade(dto.defaultAccess),
        project_access: {},
      })
      .select(ROLE_COLUMNS)
      .single();
    if (error) {
      if (error.code === UNIQUE_VIOLATION_CODE) {
        throw new ConflictException('A role with this name already exists');
      }
      throw this.persistenceError('create', error);
    }
    return {
      message: 'Role created',
      data: this.toRecord(data),
    };
  }

  async deleteRole(role: string) {
    // Built-in roles are fixed so every admin keeps a way back into this page.
    if ((SYSTEM_ROLES as readonly string[]).includes(role)) {
      throw new ForbiddenException('System roles cannot be deleted');
    }
    const { data, error } = await this.supabaseService
      .getClient()
      .from('role_permissions')
      .delete()
      .eq('role', role)
      .select('role');
    if (error) {
      throw this.persistenceError('delete', error);
    }
    if (!data?.length) {
      throw new NotFoundException('Role not found');
    }
    return { message: 'Role deleted' };
  }

  async updatePermissions(dto: UpdateRolePermissionsDto) {
    const rows = dto.roles.map((permission) => this.toRow(permission));
    const roleNames = new Set(rows.map((row) => row.role));
    if (roleNames.size !== rows.length) {
      throw new BadRequestException('Duplicate role in request');
    }
    // Roles are created through createRole only, so an update can never invent one.
    const existingRoles = await this.getExistingRoles();
    if (rows.some((row) => !existingRoles.has(row.role))) {
      throw new BadRequestException('Unknown role in request');
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
    const downgrade = this.downgrade(permission.canEdit);
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

  private toRecord(row: RolePermissionRow) {
    return {
      role: row.role,
      description: row.description,
      isSystem: (SYSTEM_ROLES as readonly string[]).includes(row.role),
      canEdit: row.can_edit,
      defaultAccess: row.default_access,
      projectAccess: row.project_access ?? {},
    };
  }

  private downgrade(canEdit: boolean) {
    return (access: ProjectAccess): ProjectAccess =>
      !canEdit && access === 'edit' ? 'view' : access;
  }

  private async getExistingRoles(): Promise<Set<string>> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('role_permissions')
      .select('role');
    if (error) {
      throw this.persistenceError('load', error);
    }
    return new Set(((data ?? []) as { role: string }[]).map((row) => row.role));
  }

  private persistenceError(action: string, error: { message?: string }) {
    this.logger.error(`Failed to ${action} role permissions: ${error.message}`);
    return new InternalServerErrorException(
      `Failed to ${action} role permissions`,
    );
  }
}
