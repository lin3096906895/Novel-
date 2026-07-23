import { AuthorCalendarEventType } from '@prisma/client';
import { IsEnum, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAuthorCalendarEventDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsISO8601()
  eventAt!: string;

  @IsEnum(AuthorCalendarEventType)
  type!: AuthorCalendarEventType;
}
