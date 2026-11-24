import {
  IsNumber,
  IsIn,
  IsInt,
  IsOptional,
  IsNotEmpty,
  Matches,
  Max,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CANVAS_ITEM_TYPES, CanvasProjectDto } from './canvas-selection.dto';

export const CANVAS_CONNECTION_ANCHORS = [
  'top',
  'right',
  'bottom',
  'left',
] as const;
export type CanvasConnectionAnchor = (typeof CANVAS_CONNECTION_ANCHORS)[number];

export class CanvasConnectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  projectId!: string;

  @IsInt()
  @Min(1)
  sourceItemId!: number;

  @IsIn(CANVAS_ITEM_TYPES)
  sourceItemType!: string;

  @IsInt()
  @Min(1)
  targetItemId!: number;

  @IsIn(CANVAS_ITEM_TYPES)
  targetItemType!: string;

  @IsOptional()
  @IsIn(CANVAS_CONNECTION_ANCHORS)
  sourceAnchor?: CanvasConnectionAnchor | null;

  @IsOptional()
  @IsIn(CANVAS_CONNECTION_ANCHORS)
  targetAnchor?: CanvasConnectionAnchor | null;
}

export class CanvasConnectionIdDto extends CanvasProjectDto {
  @IsInt()
  @Min(1)
  connectionId!: number;
}

export class UpdateCanvasConnectionDto extends CanvasConnectionIdDto {
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color!: string;

  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(1)
  @Max(8)
  strokeWidth!: number;
}
