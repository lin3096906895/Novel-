import { Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class PreviewCollectionTaskDto {
  @IsOptional()
  @IsIn(['wikisource', 'json', 'html'])
  sourceType?: 'wikisource' | 'json' | 'html';

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  titlePath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  summaryPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  chaptersPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  chapterTitlePath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  chapterContentPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  chapterUrlPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  chapterIdPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  titleSelector?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  summarySelector?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  chapterLinkSelector?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  chapterContentSelector?: string;

  @IsString()
  categoryId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sourceAuthor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  maxChapters?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  startChapter?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  endChapter?: number;

  @IsBoolean()
  @Equals(true, { message: '必须确认作品为公版或已获得明确授权' })
  rightsConfirmed!: true;
}
