import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateVolumeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}
