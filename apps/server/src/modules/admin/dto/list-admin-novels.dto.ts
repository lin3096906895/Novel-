import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListAdminNovelsDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'REVIEWING', 'REJECTED', 'SERIALIZING', 'COMPLETED', 'HIDDEN'])
  status?: 'DRAFT' | 'REVIEWING' | 'REJECTED' | 'SERIALIZING' | 'COMPLETED' | 'HIDDEN';

  @IsOptional()
  @IsIn(['latest', 'popular'])
  sort?: 'latest' | 'popular';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
