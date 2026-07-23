import { UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LibraryService } from '../src/modules/library/library.service';

const user = {
  id: 'reader_1',
  email: 'reader@example.com',
  role: UserRole.READER,
};

describe('LibraryService reading experience', () => {
  it('enriches bookshelf items with update and continue-reading state', async () => {
    const publishedAt = new Date('2026-07-15T08:00:00.000Z');
    const lastReadAt = new Date('2026-07-14T08:00:00.000Z');
    const countCalls: unknown[] = [];
    const service = new LibraryService({
      bookshelfItem: {
        findMany: async () => [
          {
            id: 'bookshelf_1',
            userId: user.id,
            novelId: 'novel_1',
            createdAt: new Date('2026-07-13T08:00:00.000Z'),
            novel: {
              id: 'novel_1',
              title: '测试作品',
              histories: [
                {
                  progress: 36,
                  readingSeconds: 120,
                  updatedAt: lastReadAt,
                  chapter: {
                    id: 'chapter_1',
                    title: '第一章',
                    orderIndex: 1,
                    wordCount: 1000,
                    publishedAt: new Date('2026-07-13T08:00:00.000Z'),
                  },
                },
              ],
            },
          },
        ],
      },
      chapter: {
        groupBy: async () => [
          {
            novelId: 'novel_1',
            _min: { orderIndex: 1 },
            _max: { orderIndex: 3 },
          },
        ],
        findMany: async () => [
          {
            id: 'chapter_1',
            novelId: 'novel_1',
            title: '第一章',
            orderIndex: 1,
            wordCount: 1000,
            publishedAt: new Date('2026-07-13T08:00:00.000Z'),
          },
          {
            id: 'chapter_3',
            novelId: 'novel_1',
            title: '第三章',
            orderIndex: 3,
            wordCount: 1200,
            publishedAt,
          },
        ],
        count: async (args: unknown) => {
          countCalls.push(args);
          return 2;
        },
      },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    } as never);

    const [item] = await service.getBookshelf(user);

    assert.equal(item.latestChapter?.id, 'chapter_3');
    assert.equal(item.continueChapter?.id, 'chapter_1');
    assert.equal(item.readingProgress, 36);
    assert.equal(item.readingSeconds, 120);
    assert.equal(item.unreadCount, 2);
    assert.equal(item.hasUpdate, true);
    assert.equal(item.lastUpdatedAt, publishedAt);
    assert.equal(item.lastReadAt, lastReadAt);
    assert.equal('histories' in item.novel, false);
    assert.deepEqual(countCalls, [
      {
        where: {
          novelId: 'novel_1',
          status: 'PUBLISHED',
          orderIndex: { gt: 1 },
        },
      },
    ]);
  });

  it('starts unread books at the first chapter without flagging old chapters as updates', async () => {
    const service = new LibraryService({
      bookshelfItem: {
        findMany: async () => [
          {
            id: 'bookshelf_1',
            userId: user.id,
            novelId: 'novel_1',
            createdAt: new Date(),
            novel: { id: 'novel_1', title: '测试作品', histories: [] },
          },
        ],
      },
      chapter: {
        groupBy: async () => [
          {
            novelId: 'novel_1',
            _min: { orderIndex: 1 },
            _max: { orderIndex: 2 },
          },
        ],
        findMany: async () => [
          {
            id: 'chapter_1',
            novelId: 'novel_1',
            title: '第一章',
            orderIndex: 1,
            wordCount: 1000,
            publishedAt: new Date(),
          },
          {
            id: 'chapter_2',
            novelId: 'novel_1',
            title: '第二章',
            orderIndex: 2,
            wordCount: 1000,
            publishedAt: new Date(),
          },
        ],
      },
    } as never);

    const [item] = await service.getBookshelf(user);

    assert.equal(item.continueChapter?.id, 'chapter_1');
    assert.equal(item.unreadCount, 0);
    assert.equal(item.hasUpdate, false);
    assert.equal(item.lastReadAt, null);
  });

  it('returns default reading preferences for a new account', async () => {
    const service = new LibraryService({
      readingPreference: {
        findUnique: async () => null,
      },
    } as never);

    const result = await service.getReadingPreference(user);

    assert.deepEqual(result, {
      userId: user.id,
      fontSize: 18,
      theme: 'LIGHT',
      lineHeight: 1.9,
      contentWidth: 760,
    });
  });

  it('upserts account reading preferences', async () => {
    let upsertArgs: unknown;
    const preference = {
      id: 'preference_1',
      userId: user.id,
      fontSize: 20,
      theme: 'DARK',
      lineHeight: 2.2,
      contentWidth: 880,
    };
    const service = new LibraryService({
      readingPreference: {
        upsert: async (args: unknown) => {
          upsertArgs = args;
          return preference;
        },
      },
    } as never);

    const result = await service.updateReadingPreference(user, {
      fontSize: 20,
      theme: 'DARK',
      lineHeight: 2.2,
      contentWidth: 880,
    });

    assert.equal(result, preference);
    assert.deepEqual(upsertArgs, {
      where: { userId: user.id },
      update: {
        fontSize: 20,
        theme: 'DARK',
        lineHeight: 2.2,
        contentWidth: 880,
      },
      create: {
        userId: user.id,
        fontSize: 20,
        theme: 'DARK',
        lineHeight: 2.2,
        contentWidth: 880,
      },
    });
  });

  it('adds a bookmark only for a public chapter', async () => {
    let upsertArgs: unknown;
    const service = new LibraryService({
      chapter: {
        findFirst: async () => ({ id: 'chapter_1' }),
      },
      chapterBookmark: {
        upsert: async (args: unknown) => {
          upsertArgs = args;
          return { id: 'bookmark_1', userId: user.id, chapterId: 'chapter_1' };
        },
      },
    } as never);

    const result = await service.addChapterBookmark(user, 'chapter_1');

    assert.equal(result.id, 'bookmark_1');
    assert.deepEqual(upsertArgs, {
      where: {
        userId_chapterId: {
          userId: user.id,
          chapterId: 'chapter_1',
        },
      },
      update: {},
      create: {
        userId: user.id,
        chapterId: 'chapter_1',
      },
    });
  });

  it('rejects bookmarks for unavailable chapters', async () => {
    const service = new LibraryService({
      chapter: {
        findFirst: async () => null,
      },
      chapterBookmark: {
        upsert: async () => assert.fail('bookmark must not be created'),
      },
    } as never);

    await assert.rejects(
      () => service.addChapterBookmark(user, 'missing_chapter'),
      /章节不存在或尚未发布/,
    );
  });

  it('increments reading time while updating the current position', async () => {
    let upsertArgs: unknown;
    const prisma = {
      chapter: {
        findFirst: async () => ({ id: 'chapter_1', novelId: 'novel_1' }),
      },
      readingHistory: {
        upsert: async (args: unknown) => {
          upsertArgs = args;
          return { readingSeconds: 42 };
        },
      },
      chapterRead: {
        upsert: async () => assert.fail('incomplete chapters must not be marked as read'),
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    };
    const service = new LibraryService(prisma as never);

    const result = await service.saveReadingSession(user, {
      novelId: 'novel_1',
      chapterId: 'chapter_1',
      progress: 28,
      seconds: 12,
    });

    assert.equal(result.readingSeconds, 42);
    assert.equal(result.isChapterCompleted, false);
    assert.deepEqual(upsertArgs, {
      where: {
        userId_novelId: {
          userId: user.id,
          novelId: 'novel_1',
        },
      },
      update: {
        chapterId: 'chapter_1',
        progress: 28,
        readingSeconds: { increment: 12 },
      },
      create: {
        userId: user.id,
        novelId: 'novel_1',
        chapterId: 'chapter_1',
        progress: 28,
        readingSeconds: 12,
      },
      include: {
        novel: { select: { id: true, title: true } },
        chapter: { select: { id: true, title: true, orderIndex: true } },
      },
    });
  });

  it('marks a chapter as read when saved at one hundred percent', async () => {
    let chapterReadArgs: unknown;
    const prisma = {
      chapter: {
        findFirst: async () => ({ id: 'chapter_1', novelId: 'novel_1' }),
      },
      readingHistory: {
        upsert: async () => ({ id: 'history_1', progress: 100 }),
      },
      chapterRead: {
        upsert: async (args: unknown) => {
          chapterReadArgs = args;
          return { id: 'read_1' };
        },
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    };
    const service = new LibraryService(prisma as never);

    const result = await service.saveReadingHistory(user, {
      novelId: 'novel_1',
      chapterId: 'chapter_1',
      progress: 100,
    });

    assert.equal(result.isChapterCompleted, true);
    assert.deepEqual(chapterReadArgs, {
      where: {
        userId_chapterId: {
          userId: user.id,
          chapterId: 'chapter_1',
        },
      },
      update: {},
      create: {
        userId: user.id,
        chapterId: 'chapter_1',
      },
    });
  });

  it('returns completed chapters and whether the reader has caught up', async () => {
    const completedAt = new Date('2026-07-15T10:00:00.000Z');
    const service = new LibraryService({
      novel: {
        findFirst: async () => ({ id: 'novel_1' }),
      },
      readingHistory: {
        findUnique: async () => ({ chapterId: 'chapter_2', progress: 100 }),
      },
      chapterRead: {
        findMany: async () => [
          { chapterId: 'chapter_1', completedAt: new Date('2026-07-14T10:00:00.000Z') },
          { chapterId: 'chapter_2', completedAt },
        ],
      },
      chapter: {
        count: async () => 2,
      },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    } as never);

    const result = await service.getNovelReadStatus(user, 'novel_1');

    assert.deepEqual(result, {
      currentChapterId: 'chapter_2',
      currentProgress: 100,
      completedChapterIds: ['chapter_1', 'chapter_2'],
      completedCount: 2,
      totalChapters: 2,
      isCaughtUp: true,
      lastCompletedAt: completedAt,
    });
  });

  it('removes one reading history without touching other reading data', async () => {
    let deleteArgs: unknown;
    const service = new LibraryService({
      readingHistory: {
        deleteMany: async (args: unknown) => {
          deleteArgs = args;
          return { count: 1 };
        },
      },
    } as never);

    const result = await service.removeReadingHistory(user, 'novel_1');

    assert.deepEqual(result, { deleted: true });
    assert.deepEqual(deleteArgs, { where: { userId: user.id, novelId: 'novel_1' } });
  });

  it('updates notification preferences only for a novel on the current bookshelf', async () => {
    let updateArgs: unknown;
    const service = new LibraryService({
      bookshelfItem: {
        updateMany: async (args: unknown) => {
          updateArgs = args;
          return { count: 1 };
        },
      },
    } as never);

    const result = await service.updateBookshelfNotification(user, 'novel_1', false);

    assert.deepEqual(result, { novelId: 'novel_1', notifyOnUpdate: false });
    assert.deepEqual(updateArgs, {
      where: { userId: user.id, novelId: 'novel_1' },
      data: { notifyOnUpdate: false },
    });
  });

  it('rejects notification changes for a novel outside the current bookshelf', async () => {
    const service = new LibraryService({
      bookshelfItem: { updateMany: async () => ({ count: 0 }) },
    } as never);

    await assert.rejects(
      () => service.updateBookshelfNotification(user, 'missing_novel', true),
      /作品不在书架中/,
    );
  });

  it('clears every reading history for the current account', async () => {
    const service = new LibraryService({
      readingHistory: {
        deleteMany: async () => ({ count: 3 }),
      },
    } as never);

    assert.deepEqual(await service.clearReadingHistories(user), { deletedCount: 3 });
  });
});
