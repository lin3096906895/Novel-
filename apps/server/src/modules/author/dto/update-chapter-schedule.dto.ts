import { IsISO8601, IsOptional } from 'class-validator';

export class UpdateChapterScheduleDto {
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string | null;
}
