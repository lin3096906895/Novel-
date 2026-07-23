import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { SaveNovelRatingDto } from './dto/save-novel-rating.dto';
import { NovelRatingsService } from './novel-ratings.service';

@Controller('novels/:novelId/rating')
export class NovelRatingsController {
  constructor(private readonly ratingsService: NovelRatingsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async summary(
    @CurrentUser() user: RequestUser | undefined,
    @Param('novelId') novelId: string,
  ) {
    return {
      code: 0,
      message: 'ok',
      data: await this.ratingsService.summary(user, novelId),
    };
  }

  @Put()
  @UseGuards(JwtAuthGuard)
  async save(
    @CurrentUser() user: RequestUser,
    @Param('novelId') novelId: string,
    @Body() dto: SaveNovelRatingDto,
  ) {
    return {
      code: 0,
      message: '评分已保存',
      data: await this.ratingsService.save(user, novelId, dto.score),
    };
  }

  @Delete()
  @UseGuards(JwtAuthGuard)
  async remove(@CurrentUser() user: RequestUser, @Param('novelId') novelId: string) {
    return {
      code: 0,
      message: '评分已取消',
      data: await this.ratingsService.remove(user, novelId),
    };
  }
}
