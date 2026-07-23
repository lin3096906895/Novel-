import { BadRequestException } from '@nestjs/common';
import {
  ChapterStatus,
  ContentReportTargetType,
  NovelStatus,
  ParagraphReportReason,
  ParagraphReportStatus,
  UserRole,
} from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ContentReportsService } from '../src/modules/moderation/content-reports.service';

const reader = { id: 'reader_1', email: 'reader@example.com', role: UserRole.READER };
const admin = { id: 'admin_1', email: 'admin@example.com', role: UserRole.ADMIN };

describe('ContentReportsService', () => {
  it('creates a pending novel report with a stable target snapshot', async () => {
    let upsertArgs: unknown;
    const service = new ContentReportsService(
      {
        novel: {
          findFirst: async () => ({
            id: 'novel_1',
            title: '星海公约',
            summary: '测试简介',
            status: NovelStatus.SERIALIZING,
            authorId: 'author_1',
            author: { id: 'author_1', nickname: '作者' },
            category: { name: '科幻' },
            tags: [{ name: '太空' }],
          }),
        },
        contentReport: {
          upsert: async (args: unknown) => {
            upsertArgs = args;
            return { id: 'report_1', status: ParagraphReportStatus.PENDING };
          },
        },
      } as never,
      {} as never,
    );

    await service.create(reader, ContentReportTargetType.NOVEL, 'novel_1', {
      reason: ParagraphReportReason.OTHER,
      detail: ' 内容存在问题 ',
    });

    const args = upsertArgs as {
      create: { targetTitle: string; targetSnapshot: { category: string }; detail: string };
      update: { status: ParagraphReportStatus };
    };
    assert.equal(args.create.targetTitle, '星海公约');
    assert.equal(args.create.targetSnapshot.category, '科幻');
    assert.equal(args.create.detail, '内容存在问题');
    assert.equal(args.update.status, ParagraphReportStatus.PENDING);
  });

  it('prevents reporting content owned by the current user', async () => {
    const service = new ContentReportsService(
      {
        novel: {
          findFirst: async () => ({
            id: 'novel_1',
            title: '自己的作品',
            summary: '简介',
            status: NovelStatus.SERIALIZING,
            authorId: reader.id,
            author: { id: reader.id, nickname: '读者作者' },
            category: { name: '科幻' },
            tags: [],
          }),
        },
      } as never,
      {} as never,
    );

    await assert.rejects(
      () =>
        service.create(reader, ContentReportTargetType.NOVEL, 'novel_1', {
          reason: ParagraphReportReason.OTHER,
        }),
      BadRequestException,
    );
  });

  it('takes down a published chapter, rolls back word count, and resolves related reports', async () => {
    let chapterUpdate: unknown;
    let novelUpdate: unknown;
    let reportsUpdate: unknown;
    let auditEntry: unknown;
    const report = {
      id: 'report_1',
      targetType: ContentReportTargetType.CHAPTER,
      targetId: 'chapter_1',
      targetTitle: '测试作品 / 第一章',
      status: ParagraphReportStatus.PENDING,
    };
    const prisma = {
      contentReport: {
        findUnique: async () => report,
        updateMany: async (args: unknown) => (reportsUpdate = args),
        findUniqueOrThrow: async () => ({ ...report, status: ParagraphReportStatus.RESOLVED }),
      },
      chapter: {
        findUnique: async () => ({
          id: 'chapter_1',
          novelId: 'novel_1',
          title: '第一章',
          content: '正文',
          status: ChapterStatus.PUBLISHED,
          wordCount: 1200,
          scheduledAt: null,
          publishedAt: new Date(),
          novel: { id: 'novel_1', wordCount: 5000 },
        }),
        update: async (args: unknown) => {
          chapterUpdate = args;
          return { id: 'chapter_1', status: ChapterStatus.REJECTED };
        },
      },
      novel: {
        update: async (args: unknown) => {
          novelUpdate = args;
          return { id: 'novel_1' };
        },
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    };
    const service = new ContentReportsService(
      prisma as never,
      { record: async (entry: unknown) => (auditEntry = entry) } as never,
    );

    const result = await service.review(admin, report.id, {
      action: 'restrict',
      note: '违反内容规范',
    });

    assert.equal(result.status, ParagraphReportStatus.RESOLVED);
    assert.equal(
      (chapterUpdate as { data: { status: ChapterStatus } }).data.status,
      ChapterStatus.REJECTED,
    );
    assert.equal((novelUpdate as { data: { wordCount: number } }).data.wordCount, 3800);
    assert.equal(
      (reportsUpdate as { data: { status: ParagraphReportStatus } }).data.status,
      ParagraphReportStatus.RESOLVED,
    );
    assert.equal((auditEntry as { action: string }).action, 'content_report.restrict');
  });
});
