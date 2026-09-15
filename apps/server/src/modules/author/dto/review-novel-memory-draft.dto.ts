import { NovelMemoryType } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const NOVEL_MEMORY_DRAFT_ACTIONS = ['ACCEPT', 'REJECT'] as const;
export type NovelMemoryDraftAction = (typeof NOVEL_MEMORY_DRAFT_ACTIONS)[number];

export class ReviewNovelMemoryDraftDto {
  @IsIn(NOVEL_MEMORY_DRAFT_ACTIONS)
  action!: NovelMemoryDraftAction;

  @IsOptional()
  @IsEnum(NovelMemoryType)
  type?: NovelMemoryType;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content?: string;
}
