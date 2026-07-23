import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { NovelRatingsController } from './novel-ratings.controller';
import { NovelRatingsService } from './novel-ratings.service';
import { NovelsController } from './novels.controller';
import { NovelsService } from './novels.service';

@Module({
  imports: [AuthModule],
  controllers: [NovelsController, NovelRatingsController],
  providers: [NovelsService, NovelRatingsService],
  exports: [NovelsService],
})
export class NovelsModule {}
