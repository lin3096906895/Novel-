import { Type } from 'class-transformer';
import { IsInt, IsString, Max, Min } from 'class-validator';

export class SaveReadingHistoryDto {
  @IsString()
  novelId!: string;

  @IsString()
  chapterId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  progress!: number;
}
