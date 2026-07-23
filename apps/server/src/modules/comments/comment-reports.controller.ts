import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { RequestUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CommentReportsService } from './comment-reports.service';
import { BatchReviewCommentReportsDto } from './dto/batch-review-comment-reports.dto';
import { CreateCommentReportDto } from './dto/create-comment-report.dto';
import { ListCommentReportsDto } from './dto/list-comment-reports.dto';
import { ReviewCommentReportDto } from './dto/review-comment-report.dto';

@Controller()
export class CommentReportsController {
  constructor(private readonly reportsService: CommentReportsService) {}

  @Post('comments/:id/reports')
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: CreateCommentReportDto,
  ) {
    return {
      code: 0,
      message: '举报已提交',
      data: await this.reportsService.create(user, id, dto),
    };
  }

  @Get('admin/comment-reports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async list(@Query() query: ListCommentReportsDto) {
    return {
      code: 0,
      message: 'ok',
      data: await this.reportsService.list(query),
    };
  }

  @Patch('admin/comment-reports/batch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async batchReview(
    @CurrentUser() user: RequestUser,
    @Body() dto: BatchReviewCommentReportsDto,
  ) {
    return {
      code: 0,
      message: '批量处理已完成',
      data: await this.reportsService.batchReview(user, dto),
    };
  }

  @Patch('admin/comment-reports/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async review(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ReviewCommentReportDto,
  ) {
    return {
      code: 0,
      message: dto.action === 'remove' ? '违规评论已移除' : '举报已驳回',
      data: await this.reportsService.review(user, id, dto),
    };
  }
}
