import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateAuthorProfileDto {
  @IsString()
  @MinLength(2, { message: '笔名至少需要 2 个字符' })
  @MaxLength(30, { message: '笔名最多 30 个字符' })
  penName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: '作者简介最多 500 个字符' })
  bio?: string;
}
