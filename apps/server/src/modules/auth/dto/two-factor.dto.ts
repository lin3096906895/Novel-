import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class BeginTwoFactorSetupDto {
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  currentPassword!: string;
}

export class EnableTwoFactorDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: '请输入 6 位验证器代码' })
  code!: string;
}

export class ManageTwoFactorDto {
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(20)
  code!: string;
}

export class VerifyTwoFactorLoginDto {
  @IsString()
  @MinLength(32)
  @MaxLength(128)
  challengeToken!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(20)
  code!: string;
}
