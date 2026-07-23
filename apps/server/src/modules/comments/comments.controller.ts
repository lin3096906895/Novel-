import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { BatchCommentDeleteDto } from './dto/batch-comment-delete.dto';
import { ListCommentsDto } from './dto/list-comments.dto';

@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('novels/:novelId/comments')
  @UseGuards(OptionalJwtAuthGuard)
  async listByNovel(
    @CurrentUser() user: RequestUser | undefined,
    @Param('novelId') novelId: string,
    @Query() query: ListCommentsDto,
  ) {
    return {
      code: 0,
      message: 'ok',
      data: await this.commentsService.listByNovel(user, novelId, query),
    };
  }

  @Post('novels/:novelId/comments')
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: RequestUser,
    @Param('novelId') novelId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return {
      code: 0,
      message: dto.parentId ? '回复已发布' : '评论已发布',
      data: await this.commentsService.create(user, novelId, dto),
    };
  }

  @Get('chapters/:chapterId/comments')
  @UseGuards(OptionalJwtAuthGuard)
  async listByChapter(
    @CurrentUser() user: RequestUser | undefined,
    @Param('chapterId') chapterId: string,
    @Query() query: ListCommentsDto,
  ) {
    return {
      code: 0,
      message: 'ok',
      data: await this.commentsService.listByChapter(user, chapterId, query),
    };
  }

  @Post('chapters/:chapterId/comments')
  @UseGuards(JwtAuthGuard)
  async createForChapter(
    @CurrentUser() user: RequestUser,
    @Param('chapterId') chapterId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return {
      code: 0,
      message: dto.parentId ? '回复已发布' : '章节评论已发布',
      data: await this.commentsService.createForChapter(user, chapterId, dto),
    };
  }

  @Put('comments/:id/like')
  @UseGuards(JwtAuthGuard)
  async like(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return {
      code: 0,
      message: '已点赞',
      data: await this.commentsService.like(user, id),
    };
  }

  @Delete('comments/:id/like')
  @UseGuards(JwtAuthGuard)
  async unlike(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return {
      code: 0,
      message: '已取消点赞',
      data: await this.commentsService.unlike(user, id),
    };
  }

  @Get('me/comments')
  @UseGuards(JwtAuthGuard)
  async listMine(@CurrentUser() user: RequestUser, @Query() query: ListCommentsDto) {
    return {
      code: 0,
      message: 'ok',
      data: await this.commentsService.listMine(user, query),
    };
  }

  @Delete('me/comments/:id')
  @UseGuards(JwtAuthGuard)
  async deleteMine(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return {
      code: 0,
      message: '评论已删除',
      data: await this.commentsService.deleteMine(user, id),
    };
  }

  @Get('admin/comments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async listRecentForAdmin() {
    return {
      code: 0,
      message: 'ok',
      data: await this.commentsService.listRecentForAdmin(),
    };
  }

  @Delete('admin/comments/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async deleteAsAdmin(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return {
      code: 0,
      message: '评论已删除',
      data: await this.commentsService.deleteAsAdmin(id, user),
    };
  }

  @Delete('admin/comments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async deleteManyAsAdmin(
    @CurrentUser() user: RequestUser,
    @Body() dto: BatchCommentDeleteDto,
  ) {
    return {
      code: 0,
      message: '批量删除已完成',
      data: await this.commentsService.deleteManyAsAdmin(dto.ids, user),
    };
  }
}
