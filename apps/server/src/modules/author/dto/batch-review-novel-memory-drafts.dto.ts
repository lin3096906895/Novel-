import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsIn, IsString } from 'class-validator';
import {
  NOVEL_MEMORY_DRAFT_ACTIONS,
  NovelMemoryDraftAction,
} from './review-novel-memory-draft.dto';

export class BatchReviewNovelMemoryDraftsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  draftIds!: string[];

  @IsIn(NOVEL_MEMORY_DRAFT_ACTIONS)
  action!: NovelMemoryDraftAction;
}
