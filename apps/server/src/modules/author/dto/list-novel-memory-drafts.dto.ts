import { NovelMemoryDraftStatus } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class ListNovelMemoryDraftsDto {
  @IsOptional()
  @IsEnum(NovelMemoryDraftStatus)
  status?: NovelMemoryDraftStatus;
}
