import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, Max, Min } from 'class-validator';

export const readingThemes = ['LIGHT', 'SEPIA', 'DARK'] as const;

export class UpdateReadingPreferenceDto {
  @Type(() => Number)
  @IsInt()
  @Min(15)
  @Max(24)
  fontSize!: number;

  @IsIn(readingThemes)
  theme!: (typeof readingThemes)[number];

  @Type(() => Number)
  @IsNumber()
  @Min(1.6)
  @Max(2.2)
  lineHeight!: number;

  @Type(() => Number)
  @IsInt()
  @Min(680)
  @Max(880)
  contentWidth!: number;
}
