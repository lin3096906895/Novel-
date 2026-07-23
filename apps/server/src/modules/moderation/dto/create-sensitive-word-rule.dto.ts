import { SensitiveWordScope } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSensitiveWordRuleDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  term!: string;

  @IsEnum(SensitiveWordScope)
  scope!: SensitiveWordScope;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}
