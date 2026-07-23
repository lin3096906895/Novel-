import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewAuthorApplicationDto {
  @IsIn(['approve', 'reject'])
  action!: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
