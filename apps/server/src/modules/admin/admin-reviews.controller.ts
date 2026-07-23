import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RequestUser } from '../auth/auth.types';
import { AdminReviewsService } from './admin-reviews.service';
import { BatchReviewDto } from './dto/batch-review.dto';
import { ListReviewQueueDto } from './dto/list-review-queue.dto';
import { ReviewActionDto } from './dto/review-action.dto';

@Controller('admin/reviews')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminReviewsController {
  constructor(private readonly reviewsService: AdminReviewsService) {}

  @Get()
  async listPending() {
    return {
      code: 0,
      message: 'ok',
      data: await this.reviewsService.listPending(),
    };
  }

  @Get('queue')
  async listQueue(@Query() query: ListReviewQueueDto) {
    return {
      code: 0,
      message: 'ok',
      data: await this.reviewsService.listQueue(query),
    };
  }

  @Get('novels/:id')
  async getNovelDetail(@Param('id') id: string) {
    return {
      code: 0,
      message: 'ok',
      data: await this.reviewsService.getNovelDetail(id),
    };
  }

  @Get('chapters/:id')
  async getChapterDetail(@Param('id') id: string) {
    return {
      code: 0,
      message: 'ok',
      data: await this.reviewsService.getChapterDetail(id),
    };
  }

  @Patch('batch')
  async batchReview(@CurrentUser() user: RequestUser, @Body() dto: BatchReviewDto) {
    return {
      code: 0,
      message: '批量审核已完成',
      data: await this.reviewsService.batchReview(user, dto),
    };
  }

  @Patch('novels/:id')
  async reviewNovel(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ReviewActionDto,
  ) {
    return {
      code: 0,
      message: dto.action === 'approve' ? 'Novel approved' : 'Novel rejected',
      data: await this.reviewsService.reviewNovel(user, id, dto),
    };
  }

  @Patch('chapters/:id')
  async reviewChapter(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ReviewActionDto,
  ) {
    return {
      code: 0,
      message: dto.action === 'approve' ? 'Chapter approved' : 'Chapter rejected',
      data: await this.reviewsService.reviewChapter(user, id, dto),
    };
  }
}
