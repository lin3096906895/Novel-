import { AuthorCalendarEventType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateAuthorCalendarEventDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsISO8601()
  eventAt?: string;

  @IsOptional()
  @IsEnum(AuthorCalendarEventType)
  type?: AuthorCalendarEventType;

  @IsOptional()
  @IsBoolean()
  isCompleted?: boolean;
}
