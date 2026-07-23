import { IsIn } from 'class-validator';

export class UpdateNovelStatusDto {
  @IsIn(['DRAFT', 'REVIEWING', 'REJECTED', 'SERIALIZING', 'COMPLETED', 'HIDDEN'])
  status!: 'DRAFT' | 'REVIEWING' | 'REJECTED' | 'SERIALIZING' | 'COMPLETED' | 'HIDDEN';
}
