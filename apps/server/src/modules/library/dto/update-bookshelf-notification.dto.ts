import { IsBoolean } from 'class-validator';

export class UpdateBookshelfNotificationDto {
  @IsBoolean()
  enabled!: boolean;
}
