import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CreateParagraphCommentDto } from './dto/create-paragraph-comment.dto';
import { ListCommentsDto } from './dto/list-comments.dto';
import { ParagraphCommentsService } from './paragraph-comments.service';

@Controller()
export class ParagraphCommentsController {
  constructor(private readonly paragraphCommentsService: ParagraphCommentsService) {}

  @Get('chapters/:chapterId/paragraph-comments/summary')
  async summary(@Param('chapterId') chapterId: string) {
    return {
      code: 0,
      message: 'ok',
      data: await this.paragraphCommentsService.summary(chapterId),
    };
  }

  @Get('me/paragraph-comments')
  @UseGuards(JwtAuthGuard)
  async listMine(@CurrentUser() user: RequestUser, @Query() query: ListCommentsDto) {
    return {
      code: 0,
      message: 'ok',
      data: await this.paragraphCommentsService.listMine(user, query),
    };
  }

  @Get('chapters/:chapterId/paragraphs/:paragraphIndex/comments')
  @UseGuards(OptionalJwtAuthGuard)
  async list(
    @CurrentUser() user: RequestUser | undefined,
    @Param('chapterId') chapterId: string,
    @Param('paragraphIndex', ParseIntPipe) paragraphIndex: number,
    @Query() query: ListCommentsDto,
  ) {
    return {
      code: 0,
      message: 'ok',
      data: await this.paragraphCommentsService.list(user, chapterId, paragraphIndex, query),
    };
  }

  @Post('chapters/:chapterId/paragraphs/:paragraphIndex/comments')
  @UseGuards(JwtAuthGuard)
  async create(
    @CurrentUser() user: RequestUser,
    @Param('chapterId') chapterId: string,
    @Param('paragraphIndex', ParseIntPipe) paragraphIndex: number,
    @Body() dto: CreateParagraphCommentDto,
  ) {
    return {
      code: 0,
      message: dto.parentId ? '回复已发布' : '段评已发布',
      data: await this.paragraphCommentsService.create(user, chapterId, paragraphIndex, dto),
    };
  }

  @Put('paragraph-comments/:id/like')
  @UseGuards(JwtAuthGuard)
  async like(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return {
      code: 0,
      message: '已点赞',
      data: await this.paragraphCommentsService.like(user, id),
    };
  }

  @Delete('paragraph-comments/:id/like')
  @UseGuards(JwtAuthGuard)
  async unlike(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return {
      code: 0,
      message: '已取消点赞',
      data: await this.paragraphCommentsService.unlike(user, id),
    };
  }

  @Delete('me/paragraph-comments/:id')
  @UseGuards(JwtAuthGuard)
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return {
      code: 0,
      message: '段评已删除',
      data: await this.paragraphCommentsService.remove(user, id),
    };
  }
}
