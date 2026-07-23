import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateVolumeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}
