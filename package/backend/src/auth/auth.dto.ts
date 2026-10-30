import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_TOKEN_LENGTH } from './auth.constants';

export enum EnumUserRole {
  ADMIN = 'admin',
  USER = 'user',
  GUEST = 'guest',
}
export enum EnumAuthProvider {
  TOKEN = 'token',
  BYPASS = 'bypass',
}

export class TokenLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TOKEN_LENGTH)
  token!: string;
}

export class LoginClaims {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  sub!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  username!: string;

  @IsInt()
  @Min(1)
  exp!: number;

  @IsEnum(EnumAuthProvider)
  auth_provider!: EnumAuthProvider;

  @IsEnum(EnumUserRole)
  role!: EnumUserRole;
}

export class SessionProfile {
  @IsString()
  @IsNotEmpty()
  user_id!: string;

  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsEnum(EnumAuthProvider)
  auth_provider!: EnumAuthProvider;

  @IsEnum(EnumUserRole)
  role!: EnumUserRole;
}

export class AuthSession {
  @IsDefined()
  @ValidateNested()
  @Type(() => SessionProfile)
  user!: SessionProfile;

  @IsISO8601()
  expires_at!: string;
}
