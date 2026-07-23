import { Controller, Get, Query } from '@nestjs/common';
import { CategoriesService } from './categories.service';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  async findAll(@Query('channel') channel?: string) {
    return {
      code: 0,
      message: 'ok',
      data: await this.categoriesService.findAll(channel),
    };
  }
}
