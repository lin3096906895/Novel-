import { BadRequestException } from '@nestjs/common';
import { ChapterStatus, ChapterVersionSource, NovelStatus, UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthorService } from '../src/modules/author/author.service';

const author = {
  id: 'author_1',
  email: 'author@novel.local',
  role: UserRole.AUTHOR,
};

function createService(
  prismaOverrides: Record<string, unknown>,
  publicationOverrides: Record<string, unknown> = {},
  sensitiveWordsOverrides: Record<string, unknown> = { assertAllowed: async () => undefined },
) {
  return new AuthorService(
    prismaOverrides as never,
    publicationOverrides as never,
    sensitiveWordsOverrides as never,
  );
}

describe('AuthorService draft workflow', () => {
  it('creates a novel draft without requiring a review-ready summary', async () => {
    const calls: Record<string, unknown> = {};
    const service = createService({
      category: { findUnique: async () => ({ id: 'category_1' }) },
      novel: {
        create: async (args: unknown) => {
          calls.create = args;
          return { id: 'novel_1', status: NovelStatus.DRAFT };
        },
      },
    });

    const result = await service.createNovel(author, {
      title: '草稿作品',
      summary: '短简介',
      categoryId: 'category_1',
      action: 'save',
    });

    assert.equal(result.status, NovelStatus.DRAFT);
    assert.equal(
      (calls.create as { data: { status: NovelStatus } }).data.status,
      NovelStatus.DRAFT,
    );
    assert.deepEqual(
      (calls.create as { data: { volumes: { create: { title: string; orderIndex: number } } } })
        .data.volumes.create,
      { title: '正文', orderIndex: 1 },
    );
  });

  it('rejects submitting a novel with an incomplete summary', async () => {
    const service = createService({
      category: { findUnique: async () => ({ id: 'category_1' }) },
    });

    await assert.rejects(
      () =>
        service.createNovel(author, {
          title: '待审作品',
          summary: '太短',
          categoryId: 'category_1',
          action: 'submit',
        }),
      BadRequestException,
    );
  });

  it('creates a chapter draft with incomplete content', async () => {
    const calls: Record<string, unknown> = {};
    const service = createService({
      novel: {
        findUnique: async () => ({ id: 'novel_1', authorId: author.id, volumes: [] }),
      },
      chapter: {
        findFirst: async () => null,
        create: async (args: unknown) => {
          calls.create = args;
          return { id: 'chapter_1', status: ChapterStatus.DRAFT };
        },
      },
    });

    const result = await service.createChapter(author, 'novel_1', {
      title: '第一章',
      content: '未写完',
      action: 'save',
    });

    assert.equal(result.status, ChapterStatus.DRAFT);
    assert.equal(
      (calls.create as { data: { status: ChapterStatus; wordCount: number } }).data.status,
      ChapterStatus.DRAFT,
    );
    assert.equal(
      (calls.create as { data: { status: ChapterStatus; wordCount: number } }).data.wordCount,
      3,
    );
  });

  it('keeps an edited chapter as a draft during autosave', async () => {
    const calls: Record<string, unknown> = {};
    const transactionClient = {
      chapterVersion: {
        findFirst: async () => null,
        create: async (args: unknown) => {
          calls.version = args;
          return { id: 'version_1' };
        },
      },
      chapter: {
        update: async (args: unknown) => {
          calls.update = args;
          return { id: 'chapter_1', status: ChapterStatus.DRAFT };
        },
      },
    };
    const service = createService({
      chapter: {
        findUnique: async () => ({
          id: 'chapter_1',
          novelId: 'novel_1',
          volumeId: null,
          title: '第一章',
          content: '旧内容',
          wordCount: 3,
          scheduledAt: null,
          status: ChapterStatus.DRAFT,
          novel: { authorId: author.id },
        }),
      },
      $transaction: async (callback: (tx: typeof transactionClient) => unknown) =>
        callback(transactionClient),
    });

    const result = await service.updateChapter(author, 'chapter_1', {
      title: '第一章 新标题',
      content: '继续写',
      action: 'save',
      saveSource: 'autosave',
    });

    assert.equal(result.status, ChapterStatus.DRAFT);
    assert.equal(
      (calls.update as { data: { status: ChapterStatus } }).data.status,
      ChapterStatus.DRAFT,
    );
    assert.equal(
      (calls.version as { data: { source: ChapterVersionSource } }).data.source,
      ChapterVersionSource.AUTOSAVE,
    );
  });

  it('rejects submitting a chapter with incomplete content', async () => {
    const service = createService({
      chapter: {
        findUnique: async () => ({
          id: 'chapter_1',
          novelId: 'novel_1',
          status: ChapterStatus.DRAFT,
          novel: { authorId: author.id },
        }),
      },
    });

    await assert.rejects(
      () =>
        service.updateChapter(author, 'chapter_1', {
          title: '第一章',
          content: '太短',
          action: 'submit',
        }),
      BadRequestException,
    );
  });
});

describe('AuthorService volume management', () => {
  it('creates the next volume for an owned novel', async () => {
    let createArgs: unknown;
    const service = createService({
      novel: { findUnique: async () => ({ id: 'novel_1', authorId: author.id }) },
      novelVolume: {
        findFirst: async () => ({ orderIndex: 2 }),
        create: async (args: unknown) => {
          createArgs = args;
          return { id: 'volume_3', orderIndex: 3 };
        },
      },
    });

    const result = await service.createVolume(author, 'novel_1', {
      title: '第三卷',
      description: '新的旅程',
    });

    assert.equal(result.orderIndex, 3);
    assert.deepEqual(
      (createArgs as { data: { title: string; description: string; orderIndex: number } }).data,
      {
        novelId: 'novel_1',
        title: '第三卷',
        description: '新的旅程',
        orderIndex: 3,
      },
    );
  });

  it('rejects deleting a volume that still contains chapters', async () => {
    const service = createService({
      novelVolume: {
        findUnique: async () => ({
          id: 'volume_1',
          novel: { authorId: author.id },
          _count: { chapters: 2 },
        }),
      },
    });

    await assert.rejects(() => service.deleteVolume(author, 'volume_1'), BadRequestException);
  });

  it('assigns a chapter to a volume from the same novel', async () => {
    let updateArgs: unknown;
    const service = createService({
      chapter: {
        findUnique: async () => ({
          id: 'chapter_1',
          novelId: 'novel_1',
          novel: { authorId: author.id },
        }),
        update: async (args: unknown) => {
          updateArgs = args;
          return { id: 'chapter_1', volumeId: 'volume_2' };
        },
      },
      novelVolume: {
        findFirst: async () => ({ id: 'volume_2' }),
      },
    });

    const result = await service.assignChapterVolume(author, 'chapter_1', {
      volumeId: 'volume_2',
    });

    assert.equal(result.volumeId, 'volume_2');
    assert.deepEqual((updateArgs as { data: { volumeId: string } }).data, { volumeId: 'volume_2' });
  });

  it('reorders every volume in two phases', async () => {
    const updates: Array<{ where: { id: string }; data: { orderIndex: number } }> = [];
    const transactionClient = {
      novelVolume: {
        update: async (args: { where: { id: string }; data: { orderIndex: number } }) => {
          updates.push(args);
          return args;
        },
        findMany: async () => [
          { id: 'volume_2', orderIndex: 1 },
          { id: 'volume_1', orderIndex: 2 },
        ],
      },
    };
    const service = createService({
      novel: {
        findUnique: async () => ({
          id: 'novel_1',
          authorId: author.id,
          volumes: [{ id: 'volume_1' }, { id: 'volume_2' }],
        }),
      },
      $transaction: async (callback: (tx: typeof transactionClient) => unknown) =>
        callback(transactionClient),
    });

    const result = await service.reorderVolumes(author, 'novel_1', {
      volumeIds: ['volume_2', 'volume_1'],
    });

    assert.deepEqual(result, [
      { id: 'volume_2', orderIndex: 1 },
      { id: 'volume_1', orderIndex: 2 },
    ]);
    assert.deepEqual(
      updates.map((update) => [update.where.id, update.data.orderIndex]),
      [
        ['volume_2', -1],
        ['volume_1', -2],
        ['volume_2', 1],
        ['volume_1', 2],
      ],
    );
  });
});

describe('AuthorService chapter management', () => {
  it('deletes editable chapters and compacts the remaining order', async () => {
    const updates: Array<{ where: { id: string }; data: { orderIndex: number } }> = [];
    let findManyCall = 0;
    const transactionClient = {
      chapter: {
        updateMany: async (args: unknown) => {
          assert.equal(
            (args as { data: { deletedAt: unknown } }).data.deletedAt instanceof Date,
            true,
          );
          return { count: 2 };
        },
        findMany: async () => {
          findManyCall += 1;
          return findManyCall === 1 ? [{ id: 'chapter_3' }] : [{ id: 'chapter_3', orderIndex: 1 }];
        },
        update: async (args: { where: { id: string }; data: { orderIndex: number } }) => {
          updates.push(args);
          return args;
        },
      },
    };
    const service = createService({
      novel: { findUnique: async () => ({ id: 'novel_1', authorId: author.id }) },
      chapter: {
        findMany: async () => [
          { id: 'chapter_1', novelId: 'novel_1', status: ChapterStatus.DRAFT },
          { id: 'chapter_2', novelId: 'novel_1', status: ChapterStatus.REJECTED },
        ],
      },
      $transaction: async (callback: (tx: typeof transactionClient) => unknown) =>
        callback(transactionClient),
    });

    const result = await service.deleteChapters(author, 'novel_1', {
      chapterIds: ['chapter_1', 'chapter_2'],
    });

    assert.equal(result.deletedCount, 2);
    assert.deepEqual(result.chapters, [{ id: 'chapter_3', orderIndex: 1 }]);
    assert.deepEqual(
      updates.map((update) => update.data.orderIndex),
      [-1, 1],
    );
  });

  it('rejects deleting a chapter that is reviewing or published', async () => {
    const service = createService({
      novel: { findUnique: async () => ({ id: 'novel_1', authorId: author.id }) },
      chapter: {
        findMany: async () => [
          { id: 'chapter_1', novelId: 'novel_1', status: ChapterStatus.PUBLISHED },
        ],
      },
    });

    await assert.rejects(
      () => service.deleteChapters(author, 'novel_1', { chapterIds: ['chapter_1'] }),
      BadRequestException,
    );
  });

  it('reorders every editable chapter in a two-phase transaction', async () => {
    const updates: Array<{ where: { id: string }; data: { orderIndex: number } }> = [];
    const reordered = [
      { id: 'chapter_2', orderIndex: 1 },
      { id: 'chapter_1', orderIndex: 2 },
    ];
    const transactionClient = {
      chapter: {
        update: async (args: { where: { id: string }; data: { orderIndex: number } }) => {
          updates.push(args);
          return args;
        },
        findMany: async () => reordered,
      },
    };
    const service = createService({
      novel: {
        findUnique: async () => ({
          id: 'novel_1',
          authorId: author.id,
          chapters: [
            { id: 'chapter_1', status: ChapterStatus.DRAFT },
            { id: 'chapter_2', status: ChapterStatus.REJECTED },
          ],
        }),
      },
      $transaction: async (callback: (tx: typeof transactionClient) => unknown) =>
        callback(transactionClient),
    });

    const result = await service.reorderChapters(author, 'novel_1', {
      chapterIds: ['chapter_2', 'chapter_1'],
    });

    assert.deepEqual(result, reordered);
    assert.deepEqual(
      updates.map((update) => [update.where.id, update.data.orderIndex]),
      [
        ['chapter_2', -1],
        ['chapter_1', -2],
        ['chapter_2', 1],
        ['chapter_1', 2],
      ],
    );
  });
});

describe('AuthorService chapter scheduling', () => {
  it('stores a future publication time for a draft chapter', async () => {
    const scheduledAt = new Date(Date.now() + 60_000).toISOString();
    let updateArgs: unknown;
    const service = createService({
      chapter: {
        findUnique: async () => ({
          id: 'chapter_1',
          status: ChapterStatus.DRAFT,
          novel: { authorId: author.id },
        }),
        update: async (args: unknown) => {
          updateArgs = args;
          return { id: 'chapter_1', scheduledAt: new Date(scheduledAt) };
        },
      },
    });

    const result = await service.updateChapterSchedule(author, 'chapter_1', { scheduledAt });

    assert.equal(result.scheduledAt.toISOString(), scheduledAt);
    assert.equal(
      (updateArgs as { data: { scheduledAt: Date } }).data.scheduledAt.toISOString(),
      scheduledAt,
    );
  });

  it('publishes an approved scheduled chapter immediately when its schedule is cleared', async () => {
    let publicationArgs: unknown[] = [];
    const service = createService(
      {
        chapter: {
          findUnique: async () => ({
            id: 'chapter_1',
            status: ChapterStatus.SCHEDULED,
            novel: { authorId: author.id },
          }),
        },
      },
      {
        publishScheduledChapter: async (...args: unknown[]) => {
          publicationArgs = args;
          return { id: 'chapter_1', status: ChapterStatus.PUBLISHED };
        },
      },
    );

    const result = await service.updateChapterSchedule(author, 'chapter_1', {
      scheduledAt: null,
    });

    assert.equal(result.status, ChapterStatus.PUBLISHED);
    assert.equal(publicationArgs[0], 'chapter_1');
    assert.equal(publicationArgs[1] instanceof Date, true);
    assert.equal(publicationArgs[2], true);
  });
});

describe('AuthorService novel lifecycle', () => {
  it('deletes a draft novel and its dependent records in a transaction', async () => {
    const operations: string[] = [];
    const transactionClient = {
      readingHistory: { deleteMany: async () => operations.push('readingHistory') },
      bookshelfItem: { deleteMany: async () => operations.push('bookshelfItem') },
      comment: { deleteMany: async () => operations.push('comment') },
      recommendItem: { deleteMany: async () => operations.push('recommendItem') },
      reviewLog: { deleteMany: async () => operations.push('reviewLog') },
      chapter: { deleteMany: async () => operations.push('chapter') },
      novel: { delete: async () => operations.push('novel') },
    };
    const service = createService({
      novel: {
        findUnique: async () => ({
          id: 'novel_1',
          authorId: author.id,
          status: NovelStatus.DRAFT,
          chapters: [{ id: 'chapter_1' }],
        }),
      },
      $transaction: async (callback: (tx: typeof transactionClient) => unknown) =>
        callback(transactionClient),
    });

    const result = await service.deleteNovel(author, 'novel_1');

    assert.deepEqual(result, { deletedId: 'novel_1' });
    assert.deepEqual(operations, [
      'readingHistory',
      'bookshelfItem',
      'comment',
      'recommendItem',
      'reviewLog',
      'chapter',
      'novel',
    ]);
  });

  it('rejects deleting a serializing novel', async () => {
    const service = createService({
      novel: {
        findUnique: async () => ({
          id: 'novel_1',
          authorId: author.id,
          status: NovelStatus.SERIALIZING,
          chapters: [],
        }),
      },
    });

    await assert.rejects(() => service.deleteNovel(author, 'novel_1'), BadRequestException);
  });

  it('marks a serializing novel complete after every chapter is published', async () => {
    let updateArgs: unknown;
    const service = createService({
      novel: {
        findUnique: async () => ({
          id: 'novel_1',
          authorId: author.id,
          status: NovelStatus.SERIALIZING,
          chapters: [{ status: ChapterStatus.PUBLISHED }, { status: ChapterStatus.PUBLISHED }],
        }),
        update: async (args: unknown) => {
          updateArgs = args;
          return { id: 'novel_1', status: NovelStatus.COMPLETED };
        },
      },
    });

    const result = await service.updateNovelLifecycle(author, 'novel_1', {
      action: 'complete',
    });

    assert.equal(result.status, NovelStatus.COMPLETED);
    assert.equal(
      (updateArgs as { data: { status: NovelStatus } }).data.status,
      NovelStatus.COMPLETED,
    );
  });

  it('rejects completing a novel with unpublished chapters', async () => {
    const service = createService({
      novel: {
        findUnique: async () => ({
          id: 'novel_1',
          authorId: author.id,
          status: NovelStatus.SERIALIZING,
          chapters: [{ status: ChapterStatus.PUBLISHED }, { status: ChapterStatus.DRAFT }],
        }),
      },
    });

    await assert.rejects(
      () => service.updateNovelLifecycle(author, 'novel_1', { action: 'complete' }),
      BadRequestException,
    );
  });

  it('restores a completed novel to serializing', async () => {
    const service = createService({
      novel: {
        findUnique: async () => ({
          id: 'novel_1',
          authorId: author.id,
          status: NovelStatus.COMPLETED,
          chapters: [{ status: ChapterStatus.PUBLISHED }],
        }),
        update: async () => ({ id: 'novel_1', status: NovelStatus.SERIALIZING }),
      },
    });

    const result = await service.updateNovelLifecycle(author, 'novel_1', { action: 'resume' });

    assert.equal(result.status, NovelStatus.SERIALIZING);
  });
});

describe('AuthorService dashboard', () => {
  it('aggregates overview, novel performance, and daily trends', async () => {
    const now = new Date();
    const service = createService({
      novel: {
        findMany: async () => [
          {
            id: 'novel_1',
            title: '统计作品',
            status: NovelStatus.SERIALIZING,
            updatedAt: now,
            chapters: [
              { status: ChapterStatus.PUBLISHED, wordCount: 120 },
              { status: ChapterStatus.DRAFT, wordCount: 30 },
            ],
            _count: { chapters: 2, bookshelf: 3, comments: 2 },
          },
        ],
      },
      bookshelfItem: {
        findMany: async () => [{ createdAt: now }, { createdAt: now }],
      },
      comment: {
        findMany: async () => [{ createdAt: now }],
      },
      chapter: {
        findMany: async () => [{ publishedAt: now, wordCount: 120 }],
      },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    });

    const result = await service.getDashboard(author, { days: 7 });

    assert.equal(result.periodDays, 7);
    assert.deepEqual(result.overview, {
      novels: 1,
      chapters: 2,
      publishedChapters: 1,
      publishedWords: 120,
      bookshelf: 3,
      comments: 2,
    });
    assert.equal(result.trend.length, 7);
    assert.deepEqual(result.trend[6], {
      date: now.toISOString().slice(0, 10),
      bookshelfAdds: 2,
      comments: 1,
      publishedChapters: 1,
      publishedWords: 120,
    });
    assert.deepEqual(result.novels[0], {
      id: 'novel_1',
      title: '统计作品',
      status: NovelStatus.SERIALIZING,
      chapters: 2,
      publishedChapters: 1,
      publishedWords: 120,
      bookshelf: 3,
      comments: 2,
      updatedAt: now,
    });
  });
});
