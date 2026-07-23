import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional } from 'class-validator';

export class ParagraphCommentReportStatsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([7, 14, 30])
  days?: number = 7;
}
