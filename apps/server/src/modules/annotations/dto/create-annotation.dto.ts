import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export const annotationColors = ['YELLOW', 'GREEN', 'BLUE', 'PINK'] as const;

export class CreateAnnotationDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  paragraphIndex!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  startOffset!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  endOffset!: number;

  @IsString()
  @MaxLength(1000)
  selectedText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsIn(annotationColors)
  color!: (typeof annotationColors)[number];
}
