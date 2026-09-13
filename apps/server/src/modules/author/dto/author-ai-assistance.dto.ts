import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export const AUTHOR_AI_ACTIONS = [
  'character',
  'naming',
  'inspiration',
  'research',
  'summary',
  'outline',
  'polish',
  'consistency',
] as const;

export type AuthorAiAction = (typeof AUTHOR_AI_ACTIONS)[number];

export class AuthorAiAssistanceDto {
  @IsIn(AUTHOR_AI_ACTIONS)
  action!: AuthorAiAction;

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
  @MaxLength(200)
  query?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  novelId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  beforeChapterOrder?: number;
}
