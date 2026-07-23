import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ContentAppealTargetType } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/auth.types';
import { ContentAppealsService } from './content-appeals.service';
import { CreateContentAppealDto, ListMyContentAppealsDto } from './dto/content-appeal.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class ContentAppealsController {
  constructor(private readonly appeals: ContentAppealsService) {}

  @Get('me/content-appeals/targets')
  async listTargets(@CurrentUser() user: RequestUser) {
    return { code: 0, message: 'ok', data: await this.appeals.listEligibleTargets(user) };
  }

  @Get('me/content-appeals')
  async listMine(@CurrentUser() user: RequestUser, @Query() query: ListMyContentAppealsDto) {
    return { code: 0, message: 'ok', data: await this.appeals.listMine(user, query) };
  }

  @Post('content-appeals/:targetType/:targetId')
  async create(
    @CurrentUser() user: RequestUser,
    @Param('targetType', new ParseEnumPipe(ContentAppealTargetType))
    targetType: ContentAppealTargetType,
    @Param('targetId') targetId: string,
    @Body() dto: CreateContentAppealDto,
  ) {
    return {
      code: 0,
      message: '申诉已提交',
      data: await this.appeals.create(user, targetType, targetId, dto),
    };
  }
}
