import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequestUser } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SaveReadingHistoryDto } from './dto/save-reading-history.dto';
import { SaveReadingSessionDto } from './dto/save-reading-session.dto';
import { UpdateBookshelfNotificationDto } from './dto/update-bookshelf-notification.dto';
import { UpdateReadingPreferenceDto } from './dto/update-reading-preference.dto';
import { LibraryService } from './library.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class LibraryController {
  constructor(private readonly libraryService: LibraryService) {}

  @Get('me/bookshelf')
  async getBookshelf(@CurrentUser() user: RequestUser) {
    return {
      code: 0,
      message: 'ok',
      data: await this.libraryService.getBookshelf(user),
    };
  }

  @Post('novels/:novelId/bookshelf')
  async addToBookshelf(@CurrentUser() user: RequestUser, @Param('novelId') novelId: string) {
    return {
      code: 0,
      message: '已加入书架',
      data: await this.libraryService.addToBookshelf(user, novelId),
    };
  }

  @Delete('novels/:novelId/bookshelf')
  async removeFromBookshelf(@CurrentUser() user: RequestUser, @Param('novelId') novelId: string) {
    return {
      code: 0,
      message: '已移出书架',
      data: await this.libraryService.removeFromBookshelf(user, novelId),
    };
  }

  @Patch('novels/:novelId/bookshelf/notification')
  async updateBookshelfNotification(
    @CurrentUser() user: RequestUser,
    @Param('novelId') novelId: string,
    @Body() dto: UpdateBookshelfNotificationDto,
  ) {
    return {
      code: 0,
      message: dto.enabled ? '已开启作品更新提醒' : '已关闭作品更新提醒',
      data: await this.libraryService.updateBookshelfNotification(user, novelId, dto.enabled),
    };
  }

  @Get('me/reading-histories')
  async getReadingHistories(@CurrentUser() user: RequestUser) {
    return {
      code: 0,
      message: 'ok',
      data: await this.libraryService.getReadingHistories(user),
    };
  }

  @Delete('me/reading-histories')
  async clearReadingHistories(@CurrentUser() user: RequestUser) {
    return {
      code: 0,
      message: '阅读历史已清空',
      data: await this.libraryService.clearReadingHistories(user),
    };
  }

  @Delete('me/reading-histories/:novelId')
  async removeReadingHistory(@CurrentUser() user: RequestUser, @Param('novelId') novelId: string) {
    return {
      code: 0,
      message: '阅读历史已删除',
      data: await this.libraryService.removeReadingHistory(user, novelId),
    };
  }

  @Get('novels/:novelId/reading-history')
  async getReadingHistory(@CurrentUser() user: RequestUser, @Param('novelId') novelId: string) {
    return {
      code: 0,
      message: 'ok',
      data: await this.libraryService.getReadingHistory(user, novelId),
    };
  }

  @Get('novels/:novelId/read-status')
  async getNovelReadStatus(@CurrentUser() user: RequestUser, @Param('novelId') novelId: string) {
    return {
      code: 0,
      message: 'ok',
      data: await this.libraryService.getNovelReadStatus(user, novelId),
    };
  }

  @Put('reading-histories')
  async saveReadingHistory(@CurrentUser() user: RequestUser, @Body() dto: SaveReadingHistoryDto) {
    return {
      code: 0,
      message: '阅读进度已保存',
      data: await this.libraryService.saveReadingHistory(user, dto),
    };
  }

  @Post('reading-sessions')
  async saveReadingSession(@CurrentUser() user: RequestUser, @Body() dto: SaveReadingSessionDto) {
    return {
      code: 0,
      message: '阅读时长已记录',
      data: await this.libraryService.saveReadingSession(user, dto),
    };
  }

  @Get('me/reading-preference')
  async getReadingPreference(@CurrentUser() user: RequestUser) {
    return {
      code: 0,
      message: 'ok',
      data: await this.libraryService.getReadingPreference(user),
    };
  }

  @Put('me/reading-preference')
  async updateReadingPreference(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateReadingPreferenceDto,
  ) {
    return {
      code: 0,
      message: '阅读偏好已保存',
      data: await this.libraryService.updateReadingPreference(user, dto),
    };
  }

  @Get('me/bookmarks')
  async getBookmarks(@CurrentUser() user: RequestUser) {
    return {
      code: 0,
      message: 'ok',
      data: await this.libraryService.getBookmarks(user),
    };
  }

  @Get('chapters/:chapterId/bookmark')
  async getChapterBookmark(
    @CurrentUser() user: RequestUser,
    @Param('chapterId') chapterId: string,
  ) {
    return {
      code: 0,
      message: 'ok',
      data: await this.libraryService.getChapterBookmark(user, chapterId),
    };
  }

  @Post('chapters/:chapterId/bookmark')
  async addChapterBookmark(
    @CurrentUser() user: RequestUser,
    @Param('chapterId') chapterId: string,
  ) {
    return {
      code: 0,
      message: '书签已添加',
      data: await this.libraryService.addChapterBookmark(user, chapterId),
    };
  }

  @Delete('chapters/:chapterId/bookmark')
  async removeChapterBookmark(
    @CurrentUser() user: RequestUser,
    @Param('chapterId') chapterId: string,
  ) {
    return {
      code: 0,
      message: '书签已移除',
      data: await this.libraryService.removeChapterBookmark(user, chapterId),
    };
  }
}
