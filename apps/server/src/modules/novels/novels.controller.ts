import { Controller, Get, Param, Query } from '@nestjs/common';
import { ListNovelsDto } from './dto/list-novels.dto';
import { NovelsService } from './novels.service';

@Controller()
export class NovelsController {
  constructor(private readonly novelsService: NovelsService) {}

  @Get('novels')
  async findAll(@Query() query: ListNovelsDto) {
    return {
      code: 0,
      message: 'ok',
      data: await this.novelsService.findPublicList(query),
    };
  }

  @Get('novels/:id')
  async findOne(@Param('id') id: string) {
    return {
      code: 0,
      message: 'ok',
      data: await this.novelsService.findPublicDetail(id),
    };
  }

  @Get('novels/:id/chapters')
  async findChapters(@Param('id') id: string) {
    return {
      code: 0,
      message: 'ok',
      data: await this.novelsService.findPublicChapters(id),
    };
  }

  @Get('novels/:id/announcements')
  async findAnnouncements(@Param('id') id: string) {
    return {
      code: 0,
      message: 'ok',
      data: await this.novelsService.findPublicAnnouncements(id),
    };
  }

  @Get('chapters/:id')
  async findChapter(@Param('id') id: string) {
    return {
      code: 0,
      message: 'ok',
      data: await this.novelsService.findPublicChapter(id),
    };
  }
}
