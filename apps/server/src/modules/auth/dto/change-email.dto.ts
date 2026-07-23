import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangeEmailDto {
  @IsEmail({}, { message: '请输入正确的新邮箱' })
  email!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: '请输入 6 位验证码' })
  code!: string;

  @IsString()
  @MinLength(6, { message: '当前密码格式不正确' })
  @MaxLength(64)
  currentPassword!: string;
}
