import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const paragraphReportActions = ['dismiss', 'remove'] as const;

export class ReviewParagraphCommentReportDto {
  @IsIn(paragraphReportActions)
  action!: (typeof paragraphReportActions)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
