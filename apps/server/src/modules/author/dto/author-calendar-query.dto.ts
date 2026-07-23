import { IsOptional, IsString, Matches } from 'class-validator';

export class AuthorCalendarQueryDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month!: string;

  @IsOptional()
  @IsString()
  novelId?: string;
}
