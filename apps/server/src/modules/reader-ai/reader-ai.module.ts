import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorModule } from '../author/author.module';
import { ReaderAiController } from './reader-ai.controller';
import { ReaderAiService } from './reader-ai.service';

@Module({
  imports: [AuthModule, AuthorModule],
  controllers: [ReaderAiController],
  providers: [ReaderAiService],
})
export class ReaderAiModule {}
