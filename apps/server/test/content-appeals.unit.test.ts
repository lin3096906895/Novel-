import {
  ChapterStatus,
  ContentAppealStatus,
  ContentAppealTargetType,
  NovelStatus,
  UserRole,
} from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ContentAppealsService } from '../src/modules/moderation/content-appeals.service';

const admin = { id: 'admin_1', email: 'admin@example.com', role: UserRole.ADMIN };

describe('ContentAppealsService', () => {
  it('restores a safety-restricted chapter and recalculates novel word count', async () => {
    let chapterUpdate: unknown;
    let novelUpdate: unknown;
    let auditEntry: unknown;
    let notificationEntry: unknown;
    const appeal = {
      id: 'appeal_1',
      appellantId: 'author_1',
      targetType: ContentAppealTargetType.CHAPTER,
      targetId: 'chapter_1',
      targetTitle: '星海公约 / 第一章',
      reason: '章节已经完成整改',
      status: ContentAppealStatus.PENDING,
      sourceAudit: {
        id: 'audit_1',
        before: { status: ChapterStatus.PUBLISHED, publishedAt: '2026-07-20T10:00:00.000Z' },
        after: { status: ChapterStatus.REJECTED },
        createdAt: new Date(),
      },
      sourceReport: {
        id: 'report_1',
        reason: 'OTHER',
        resolution: '内容违规',
        resolvedAt: new Date(),
        targetSnapshot: { publishedAt: '2026-07-20T10:00:00.000Z' },
      },
      reviewer: null,
      appellant: { id: 'author_1', nickname: '作者', email: 'author@example.com' },
    };
    const prisma = {
      contentAppeal: {
        findUnique: async () => appeal,
        update: async () => ({ ...appeal, status: ContentAppealStatus.APPROVED }),
      },
      chapter: {
        findFirst: async () => ({
          id: 'chapter_1',
          novelId: 'novel_1',
          title: '第一章',
          status: ChapterStatus.REJECTED,
          wordCount: 1200,
          deletedAt: null,
          novel: { id: 'novel_1', status: NovelStatus.SERIALIZING, wordCount: 0 },
        }),
        update: async (args: unknown) => {
          chapterUpdate = args;
          return { id: 'chapter_1', novelId: 'novel_1', status: ChapterStatus.PUBLISHED };
        },
        aggregate: async () => ({ _sum: { wordCount: 1200 } }),
      },
      novel: {
        update: async (args: unknown) => {
          novelUpdate = args;
          return { id: 'novel_1', wordCount: 1200 };
        },
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    };
    const service = new ContentAppealsService(
      prisma as never,
      { record: async (entry: unknown) => (auditEntry = entry) } as never,
      { create: async (entry: unknown) => (notificationEntry = entry) } as never,
    );

    const result = await service.review(admin, appeal.id, { action: 'approve' });

    assert.equal(result.status, ContentAppealStatus.APPROVED);
    assert.equal(
      (chapterUpdate as { data: { status: ChapterStatus } }).data.status,
      ChapterStatus.PUBLISHED,
    );
    assert.equal((novelUpdate as { data: { wordCount: number } }).data.wordCount, 1200);
    assert.equal((auditEntry as { action: string }).action, 'content_appeal.approve');
    assert.equal((notificationEntry as { userId: string }).userId, 'author_1');
  });

  it('does not expose an ordinary rejected chapter without a safety audit', async () => {
    const service = new ContentAppealsService(
      {
        contentReport: {
          findMany: async () => [
            {
              id: 'report_1',
              targetType: 'CHAPTER',
              targetId: 'chapter_1',
              targetTitle: '普通审核驳回章节',
              resolution: '审核未通过',
            },
          ],
        },
        adminAuditLog: { findMany: async () => [] },
      } as never,
      {} as never,
      {} as never,
    );

    assert.deepEqual(await service.listEligibleTargets({ ...admin, id: 'author_1' }), []);
  });
});
