import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ColumnIdDto } from './column.dto';

export const KANBAN_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const;

export class TicketMetaDto {
  @IsString()
  icon: string;

  @IsString()
  @MaxLength(40)
  label: string;
}

export class CreateTicketDto extends ColumnIdDto {
  @IsString()
  @MaxLength(300)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  detail?: string;

  @IsIn(KANBAN_PRIORITIES)
  priority: string;

  @IsUUID()
  projectId: string;

  @IsString()
  @MaxLength(80)
  assigneeAlt: string;

  @IsOptional()
  @IsString()
  assigneeAvatarUrl?: string;

  @IsOptional()
  @IsString()
  createDate?: string;

  @IsOptional()
  @IsString()
  updateDate?: string;

  @IsOptional()
  @IsString()
  taskType?: string;

  @IsOptional()
  @IsString()
  jobType?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TicketMetaDto)
  meta?: TicketMetaDto[];
}
