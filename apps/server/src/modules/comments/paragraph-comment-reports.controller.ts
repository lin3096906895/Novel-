import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateParagraphCommentReportDto } from './dto/create-paragraph-comment-report.dto';
import { BatchReviewParagraphCommentReportsDto } from './dto/batch-review-paragraph-comment-reports.dto';
import { ListParagraphCommentReportsDto } from './dto/list-paragraph-comment-reports.dto';
import { ParagraphCommentReportStatsDto } from './dto/paragraph-comment-report-stats.dto';
import { ReviewParagraphCommentReportDto } from './dto/review-paragraph-comment-report.dto';
import { ParagraphCommentReportsService } from './paragraph-comment-reports.service';

@Controller()
export class ParagraphCommentReportsController {
  constructor(private readonly reportsService: ParagraphCommentReportsService) {}

  @Post('paragraph-comments/:id/reports')
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateParagraphCommentReportDto,
  ) {
    return {
      code: 0,
      message: '举报已提交',
      data: await this.reportsService.create(user, id, dto),
    };
  }

  @Get('admin/paragraph-comment-reports/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async stats(@Query() query: ParagraphCommentReportStatsDto) {
    return {
      code: 0,
      message: 'ok',
      data: await this.reportsService.stats(query),
    };
  }

  @Get('admin/paragraph-comment-reports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async list(@Query() query: ListParagraphCommentReportsDto) {
    return {
      code: 0,
      message: 'ok',
      data: await this.reportsService.list(query),
    };
  }

  @Patch('admin/paragraph-comment-reports/batch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async batchReview(
    @CurrentUser() user: RequestUser,
    @Body() dto: BatchReviewParagraphCommentReportsDto,
  ) {
    return {
      code: 0,
      message: '批量处理已完成',
      data: await this.reportsService.batchReview(user, dto),
    };
  }

  @Patch('admin/paragraph-comment-reports/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async review(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ReviewParagraphCommentReportDto,
  ) {
    return {
      code: 0,
      message: dto.action === 'remove' ? '违规段评已移除' : '举报已驳回',
      data: await this.reportsService.review(user, id, dto),
    };
  }
}
