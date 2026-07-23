import { IsOptional, IsString } from 'class-validator';

export class AssignChapterVolumeDto {
  @IsOptional()
  @IsString()
  volumeId?: string | null;
}
