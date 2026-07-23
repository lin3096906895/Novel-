import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RequestUser } from '../auth/auth.types';
import { CreateSensitiveWordRuleDto } from './dto/create-sensitive-word-rule.dto';
import { ListSensitiveWordRulesDto } from './dto/list-sensitive-word-rules.dto';
import { UpdateSensitiveWordRuleDto } from './dto/update-sensitive-word-rule.dto';
import { SensitiveWordsService } from './sensitive-words.service';

@Controller('admin/sensitive-words')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminSensitiveWordsController {
  constructor(private readonly sensitiveWordsService: SensitiveWordsService) {}

  @Get()
  async list(@Query() query: ListSensitiveWordRulesDto) {
    return { code: 0, message: 'ok', data: await this.sensitiveWordsService.list(query) };
  }

  @Post()
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateSensitiveWordRuleDto) {
    return {
      code: 0,
      message: '敏感词规则已创建',
      data: await this.sensitiveWordsService.create(user, dto),
    };
  }

  @Patch(':ruleId')
  async update(
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateSensitiveWordRuleDto,
  ) {
    return {
      code: 0,
      message: '敏感词规则已更新',
      data: await this.sensitiveWordsService.update(ruleId, dto),
    };
  }

  @Delete(':ruleId')
  async delete(@Param('ruleId') ruleId: string) {
    return {
      code: 0,
      message: '敏感词规则已删除',
      data: await this.sensitiveWordsService.delete(ruleId),
    };
  }
}
