import { Global, Module } from '@nestjs/common';
import { ChapterPublicationService } from './chapter-publication.service';
import { ScheduledPublicationRunner } from './scheduled-publication.runner';

@Global()
@Module({
  providers: [ChapterPublicationService, ScheduledPublicationRunner],
  exports: [ChapterPublicationService],
})
export class PublicationModule {}
