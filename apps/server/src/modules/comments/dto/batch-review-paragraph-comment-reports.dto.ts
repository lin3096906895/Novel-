import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class BatchReviewParagraphCommentReportsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  ids!: string[];

  @IsIn(['dismiss', 'remove'])
  action!: 'dismiss' | 'remove';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
