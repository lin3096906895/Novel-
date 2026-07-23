import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SaveNovelAnnouncementDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  title!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(1000)
  content!: string;

  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @IsIn(['save', 'publish'])
  action!: 'save' | 'publish';
}
