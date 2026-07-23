import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser, @Query() query: ListNotificationsDto) {
    return {
      code: 0,
      message: 'ok',
      data: await this.notificationsService.list(user, query),
    };
  }

  @Patch('read-all')
  async markAllRead(@CurrentUser() user: RequestUser) {
    return {
      code: 0,
      message: '通知已全部标记为已读',
      data: await this.notificationsService.markAllRead(user),
    };
  }

  @Patch(':id/read')
  async markRead(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return {
      code: 0,
      message: '通知已标记为已读',
      data: await this.notificationsService.markRead(user, id),
    };
  }
}
