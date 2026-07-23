import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class UploadCoverDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  fileName!: string;

  @IsString()
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType!: 'image/jpeg' | 'image/png' | 'image/webp';

  @IsString()
  @MinLength(32)
  dataUrl!: string;
}
