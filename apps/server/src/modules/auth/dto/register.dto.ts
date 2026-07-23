import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: '请输入正确的邮箱' })
  email!: string;

  @IsString()
  @MinLength(6, { message: '密码至少需要 6 位' })
  @MaxLength(64, { message: '密码最多 64 位' })
  password!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: '请输入 6 位邮箱验证码' })
  verificationCode!: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: '昵称至少需要 2 个字符' })
  @MaxLength(20, { message: '昵称最多 20 个字符' })
  nickname?: string;
}
