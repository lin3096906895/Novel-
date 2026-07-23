import {
  ContentReportTargetType,
  ParagraphReportReason,
  ParagraphReportStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateContentReportDto {
  @IsIn(Object.values(ParagraphReportReason))
  reason!: ParagraphReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  detail?: string;
}

export class ListContentReportsDto {
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
  @IsIn(Object.values(ContentReportTargetType))
  targetType?: ContentReportTargetType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;
}

export class ContentReportStatsDto {
  @IsOptional()
  @Type(() => Number)
  @IsIn([7, 14, 30])
  days?: 7 | 14 | 30 = 7;
}

export class ReviewContentReportDto {
  @IsIn(['dismiss', 'restrict'])
  action!: 'dismiss' | 'restrict';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class BatchReviewContentReportsDto extends ReviewContentReportDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  ids!: string[];
}
