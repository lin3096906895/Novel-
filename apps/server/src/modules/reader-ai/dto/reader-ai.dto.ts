import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const READER_AI_ACTIONS = ['ask', 'summary', 'recall', 'explain'] as const;

export type ReaderAiAction = (typeof READER_AI_ACTIONS)[number];

export class ReaderAiDto {
  @IsIn(READER_AI_ACTIONS)
  action!: ReaderAiAction;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  chapterId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  question?: string;

  @IsOptional()
  @IsString()
  @IsIn(['safe'])
  spoilerMode?: 'safe';
}
