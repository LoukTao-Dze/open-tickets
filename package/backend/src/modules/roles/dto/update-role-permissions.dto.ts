import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ROLE_NAME_MAX_LENGTH,
  ROLE_NAME_MIN_LENGTH,
  ROLE_NAME_PATTERN,
} from '../../../auth/auth.constants';

export const SYSTEM_ROLES = ['admin', 'user', 'guest'] as const;
export const PROJECT_ACCESS_LEVELS = ['none', 'view', 'edit'] as const;
export const MENU_KEYS = [
  'kanban',
  'workspace',
  'projects',
  'progress',
  'scenes',
  'roles',
] as const;
export const MAX_ROLES = 50;

export type ManagedRole = string;
export type ProjectAccess = (typeof PROJECT_ACCESS_LEVELS)[number];
export type MenuKey = (typeof MENU_KEYS)[number];

export class RolePermissionDto {
  @IsString()
  @MinLength(ROLE_NAME_MIN_LENGTH)
  @MaxLength(ROLE_NAME_MAX_LENGTH)
  @Matches(ROLE_NAME_PATTERN)
  role!: ManagedRole;

  @IsBoolean()
  canEdit!: boolean;

  @IsIn(PROJECT_ACCESS_LEVELS)
  defaultAccess!: ProjectAccess;

  // Keys (project ids) and values are validated in RolesService.
  @IsObject()
  projectAccess!: Record<string, ProjectAccess>;

  @IsArray()
  @ArrayMaxSize(MENU_KEYS.length)
  @ArrayUnique()
  @IsIn(MENU_KEYS, { each: true })
  menuAccess!: MenuKey[];
}

export class UpdateRolePermissionsDto {
  @IsArray()
  @ArrayMaxSize(MAX_ROLES)
  @ValidateNested({ each: true })
  @Type(() => RolePermissionDto)
  roles!: RolePermissionDto[];
}
