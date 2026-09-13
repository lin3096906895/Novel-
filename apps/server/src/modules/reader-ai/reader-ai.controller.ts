import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/auth.types';
import { ReaderAiDto } from './dto/reader-ai.dto';
import { ReaderAiService } from './reader-ai.service';

@Controller('novels/:novelId/reader-ai')
@UseGuards(JwtAuthGuard)
export class ReaderAiController {
  constructor(private readonly readerAiService: ReaderAiService) {}

  @Post('ask')
  async ask(
    @CurrentUser() user: RequestUser,
    @Param('novelId') novelId: string,
    @Body() dto: ReaderAiDto,
  ) {
    return {
      code: 0,
      message: '阅界 AI 已生成回答',
      data: await this.readerAiService.ask(user, novelId, dto),
    };
  }
}
