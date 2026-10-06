import { Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/auth.types';
import { AiHeaderBag } from '../ai/ai-provider';
import { AiProviderService } from '../ai/ai-provider.service';
import { ReaderAiDto } from './dto/reader-ai.dto';
import { ReaderAiService } from './reader-ai.service';

@Controller('novels/:novelId/reader-ai')
@UseGuards(JwtAuthGuard)
export class ReaderAiController {
  constructor(
    private readonly readerAiService: ReaderAiService,
    private readonly aiProviderService: AiProviderService,
  ) {}

  @Post('ask')
  async ask(
    @CurrentUser() user: RequestUser,
    @Param('novelId') novelId: string,
    @Body() dto: ReaderAiDto,
    @Headers() headers: AiHeaderBag,
  ) {
    const credentials = this.aiProviderService.fromHeaders(headers);
    return {
      code: 0,
      message: '阅界 AI 已生成回答',
      data: await this.readerAiService.ask(user, novelId, dto, credentials),
    };
  }
}
