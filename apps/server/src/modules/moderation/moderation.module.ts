import { Global, Module } from '@nestjs/common';
import { AdminAuditModule } from '../admin-audit/admin-audit.module';
import { AuthModule } from '../auth/auth.module';
import { AdminContentAppealsController } from './admin-content-appeals.controller';
import { AdminContentReportsController } from './admin-content-reports.controller';
import { AdminSensitiveWordsController } from './admin-sensitive-words.controller';
import { ContentAppealsController } from './content-appeals.controller';
import { ContentAppealsService } from './content-appeals.service';
import { ContentReportsController } from './content-reports.controller';
import { ContentReportsService } from './content-reports.service';
import { SensitiveWordsService } from './sensitive-words.service';

@Global()
@Module({
  imports: [AuthModule, AdminAuditModule],
  controllers: [
    AdminSensitiveWordsController,
    ContentAppealsController,
    AdminContentAppealsController,
    ContentReportsController,
    AdminContentReportsController,
  ],
  providers: [SensitiveWordsService, ContentReportsService, ContentAppealsService],
  exports: [SensitiveWordsService],
})
export class ModerationModule {}
