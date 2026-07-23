import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RequestUser } from '../auth/auth.types';
import {
  CreateCategoryDto,
  CreateChannelDto,
  CreateTagDto,
  UpdateCategoryDto,
  UpdateChannelDto,
  UpdateTagDto,
} from './dto/taxonomy.dto';
import { TaxonomyService } from './taxonomy.service';

@Controller('admin/taxonomy')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class TaxonomyController {
  constructor(private readonly taxonomy: TaxonomyService) {}

  @Get()
  async overview() {
    return { code: 0, message: 'ok', data: await this.taxonomy.overview() };
  }

  @Post('channels')
  async createChannel(@CurrentUser() user: RequestUser, @Body() dto: CreateChannelDto) {
    return { code: 0, message: '频道已创建', data: await this.taxonomy.createChannel(user, dto) };
  }

  @Patch('channels/:id')
  async updateChannel(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateChannelDto,
  ) {
    return {
      code: 0,
      message: '频道已更新',
      data: await this.taxonomy.updateChannel(user, id, dto),
    };
  }

  @Delete('channels/:id')
  async deleteChannel(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return { code: 0, message: '频道已删除', data: await this.taxonomy.deleteChannel(user, id) };
  }

  @Post('categories')
  async createCategory(@CurrentUser() user: RequestUser, @Body() dto: CreateCategoryDto) {
    return { code: 0, message: '分类已创建', data: await this.taxonomy.createCategory(user, dto) };
  }

  @Patch('categories/:id')
  async updateCategory(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return {
      code: 0,
      message: '分类已更新',
      data: await this.taxonomy.updateCategory(user, id, dto),
    };
  }

  @Delete('categories/:id')
  async deleteCategory(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return { code: 0, message: '分类已删除', data: await this.taxonomy.deleteCategory(user, id) };
  }

  @Post('tags')
  async createTag(@CurrentUser() user: RequestUser, @Body() dto: CreateTagDto) {
    return { code: 0, message: '标签已创建', data: await this.taxonomy.createTag(user, dto) };
  }

  @Patch('tags/:id')
  async updateTag(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateTagDto,
  ) {
    return { code: 0, message: '标签已更新', data: await this.taxonomy.updateTag(user, id, dto) };
  }

  @Delete('tags/:id')
  async deleteTag(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return { code: 0, message: '标签已删除', data: await this.taxonomy.deleteTag(user, id) };
  }
}
