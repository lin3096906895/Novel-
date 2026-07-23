import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnnotationsService } from './annotations.service';
import { CreateAnnotationDto } from './dto/create-annotation.dto';
import { UpdateAnnotationDto } from './dto/update-annotation.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class AnnotationsController {
  constructor(private readonly annotationsService: AnnotationsService) {}

  @Get('chapters/:chapterId/annotations')
  async listForChapter(@CurrentUser() user: RequestUser, @Param('chapterId') chapterId: string) {
    return {
      code: 0,
      message: 'ok',
      data: await this.annotationsService.listForChapter(user, chapterId),
    };
  }

  @Get('me/annotations')
  async listMine(@CurrentUser() user: RequestUser) {
    return {
      code: 0,
      message: 'ok',
      data: await this.annotationsService.listMine(user),
    };
  }

  @Post('chapters/:chapterId/annotations')
  async create(
    @CurrentUser() user: RequestUser,
    @Param('chapterId') chapterId: string,
    @Body() dto: CreateAnnotationDto,
  ) {
    return {
      code: 0,
      message: dto.note?.trim() ? '批注已保存' : '划线已保存',
      data: await this.annotationsService.create(user, chapterId, dto),
    };
  }

  @Patch('me/annotations/:id')
  async update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateAnnotationDto,
  ) {
    return {
      code: 0,
      message: '批注已更新',
      data: await this.annotationsService.update(user, id, dto),
    };
  }

  @Delete('me/annotations/:id')
  async remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return {
      code: 0,
      message: '划线已删除',
      data: await this.annotationsService.remove(user, id),
    };
  }
}
