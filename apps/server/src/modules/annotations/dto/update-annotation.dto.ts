import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { annotationColors } from './create-annotation.dto';

export class UpdateAnnotationDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsOptional()
  @IsIn(annotationColors)
  color?: (typeof annotationColors)[number];
}
