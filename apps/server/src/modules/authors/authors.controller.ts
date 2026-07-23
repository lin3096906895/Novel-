import { Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { AuthorsService } from './authors.service';

@Controller()
export class AuthorsController {
  constructor(private readonly authorsService: AuthorsService) {}

  @Get('authors/:authorId')
  @UseGuards(OptionalJwtAuthGuard)
  async getPublicProfile(
    @CurrentUser() user: RequestUser | undefined,
    @Param('authorId') authorId: string,
  ) {
    return {
      code: 0,
      message: 'ok',
      data: await this.authorsService.getPublicProfile(user, authorId),
    };
  }

  @Get('me/followed-authors')
  @UseGuards(JwtAuthGuard)
  async listFollowedAuthors(@CurrentUser() user: RequestUser) {
    return {
      code: 0,
      message: 'ok',
      data: await this.authorsService.listFollowedAuthors(user),
    };
  }

  @Post('authors/:authorId/follow')
  @UseGuards(JwtAuthGuard)
  async follow(@CurrentUser() user: RequestUser, @Param('authorId') authorId: string) {
    return {
      code: 0,
      message: '已关注作者',
      data: await this.authorsService.follow(user, authorId),
    };
  }

  @Delete('authors/:authorId/follow')
  @UseGuards(JwtAuthGuard)
  async unfollow(@CurrentUser() user: RequestUser, @Param('authorId') authorId: string) {
    return {
      code: 0,
      message: '已取消关注',
      data: await this.authorsService.unfollow(user, authorId),
    };
  }
}
