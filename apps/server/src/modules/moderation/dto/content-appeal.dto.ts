import { ContentAppealStatus, ContentAppealTargetType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateContentAppealDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}

export class ListMyContentAppealsDto {
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
  pageSize?: number = 20;
}

export class ListContentAppealsDto extends ListMyContentAppealsDto {
  @IsOptional()
  @IsIn(Object.values(ContentAppealStatus))
  status?: ContentAppealStatus;

  @IsOptional()
  @IsIn(Object.values(ContentAppealTargetType))
  targetType?: ContentAppealTargetType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;
}

export class ReviewContentAppealDto {
  @IsIn(['approve', 'reject'])
  action!: 'approve' | 'reject';

  @ValidateIf((dto: ReviewContentAppealDto) => dto.action === 'reject' || dto.note !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note?: string;
}
