import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateUserStatusDto {
  @IsIn(['ACTIVE', 'SUSPENDED'])
  status!: 'ACTIVE' | 'SUSPENDED';

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: '封禁原因最多 200 个字符' })
  reason?: string;
}
