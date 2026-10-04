import { IsOptional, IsString, Matches } from 'class-validator';

export class MoveFileDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  folderId?: string | null;
}
