import { Module } from '@nestjs/common';
import { AdminAuditModule } from '../admin-audit/admin-audit.module';
import { AuthModule } from '../auth/auth.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { ParagraphCommentsController } from './paragraph-comments.controller';
import { ParagraphCommentsService } from './paragraph-comments.service';
import { ParagraphCommentReportsController } from './paragraph-comment-reports.controller';
import { ParagraphCommentReportsService } from './paragraph-comment-reports.service';
import { CommentReportsController } from './comment-reports.controller';
import { CommentReportsService } from './comment-reports.service';

@Module({
  imports: [AuthModule, AdminAuditModule],
  controllers: [
    CommentsController,
    ParagraphCommentsController,
    ParagraphCommentReportsController,
    CommentReportsController,
  ],
  providers: [
    CommentsService,
    ParagraphCommentsService,
    ParagraphCommentReportsService,
    CommentReportsService,
  ],
})
export class CommentsModule {}
