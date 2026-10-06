import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiProviderModule } from '../ai/ai-provider.module';
import { UploadsModule } from '../uploads/uploads.module';
import { AuthorOnboardingController } from './author-onboarding.controller';
import { AuthorOnboardingService } from './author-onboarding.service';
import { AuthorAnnouncementsService } from './author-announcements.service';
import { AuthorAiService } from './author-ai.service';
import { AuthorCalendarService } from './author-calendar.service';
import { AuthorCollectionService } from './author-collection.service';
import { AuthorMemoryService } from './author-memory.service';
import { AuthorController } from './author.controller';
import { AuthorRagService } from './author-rag.service';
import { AuthorService } from './author.service';

@Module({
  imports: [AuthModule, AiProviderModule, UploadsModule],
  controllers: [AuthorController, AuthorOnboardingController],
  providers: [
    AuthorService,
    AuthorAiService,
    AuthorOnboardingService,
    AuthorAnnouncementsService,
    AuthorCalendarService,
    AuthorCollectionService,
    AuthorMemoryService,
    AuthorRagService,
  ],
  exports: [AuthorRagService],
})
export class AuthorModule {}
