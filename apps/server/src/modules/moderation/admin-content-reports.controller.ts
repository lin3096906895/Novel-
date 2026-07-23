import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RequestUser } from '../auth/auth.types';
import { ContentReportsService } from './content-reports.service';
import {
  BatchReviewContentReportsDto,
  ContentReportStatsDto,
  ListContentReportsDto,
  ReviewContentReportDto,
} from './dto/content-report.dto';

@Controller('admin/content-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminContentReportsController {
  constructor(private readonly reports: ContentReportsService) {}

  @Get()
  async list(@Query() query: ListContentReportsDto) {
    return { code: 0, message: 'ok', data: await this.reports.list(query) };
  }

  @Get('stats')
  async stats(@Query() query: ContentReportStatsDto) {
    return { code: 0, message: 'ok', data: await this.reports.stats(query) };
  }

  @Patch('batch')
  async batchReview(@CurrentUser() user: RequestUser, @Body() dto: BatchReviewContentReportsDto) {
    return {
      code: 0,
      message: '举报已批量处理',
      data: await this.reports.batchReview(user, dto),
    };
  }

  @Patch(':id')
  async review(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ReviewContentReportDto,
  ) {
    return { code: 0, message: '举报已处理', data: await this.reports.review(user, id, dto) };
  }
}
