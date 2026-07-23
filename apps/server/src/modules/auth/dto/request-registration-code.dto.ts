import { IsEmail } from 'class-validator';

export class RequestRegistrationCodeDto {
  @IsEmail({}, { message: '请输入正确的邮箱' })
  email!: string;
}
