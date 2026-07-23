import { Module } from '@nestjs/common';
import { AdminAuditModule } from '../admin-audit/admin-audit.module';
import { AuthModule } from '../auth/auth.module';
import { AdminManagementController } from './admin-management.controller';
import { AdminManagementService } from './admin-management.service';
import { AdminReviewsController } from './admin-reviews.controller';
import { AdminReviewsService } from './admin-reviews.service';
import { TaxonomyController } from './taxonomy.controller';
import { TaxonomyService } from './taxonomy.service';

@Module({
  imports: [AuthModule, AdminAuditModule],
  controllers: [AdminReviewsController, AdminManagementController, TaxonomyController],
  providers: [AdminReviewsService, AdminManagementService, TaxonomyService],
})
export class AdminModule {}
