import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsString } from 'class-validator';

export class ReorderChaptersDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsString({ each: true })
  chapterIds!: string[];
}
