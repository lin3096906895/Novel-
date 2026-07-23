import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ChapterPublicationService } from './chapter-publication.service';

@Injectable()
export class ScheduledPublicationRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledPublicationRunner.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly publicationService: ChapterPublicationService) {}

  onModuleInit() {
    void this.publishDueChapters();
    this.timer = setInterval(() => void this.publishDueChapters(), 5000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async publishDueChapters() {
    try {
      const published = await this.publicationService.publishDueChapters();
      if (published.length > 0) {
        this.logger.log(`Published ${published.length} scheduled chapter(s)`);
      }
    } catch (error) {
      this.logger.error(
        `Scheduled publication failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
