import { ChapterStatus, NotificationType } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ChapterPublicationService } from '../src/modules/publication/chapter-publication.service';

describe('ChapterPublicationService', () => {
  it('publishes a due chapter, updates word count, and notifies the author and followers', async () => {
    const calls: Record<string, unknown> = {};
    let findUniqueCall = 0;
    const chapter = {
      id: 'chapter_1',
      title: '定时章节',
      novelId: 'novel_1',
      status: ChapterStatus.SCHEDULED,
      wordCount: 680,
      scheduledAt: new Date('2026-07-18T02:00:00.000Z'),
      novel: { title: '测试作品', authorId: 'author_1' },
    };
    const tx = {
      chapter: {
        findUnique: async () => {
          findUniqueCall += 1;
          return findUniqueCall === 1
            ? chapter
            : { id: chapter.id, status: ChapterStatus.PUBLISHED };
        },
        updateMany: async (args: unknown) => {
          calls.transition = args;
          return { count: 1 };
        },
      },
      novel: {
        update: async (args: unknown) => {
          calls.novelUpdate = args;
          return {};
        },
      },
      bookshelfItem: {
        findMany: async () => [{ userId: 'reader_1' }],
      },
    };
    const notifications = {
      create: async (data: unknown) => {
        calls.authorNotification = data;
        return {};
      },
      createMany: async (data: unknown) => {
        calls.followerNotifications = data;
        return { count: 1 };
      },
    };
    const prisma = {
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    };
    const service = new ChapterPublicationService(prisma as never, notifications as never);
    const publishedAt = new Date('2026-07-18T02:00:05.000Z');

    const result = await service.publishScheduledChapter(chapter.id, publishedAt);

    assert.equal(result?.status, ChapterStatus.PUBLISHED);
    assert.deepEqual(calls.novelUpdate, {
      where: { id: 'novel_1' },
      data: { wordCount: { increment: 680 } },
    });
    assert.deepEqual(calls.authorNotification, {
      userId: 'author_1',
      type: NotificationType.SYSTEM,
      title: '定时章节已发布',
      content: '《测试作品》的章节“定时章节”已按计划发布。',
      link: '/author',
    });
    assert.deepEqual(calls.followerNotifications, [
      {
        userId: 'reader_1',
        type: NotificationType.UPDATE,
        title: '《测试作品》更新了',
        content: '新章节“定时章节”已发布，继续阅读吧。',
        link: '/chapters/chapter_1',
      },
    ]);
  });
});
