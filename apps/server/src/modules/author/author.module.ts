import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthorOnboardingController } from './author-onboarding.controller';
import { AuthorOnboardingService } from './author-onboarding.service';
import { AuthorAnnouncementsService } from './author-announcements.service';
import { AuthorAiService } from './author-ai.service';
import { AuthorCalendarService } from './author-calendar.service';
import { AuthorController } from './author.controller';
import { AuthorService } from './author.service';

@Module({
  imports: [AuthModule],
  controllers: [AuthorController, AuthorOnboardingController],
  providers: [
    AuthorService,
    AuthorAiService,
    AuthorOnboardingService,
    AuthorAnnouncementsService,
    AuthorCalendarService,
  ],
})
export class AuthorModule {}
