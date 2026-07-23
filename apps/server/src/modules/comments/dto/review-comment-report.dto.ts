import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewCommentReportDto {
  @IsIn(['dismiss', 'remove'])
  action!: 'dismiss' | 'remove';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
