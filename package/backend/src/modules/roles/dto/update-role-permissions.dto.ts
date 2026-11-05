import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  ValidateNested,
} from 'class-validator';

export const MANAGED_ROLES = ['admin', 'user', 'guest'] as const;
export const PROJECT_ACCESS_LEVELS = ['none', 'view', 'edit'] as const;

export type ManagedRole = (typeof MANAGED_ROLES)[number];
export type ProjectAccess = (typeof PROJECT_ACCESS_LEVELS)[number];

export class RolePermissionDto {
  @IsIn(MANAGED_ROLES)
  role!: ManagedRole;

  @IsBoolean()
  canEdit!: boolean;

  @IsIn(PROJECT_ACCESS_LEVELS)
  defaultAccess!: ProjectAccess;

  // Keys (project ids) and values are validated in RolesService.
  @IsObject()
  projectAccess!: Record<string, ProjectAccess>;
}

export class UpdateRolePermissionsDto {
  @IsArray()
  @ArrayMaxSize(MANAGED_ROLES.length)
  @ValidateNested({ each: true })
  @Type(() => RolePermissionDto)
  roles!: RolePermissionDto[];
}
