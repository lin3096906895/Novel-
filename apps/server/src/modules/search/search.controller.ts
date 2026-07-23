import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { RequestUser } from '../auth/auth.types';
import { RecordSearchDto } from './dto/record-search.dto';
import { SearchListQueryDto, SearchSuggestionsQueryDto } from './dto/search-list-query.dto';
import { SearchService } from './search.service';

@Controller()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Post('searches')
  @UseGuards(OptionalJwtAuthGuard)
  async record(@CurrentUser() user: RequestUser | undefined, @Body() dto: RecordSearchDto) {
    return {
      code: 0,
      message: '搜索已记录',
      data: await this.searchService.record(user, dto),
    };
  }

  @Get('searches/hot')
  async listHot(@Query() query: SearchListQueryDto) {
    return {
      code: 0,
      message: 'ok',
      data: await this.searchService.listHot(query),
    };
  }

  @Get('searches/suggestions')
  async suggestions(@Query() query: SearchSuggestionsQueryDto) {
    return {
      code: 0,
      message: 'ok',
      data: await this.searchService.suggestions(query),
    };
  }

  @Get('me/search-histories')
  @UseGuards(JwtAuthGuard)
  async listHistory(@CurrentUser() user: RequestUser, @Query() query: SearchListQueryDto) {
    return {
      code: 0,
      message: 'ok',
      data: await this.searchService.listHistory(user, query),
    };
  }

  @Delete('me/search-histories')
  @UseGuards(JwtAuthGuard)
  async clearHistory(@CurrentUser() user: RequestUser) {
    return {
      code: 0,
      message: '搜索历史已清空',
      data: await this.searchService.clearHistory(user),
    };
  }

  @Delete('me/search-histories/:id')
  @UseGuards(JwtAuthGuard)
  async removeHistory(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return {
      code: 0,
      message: '搜索记录已删除',
      data: await this.searchService.removeHistory(user, id),
    };
  }
}
