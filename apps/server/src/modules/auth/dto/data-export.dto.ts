import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ExportPersonalDataDto {
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  currentPassword!: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  code?: string;
}
