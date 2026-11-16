import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export enum SceneStatus {
  NotStart = 'not-start',
  InProgress = 'in-progress',
  Pass = 'pass',
}

export class SceneDto {
  @IsUUID()
  suiteId!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  sceneNo!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  test!: string;

  @IsEnum(SceneStatus)
  status!: SceneStatus;

  @IsString()
  @MaxLength(2000)
  detailsIssue!: string;

  @IsString()
  @MaxLength(2000)
  expectedResult!: string;

  @IsString()
  @MaxLength(2000)
  action!: string;

  @IsString()
  @MaxLength(2000)
  dataTest!: string;

  @IsString()
  @MaxLength(2000)
  remark!: string;
}

export class SceneStatusDto {
  @IsEnum(SceneStatus)
  status!: SceneStatus;
}
