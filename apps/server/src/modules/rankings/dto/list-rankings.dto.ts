import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export type RankingType = 'popular' | 'bookshelf' | 'comments' | 'new';
export type RankingPeriod = 'day' | 'week' | 'month' | 'all';

export class ListRankingsDto {
  @IsOptional()
  @IsIn(['popular', 'bookshelf', 'comments', 'new'])
  type?: RankingType = 'popular';

  @IsOptional()
  @IsIn(['day', 'week', 'month', 'all'])
  period?: RankingPeriod = 'week';

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;
}
