import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateChapterDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  volumeId?: string | null;

  @IsOptional()
  @IsISO8601()
  scheduledAt?: string | null;

  @IsOptional()
  @IsIn(['save', 'submit'])
  action?: 'save' | 'submit';

  @IsOptional()
  @IsIn(['manual', 'autosave'])
  saveSource?: 'manual' | 'autosave';
}
