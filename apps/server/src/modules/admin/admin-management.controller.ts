import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RequestUser } from '../auth/auth.types';
import { AdminManagementService } from './admin-management.service';
import { ListAdminNovelsDto } from './dto/list-admin-novels.dto';
import { ListAdminUsersDto } from './dto/list-admin-users.dto';
import { ListAuthorApplicationsDto } from './dto/list-author-applications.dto';
import { ReviewAuthorApplicationDto } from './dto/review-author-application.dto';
import { UpdateNovelStatusDto } from './dto/update-novel-status.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminManagementController {
  constructor(private readonly managementService: AdminManagementService) {}

  @Get('novels')
  async listNovels(@Query() query: ListAdminNovelsDto) {
    return {
      code: 0,
      message: 'ok',
      data: await this.managementService.listNovels(query),
    };
  }

  @Get('novels/:id')
  async getNovel(@Param('id') id: string) {
    return {
      code: 0,
      message: 'ok',
      data: await this.managementService.getNovel(id),
    };
  }

  @Patch('novels/:id/status')
  async updateNovelStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateNovelStatusDto,
  ) {
    return {
      code: 0,
      message: '作品状态已更新',
      data: await this.managementService.updateNovelStatus(user, id, dto),
    };
  }

  @Get('author-applications')
  async listAuthorApplications(@Query() query: ListAuthorApplicationsDto) {
    return {
      code: 0,
      message: 'ok',
      data: await this.managementService.listAuthorApplications(query),
    };
  }

  @Patch('author-applications/:id/review')
  async reviewAuthorApplication(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: ReviewAuthorApplicationDto,
  ) {
    return {
      code: 0,
      message: dto.action === 'approve' ? '作者申请已通过' : '作者申请已驳回',
      data: await this.managementService.reviewAuthorApplication(user, id, dto),
    };
  }

  @Get('users')
  async listUsers(@Query() query: ListAdminUsersDto) {
    return {
      code: 0,
      message: 'ok',
      data: await this.managementService.listUsers(query),
    };
  }

  @Get('users/:id')
  async getUser(@Param('id') id: string) {
    return {
      code: 0,
      message: 'ok',
      data: await this.managementService.getUser(id),
    };
  }

  @Patch('users/:id/role')
  async updateUserRole(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
  ) {
    return {
      code: 0,
      message: '用户角色已更新',
      data: await this.managementService.updateUserRole(user, id, dto),
    };
  }

  @Patch('users/:id/status')
  async updateUserStatus(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return {
      code: 0,
      message: dto.status === 'SUSPENDED' ? '用户已封禁' : '用户已解封',
      data: await this.managementService.updateUserStatus(user, id, dto),
    };
  }
}
