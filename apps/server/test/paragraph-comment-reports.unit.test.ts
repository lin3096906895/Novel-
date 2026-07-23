import { ParagraphReportReason, ParagraphReportStatus, UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ParagraphCommentReportsService } from '../src/modules/comments/paragraph-comment-reports.service';

const admin = {
  id: 'admin_1',
  email: 'admin@example.com',
  role: UserRole.ADMIN,
};

describe('ParagraphCommentReportsService', () => {
  it('groups selected reports for the same paragraph comment into one review', async () => {
    const service = new ParagraphCommentReportsService(
      {
        paragraphCommentReport: {
          findMany: async () => [
            { id: 'report_1', commentId: 'comment_1', status: ParagraphReportStatus.PENDING },
            { id: 'report_2', commentId: 'comment_1', status: ParagraphReportStatus.PENDING },
          ],
        },
      } as never,
      {} as never,
    );
    const reviewedIds: string[] = [];
    Object.defineProperty(service, 'review', {
      value: async (_user: unknown, id: string) => {
        reviewedIds.push(id);
        return { id };
      },
    });

    const result = await service.batchReview(admin, {
      ids: ['report_1', 'report_2', 'missing'],
      action: 'remove',
    });

    assert.deepEqual(reviewedIds, ['report_1']);
    assert.equal(result.succeeded, 2);
    assert.equal(result.failed, 1);
    assert.equal(result.items.find((item) => item.id === 'missing')?.error, '举报不存在');
  });

  it('creates or refreshes a pending report', async () => {
    let upsertArgs: unknown;
    const service = new ParagraphCommentReportsService(
      {
        paragraphComment: {
          findFirst: async () => ({ id: 'comment_1', userId: 'author_1' }),
        },
        paragraphCommentReport: {
          upsert: async (args: unknown) => {
            upsertArgs = args;
            return { id: 'report_1' };
          },
        },
      } as never,
      {} as never,
    );

    const result = await service.create(admin, 'comment_1', {
      reason: ParagraphReportReason.SPAM,
      detail: ' 重复广告 ',
    });

    assert.deepEqual(result, { id: 'report_1' });
    assert.deepEqual(upsertArgs, {
      where: { reporterId_commentId: { reporterId: admin.id, commentId: 'comment_1' } },
      update: {
        reason: ParagraphReportReason.SPAM,
        detail: '重复广告',
        status: ParagraphReportStatus.PENDING,
        reviewerId: null,
        resolution: null,
        resolvedAt: null,
      },
      create: {
        reporterId: admin.id,
        commentId: 'comment_1',
        reason: ParagraphReportReason.SPAM,
        detail: '重复广告',
      },
    });
  });

  it('removes reported content and records an audit entry', async () => {
    let commentUpdate: unknown;
    let reportUpdate: unknown;
    let auditEntry: unknown;
    const report = {
      id: 'report_1',
      reporterId: 'reader_1',
      commentId: 'comment_1',
      reason: ParagraphReportReason.ABUSE,
      detail: '攻击作者',
      status: ParagraphReportStatus.PENDING,
      resolution: null,
      resolvedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      reviewerId: null,
      reporter: { id: 'reader_1', nickname: '读者', email: 'reader@example.com' },
      reviewer: null,
      comment: {
        id: 'comment_1',
        userId: 'author_1',
        chapterId: 'chapter_1',
        paragraphIndex: 0,
        parentId: null,
        content: '违规内容',
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {
          id: 'author_1',
          nickname: '作者',
          email: 'author@example.com',
          role: UserRole.AUTHOR,
        },
        chapter: {
          id: 'chapter_1',
          title: '第一章',
          novel: { id: 'novel_1', title: '测试作品' },
        },
      },
    };
    const service = new ParagraphCommentReportsService(
      {
        paragraphCommentReport: {
          findUnique: async () => report,
        },
        $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            paragraphComment: {
              update: async (args: unknown) => {
                commentUpdate = args;
              },
            },
            paragraphCommentReport: {
              updateMany: async (args: unknown) => {
                reportUpdate = args;
              },
              findUniqueOrThrow: async () => ({
                ...report,
                status: ParagraphReportStatus.RESOLVED,
              }),
            },
          }),
      } as never,
      {
        record: async (args: unknown) => {
          auditEntry = args;
        },
      } as never,
    );

    const result = await service.review(admin, 'report_1', { action: 'remove' });

    assert.equal(result.status, ParagraphReportStatus.RESOLVED);
    assert.deepEqual(commentUpdate, {
      where: { id: 'comment_1' },
      data: { isDeleted: true, content: '' },
    });
    assert.deepEqual(reportUpdate, {
      where: { commentId: 'comment_1', status: ParagraphReportStatus.PENDING },
      data: {
        status: ParagraphReportStatus.RESOLVED,
        reviewerId: admin.id,
        resolution: null,
        resolvedAt: (reportUpdate as { data: { resolvedAt: Date } }).data.resolvedAt,
      },
    });
    assert.equal((auditEntry as { action: string }).action, 'paragraph-comment.report.remove');
  });

  it('aggregates report workload, reasons, resolution speed, and daily trend', async () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const findManyArgs: unknown[] = [];
    const service = new ParagraphCommentReportsService(
      {
        paragraphCommentReport: {
          findMany: (args: unknown) => {
            findManyArgs.push(args);
            return findManyArgs.length === 1
              ? Promise.resolve([
                  {
                    reason: ParagraphReportReason.ABUSE,
                    status: ParagraphReportStatus.RESOLVED,
                    createdAt: twoHoursAgo,
                  },
                  {
                    reason: ParagraphReportReason.SPAM,
                    status: ParagraphReportStatus.PENDING,
                    createdAt: oneHourAgo,
                  },
                ])
              : Promise.resolve([
                  {
                    status: ParagraphReportStatus.RESOLVED,
                    createdAt: twoHoursAgo,
                    resolvedAt: oneHourAgo,
                  },
                ]);
          },
          count: async () => 3,
        },
        $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
      } as never,
      {} as never,
    );

    const result = await service.stats({ days: 7 });

    assert.equal(result.periodDays, 7);
    assert.deepEqual(result.overview, {
      created: 2,
      pending: 3,
      resolved: 1,
      dismissed: 0,
      resolutionRate: 50,
      averageResolutionMinutes: 60,
    });
    assert.equal(
      result.reasonBreakdown.find((item) => item.reason === ParagraphReportReason.ABUSE)?.count,
      1,
    );
    assert.equal(
      result.reasonBreakdown.find((item) => item.reason === ParagraphReportReason.OTHER)?.count,
      0,
    );
    assert.equal(result.trend.length, 7);
    assert.deepEqual(result.trend.at(-1), {
      date: result.trend.at(-1)?.date,
      created: 2,
      resolved: 1,
      dismissed: 0,
    });
    assert.equal(findManyArgs.length, 2);
  });
});
