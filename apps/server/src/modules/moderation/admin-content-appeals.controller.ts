import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RequestUser } from '../auth/auth.types';
import { ContentAppealsService } from './content-appeals.service';
import { ListContentAppealsDto, ReviewContentAppealDto } from './dto/content-appeal.dto';

@Controller('admin/content-appeals')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminContentAppealsController {
  constructor(private readonly appeals: ContentAppealsService) {}

  @Get()
  async list(@Query() query: ListContentAppealsDto) {
    return { code: 0, message: 'ok', data: await this.appeals.list(query) };
  }

  @Patch(':id')
  async review(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ReviewContentAppealDto,
  ) {
    return { code: 0, message: '申诉已处理', data: await this.appeals.review(user, id, dto) };
  }
}
