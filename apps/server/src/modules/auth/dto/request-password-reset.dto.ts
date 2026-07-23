import { IsEmail } from 'class-validator';

export class RequestPasswordResetDto {
  @IsEmail({}, { message: '请输入正确的邮箱' })
  email!: string;
}
