import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('meta')
export class MetaController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('channels')
  async channels() {
    return {
      code: 0,
      message: 'ok',
      data: await this.prisma.contentChannel
        .findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] })
        .then((items) => items.map((item) => ({ id: item.code, name: item.name }))),
    };
  }

  @Get('tags')
  async tags() {
    return {
      code: 0,
      message: 'ok',
      data: await this.prisma.tag.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    };
  }
}
