import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsEmail({}, { message: '请输入正确的邮箱' })
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: '请输入 6 位验证码' })
  code!: string;

  @IsString()
  @MinLength(8, { message: '新密码至少需要 8 位' })
  @MaxLength(64, { message: '新密码最多 64 位' })
  newPassword!: string;
}
