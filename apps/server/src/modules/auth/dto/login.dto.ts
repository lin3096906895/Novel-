import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: '请输入正确的邮箱' })
  email!: string;

  @IsString()
  @MinLength(6, { message: '密码至少需要 6 位' })
  password!: string;
}
