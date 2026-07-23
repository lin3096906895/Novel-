import { ParagraphReportReason } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateParagraphCommentReportDto {
  @IsIn(Object.values(ParagraphReportReason))
  reason!: ParagraphReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  detail?: string;
}
