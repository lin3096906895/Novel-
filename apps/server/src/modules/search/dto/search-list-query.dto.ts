import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class SearchListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 10;
}

export class SearchSuggestionsQueryDto extends SearchListQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  keyword: string;
}
