import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class TestSuiteDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID()
  projectId?: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  name!: string;

  // Omitted on update means "leave the description unchanged".
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(100, { each: true })
  kanbanTicketIds?: string[];
}
