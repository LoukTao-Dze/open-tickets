import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  ROLE_NAME_MAX_LENGTH,
  ROLE_NAME_MIN_LENGTH,
  ROLE_NAME_PATTERN,
} from '../../../auth/auth.constants';

export class RoleParamsDto {
  @IsString()
  @MinLength(ROLE_NAME_MIN_LENGTH)
  @MaxLength(ROLE_NAME_MAX_LENGTH)
  @Matches(ROLE_NAME_PATTERN)
  role!: string;
}
