import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateParagraphCommentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  content!: string;

  @IsOptional()
  @IsString()
  parentId?: string;
}
