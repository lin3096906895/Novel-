import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListNovelsDto {
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  tagId?: string;

  @IsOptional()
  @IsIn(['SERIALIZING', 'COMPLETED'])
  status?: 'SERIALIZING' | 'COMPLETED';

  @IsOptional()
  @IsIn(['latest', 'popular', 'comments', 'bookshelf'])
  sort?: 'latest' | 'popular' | 'comments' | 'bookshelf';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 12;
}
