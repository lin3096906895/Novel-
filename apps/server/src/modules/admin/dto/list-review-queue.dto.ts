import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListReviewQueueDto {
  @IsIn(['novel', 'chapter'])
  targetType!: 'novel' | 'chapter';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  pageSize?: number = 10;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;
}
