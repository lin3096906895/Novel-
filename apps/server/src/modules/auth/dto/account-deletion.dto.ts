import { Equals, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RequestAccountDeletionDto {
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  currentPassword!: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  code?: string;

  @IsString()
  @Equals('注销账号', { message: '请输入“注销账号”确认操作' })
  confirmation!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '注销原因最多 500 个字符' })
  reason?: string;
}

export class CancelAccountDeletionDto {
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  currentPassword!: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(20)
  code?: string;
}
