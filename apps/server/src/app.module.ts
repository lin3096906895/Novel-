import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminAuditModule } from './modules/admin-audit/admin-audit.module';
import { AdminModule } from './modules/admin/admin.module';
import { AnnotationsModule } from './modules/annotations/annotations.module';
import { AuthorModule } from './modules/author/author.module';
import { AuthorsModule } from './modules/authors/authors.module';
import { AuthModule } from './modules/auth/auth.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { CommentsModule } from './modules/comments/comments.module';
import { HealthController } from './modules/health/health.controller';
import { LibraryModule } from './modules/library/library.module';
import { MetaController } from './modules/meta/meta.controller';
import { ModerationModule } from './modules/moderation/moderation.module';
import { NovelsModule } from './modules/novels/novels.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { PublicationModule } from './modules/publication/publication.module';
import { RankingsModule } from './modules/rankings/rankings.module';
import { RecommendationsModule } from './modules/recommendations/recommendations.module';
import { SearchModule } from './modules/search/search.module';
import { UploadsModule } from './modules/uploads/uploads.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    PrismaModule,
    PublicationModule,
    AuthModule,
    CategoriesModule,
    NovelsModule,
    NotificationsModule,
    ModerationModule,
    AuthorModule,
    AuthorsModule,
    AdminAuditModule,
    AdminModule,
    AnnotationsModule,
    LibraryModule,
    CommentsModule,
    RecommendationsModule,
    RankingsModule,
    SearchModule,
    UploadsModule,
  ],
  controllers: [HealthController, MetaController],
})
export class AppModule {}
