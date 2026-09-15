import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

/**
 * Requests an ephemeral AI extraction pass. The generated entries are drafts
 * only; they are persisted only after the author explicitly confirms them.
 */
export class ExtractNovelMemoryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;

  @IsString()
  @MinLength(20)
  @MaxLength(30000)
  content!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sourceChapterId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  beforeChapterOrder?: number;
}
