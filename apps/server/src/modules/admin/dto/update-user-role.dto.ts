import { IsIn } from 'class-validator';

export class UpdateUserRoleDto {
  @IsIn(['READER', 'AUTHOR', 'ADMIN'])
  role!: 'READER' | 'AUTHOR' | 'ADMIN';
}
