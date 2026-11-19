import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  Min,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';

export const CANVAS_ITEM_TYPES = [
  'sticky-note',
  'image',
  'code-snippet',
  'text',
  'link',
  'markdown',
] as const;

export class CanvasItemReferenceDto {
  @IsInt()
  @Min(1)
  id!: number;

  @IsIn(CANVAS_ITEM_TYPES)
  type!: string;
}

export class CanvasProjectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  projectId!: string;
}

export class CanvasSelectionDto extends CanvasProjectDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CanvasItemReferenceDto)
  items!: CanvasItemReferenceDto[];
}

export class CreateCanvasGroupDto extends CanvasSelectionDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;
}

export class CanvasGroupDto extends CanvasProjectDto {
  @IsInt()
  @Min(1)
  groupId!: number;
}

export class UpdateCanvasGroupDto extends CanvasGroupDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color!: string;
}

export class MoveCanvasGroupDto extends CanvasGroupDto {
  @IsNumber({ allowNaN: false, allowInfinity: false })
  dx!: number;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  dy!: number;
}
