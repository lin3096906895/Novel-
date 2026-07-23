import { ParagraphReportReason, ParagraphReportStatus, UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CommentReportsService } from '../src/modules/comments/comment-reports.service';

const admin = { id: 'admin_1', email: 'admin@example.com', role: UserRole.ADMIN };

describe('CommentReportsService', () => {
  it('creates a pending report with a stable comment snapshot', async () => {
    let upsertArgs: unknown;
    const service = new CommentReportsService(
      {
        comment: {
          findFirst: async () => ({
            id: 'comment_1',
            userId: 'author_1',
            content: '待举报评论',
            user: { id: 'author_1', nickname: '作者', email: 'author@example.com' },
            novel: { id: 'novel_1', title: '测试作品' },
            chapter: { id: 'chapter_1', title: '第一章' },
          }),
        },
        commentReport: {
          upsert: async (args: unknown) => {
            upsertArgs = args;
            return { id: 'report_1' };
          },
        },
      } as never,
      {} as never,
    );

    await service.create(admin, 'comment_1', {
      reason: ParagraphReportReason.ABUSE,
      detail: ' 攻击内容 ',
    });

    const args = upsertArgs as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
    assert.equal(args.create.contentSnapshot, '待举报评论');
    assert.equal(args.create.chapterTitle, '第一章');
    assert.equal(args.create.detail, '攻击内容');
    assert.equal(args.update.status, ParagraphReportStatus.PENDING);
  });

  it('removes a reported comment while preserving and auditing the report', async () => {
    let reportUpdate: unknown;
    let commentDelete: unknown;
    let auditEntry: unknown;
    const report = {
      id: 'report_1',
      reporterId: 'reader_1',
      reviewerId: null,
      commentId: 'comment_1',
      reason: ParagraphReportReason.SPAM,
      detail: null,
      status: ParagraphReportStatus.PENDING,
      resolution: null,
      resolvedAt: null,
      contentSnapshot: '广告评论',
      commentAuthorId: 'author_1',
      commentAuthorNickname: '作者',
      commentAuthorEmail: 'author@example.com',
      novelId: 'novel_1',
      novelTitle: '测试作品',
      chapterId: null,
      chapterTitle: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      reporter: { id: 'reader_1', nickname: '读者', email: 'reader@example.com' },
      reviewer: null,
    };
    const prisma = {
      commentReport: {
        findUnique: async () => report,
        updateMany: async (args: unknown) => {
          reportUpdate = args;
        },
        findUniqueOrThrow: async () => ({
          ...report,
          commentId: null,
          status: ParagraphReportStatus.RESOLVED,
        }),
      },
      comment: {
        findUnique: async () => ({
          id: 'comment_1',
          parentId: null,
          isDeleted: false,
          _count: { replies: 0 },
        }),
        delete: async (args: unknown) => {
          commentDelete = args;
        },
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    };
    const service = new CommentReportsService(
      prisma as never,
      {
        record: async (entry: unknown) => {
          auditEntry = entry;
        },
      } as never,
    );

    const result = await service.review(admin, report.id, { action: 'remove' });

    assert.equal(result.status, ParagraphReportStatus.RESOLVED);
    assert.deepEqual(commentDelete, { where: { id: 'comment_1' } });
    assert.equal(
      (reportUpdate as { data: { reviewerId: string } }).data.reviewerId,
      admin.id,
    );
    assert.equal((auditEntry as { action: string }).action, 'comment.report.remove');
  });
});
