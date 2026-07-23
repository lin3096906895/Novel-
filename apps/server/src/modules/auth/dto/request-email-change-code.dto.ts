import { IsEmail } from 'class-validator';

export class RequestEmailChangeCodeDto {
  @IsEmail({}, { message: '请输入正确的新邮箱' })
  email!: string;
}
