import { IsIn } from 'class-validator';

export class UpdateNovelLifecycleDto {
  @IsIn(['complete', 'resume'])
  action!: 'complete' | 'resume';
}
