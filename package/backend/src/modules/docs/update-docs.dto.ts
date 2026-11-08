import { IsISO8601, IsString, Matches, MaxLength } from 'class-validator';

export const MAX_DOCS_LENGTH = 100_000;

export class UpdateDocsDto {
  @IsString()
  @Matches(/\S/, { message: 'Content must not be blank' })
  @MaxLength(MAX_DOCS_LENGTH)
  content!: string;

  @IsISO8601({ strict: true })
  updatedAt!: string;
}
