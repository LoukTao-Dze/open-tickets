import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  ROLE_NAME_MAX_LENGTH,
  ROLE_NAME_MIN_LENGTH,
  ROLE_NAME_PATTERN,
} from '../../../auth/auth.constants';
import { PROJECT_ACCESS_LEVELS } from './update-role-permissions.dto';
import type { ProjectAccess } from './update-role-permissions.dto';

export const MAX_ROLE_DESCRIPTION_LENGTH = 200;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class CreateRoleDto {
  @Transform(trim)
  @IsString()
  @MinLength(ROLE_NAME_MIN_LENGTH)
  @MaxLength(ROLE_NAME_MAX_LENGTH)
  @Matches(ROLE_NAME_PATTERN)
  name!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(MAX_ROLE_DESCRIPTION_LENGTH)
  description?: string;

  @IsBoolean()
  canEdit!: boolean;

  @IsIn(PROJECT_ACCESS_LEVELS)
  defaultAccess!: ProjectAccess;
}
