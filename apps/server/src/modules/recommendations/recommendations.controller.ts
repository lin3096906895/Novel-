import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PersonalizedRecommendationsQueryDto } from './dto/personalized-recommendations-query.dto';
import { UpdateRecommendSlotDto } from './dto/update-recommend-slot.dto';
import { RecommendationsService } from './recommendations.service';

@Controller()
export class RecommendationsController {
  constructor(private readonly recommendationsService: RecommendationsService) {}

  @Get('recommend-slots/:code')
  async findSlot(@Param('code') code: string) {
    return {
      code: 0,
      message: 'ok',
      data: await this.recommendationsService.findSlot(code),
    };
  }

  @Get('me/recommendations')
  @UseGuards(JwtAuthGuard)
  async personalized(
    @CurrentUser() user: RequestUser,
    @Query() query: PersonalizedRecommendationsQueryDto,
  ) {
    return {
      code: 0,
      message: 'ok',
      data: await this.recommendationsService.findPersonalized(user, query),
    };
  }

  @Get('admin/recommend-slots/:code')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async findSlotForAdmin(@Param('code') code: string) {
    return {
      code: 0,
      message: 'ok',
      data: await this.recommendationsService.findSlot(code),
    };
  }

  @Put('admin/recommend-slots/:code/items')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  async updateSlotItems(
    @CurrentUser() user: RequestUser,
    @Param('code') code: string,
    @Body() dto: UpdateRecommendSlotDto,
  ) {
    return {
      code: 0,
      message: 'Recommendation slot updated',
      data: await this.recommendationsService.updateSlotItems(user, code, dto),
    };
  }
}
