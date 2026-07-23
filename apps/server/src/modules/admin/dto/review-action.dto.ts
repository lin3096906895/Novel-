import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewActionDto {
  @IsIn(['approve', 'reject'])
  action!: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
