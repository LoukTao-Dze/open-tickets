import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateFolderDto {
  @IsString()
  @Length(1, 80)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+$/)
  parentFolderId?: string | null;
}
