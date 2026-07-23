import { Body, Controller, Param, ParseEnumPipe, Post, UseGuards } from '@nestjs/common';
import { ContentReportTargetType } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/auth.types';
import { ContentReportsService } from './content-reports.service';
import { CreateContentReportDto } from './dto/content-report.dto';

@Controller('content-reports')
@UseGuards(JwtAuthGuard)
export class ContentReportsController {
  constructor(private readonly reports: ContentReportsService) {}

  @Post(':targetType/:targetId')
  async create(
    @CurrentUser() user: RequestUser,
    @Param('targetType', new ParseEnumPipe(ContentReportTargetType))
    targetType: ContentReportTargetType,
    @Param('targetId') targetId: string,
    @Body() dto: CreateContentReportDto,
  ) {
    return {
      code: 0,
      message: '举报已提交',
      data: await this.reports.create(user, targetType, targetId, dto),
    };
  }
}
