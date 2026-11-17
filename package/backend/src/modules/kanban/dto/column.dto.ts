import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const LANE_NAME_MAX_LENGTH = 80;
const COLUMN_ID_MAX_LENGTH = 100;
const LANE_ORDER_MAX_ITEMS = 200;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export class ColumnDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(LANE_NAME_MAX_LENGTH)
  name: string;

  @Matches(HEX_COLOR_PATTERN)
  color: string;
}

export class ColumnOrderDto {
  @ArrayNotEmpty()
  @ArrayMaxSize(LANE_ORDER_MAX_ITEMS)
  @ArrayUnique()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(COLUMN_ID_MAX_LENGTH, { each: true })
  columnIds: string[];
}

export class ColumnIdDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(COLUMN_ID_MAX_LENGTH)
  columnId: string;
}
