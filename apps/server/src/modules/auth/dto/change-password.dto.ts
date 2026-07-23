import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(6, { message: '当前密码格式不正确' })
  @MaxLength(64)
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: '新密码至少需要 8 位' })
  @MaxLength(64, { message: '新密码最多 64 位' })
  newPassword: string;
}
