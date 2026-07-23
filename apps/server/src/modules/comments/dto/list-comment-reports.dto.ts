import { ParagraphReportStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListCommentReportsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 20;

  @IsOptional()
  @IsIn(Object.values(ParagraphReportStatus))
  status?: ParagraphReportStatus;

  @IsOptional()
  @IsIn(['ALL', 'NOVEL', 'CHAPTER'])
  source?: 'ALL' | 'NOVEL' | 'CHAPTER' = 'ALL';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;
}
