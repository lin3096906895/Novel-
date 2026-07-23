import { BadRequestException } from '@nestjs/common';
import { ChapterStatus, NovelStatus, UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AdminReviewsService } from '../src/modules/admin/admin-reviews.service';

const reviewer = {
  id: 'admin_1',
  email: 'admin@example.com',
  role: UserRole.ADMIN,
};

function reviewingChapter() {
  return {
    id: 'chapter_2',
    title: '第二章',
    novelId: 'novel_1',
    status: ChapterStatus.REVIEWING,
    wordCount: 1200,
    scheduledAt: null,
    novel: {
      title: '测试作品',
      status: NovelStatus.SERIALIZING,
      authorId: 'author_1',
    },
  };
}

describe('AdminReviewsService chapter updates', () => {
  it('paginates and searches the pending novel queue', async () => {
    let findManyArgs: unknown;
    let countArgs: unknown;
    const service = new AdminReviewsService(
      {
        novel: {
          findMany: async (args: unknown) => {
            findManyArgs = args;
            return [{ id: 'novel_1' }];
          },
          count: async (args: unknown) => {
            countArgs = args;
            return 3;
          },
        },
        $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.listQueue({
      targetType: 'novel',
      page: 2,
      pageSize: 1,
      keyword: ' 星河 ',
    });

    assert.deepEqual(result.pagination, { page: 2, pageSize: 1, total: 3, totalPages: 3 });
    assert.equal(result.items.length, 1);
    assert.equal((findManyArgs as { skip: number }).skip, 1);
    assert.equal((findManyArgs as { take: number }).take, 1);
    assert.deepEqual(
      (findManyArgs as { where: unknown }).where,
      (countArgs as { where: unknown }).where,
    );
    assert.equal(
      ((findManyArgs as { where: { OR: unknown[] } }).where.OR ?? []).length,
      6,
    );
  });

  it('reviews a batch independently and reports recoverable failures', async () => {
    const service = new AdminReviewsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const reviewedIds: string[] = [];
    Object.defineProperty(service, 'reviewNovel', {
      value: async (_reviewer: unknown, id: string) => {
        reviewedIds.push(id);
        if (id === 'novel_missing') {
          throw new BadRequestException('Only reviewing novels can be reviewed');
        }
        return { id };
      },
    });

    const result = await service.batchReview(reviewer, {
      targetType: 'novel',
      ids: ['novel_1', 'novel_missing', 'novel_2'],
      action: 'approve',
    });

    assert.deepEqual(reviewedIds, ['novel_1', 'novel_missing', 'novel_2']);
    assert.deepEqual(result, {
      total: 3,
      succeeded: 2,
      failed: 1,
      items: [
        { id: 'novel_1', success: true },
        {
          id: 'novel_missing',
          success: false,
          error: 'Only reviewing novels can be reviewed',
        },
        { id: 'novel_2', success: true },
      ],
    });
  });

  it('notifies bookshelf followers after a chapter transitions to published', async () => {
    const calls: Record<string, unknown> = {};
    const chapter = reviewingChapter();
    const updated = {
      ...chapter,
      status: ChapterStatus.PUBLISHED,
      novel: {
        id: 'novel_1',
        title: '测试作品',
        status: NovelStatus.SERIALIZING,
        author: { id: 'author_1', nickname: '作者', email: 'author@example.com' },
      },
    };
    const prisma = {
      chapter: {
        findUnique: async (args: { include?: unknown }) => (args.include ? updated : chapter),
        updateMany: async (args: unknown) => {
          calls.transition = args;
          return { count: 1 };
        },
      },
      novel: { update: async () => ({}) },
      reviewLog: { create: async () => ({}) },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    };
    const notifications = {
      create: async (data: unknown) => {
        calls.authorNotification = data;
      },
    };
    const service = new AdminReviewsService(
      prisma as never,
      { record: async () => undefined } as never,
      notifications as never,
      {
        notifyFollowers: async (data: unknown) => {
          calls.publicationNotification = data;
          return { count: 2 };
        },
      } as never,
    );

    const result = await service.reviewChapter(reviewer, chapter.id, { action: 'approve' });

    assert.equal(result.status, ChapterStatus.PUBLISHED);
    assert.deepEqual(calls.publicationNotification, {
      id: 'chapter_2',
      title: '第二章',
      novelId: 'novel_1',
      novelTitle: '测试作品',
      authorId: 'author_1',
    });
    const transition = calls.transition as {
      where: { id: string; status: ChapterStatus };
      data: { status: ChapterStatus; publishedAt: Date };
    };
    assert.deepEqual(transition.where, {
      id: chapter.id,
      status: ChapterStatus.REVIEWING,
    });
    assert.equal(transition.data.status, ChapterStatus.PUBLISHED);
    assert.equal(transition.data.publishedAt instanceof Date, true);
  });

  it('does not send notifications when another review already changed the chapter', async () => {
    const chapter = reviewingChapter();
    const prisma = {
      chapter: {
        findUnique: async () => chapter,
        updateMany: async () => ({ count: 0 }),
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    };
    const service = new AdminReviewsService(
      prisma as never,
      { record: async () => assert.fail('audit must not be written') } as never,
      {
        create: async () => assert.fail('author notification must not be sent'),
        createMany: async () => assert.fail('update notifications must not be sent'),
      } as never,
      { notifyFollowers: async () => assert.fail('followers must not be notified') } as never,
    );

    await assert.rejects(
      () => service.reviewChapter(reviewer, chapter.id, { action: 'approve' }),
      BadRequestException,
    );
  });

  it('keeps a future approved chapter scheduled without notifying followers', async () => {
    const scheduledAt = new Date(Date.now() + 60_000);
    const chapter = { ...reviewingChapter(), scheduledAt };
    let transitionArgs: unknown;
    let authorNotification: unknown;
    const updated = {
      ...chapter,
      status: ChapterStatus.SCHEDULED,
      novel: {
        id: 'novel_1',
        title: '测试作品',
        status: NovelStatus.SERIALIZING,
        author: { id: 'author_1', nickname: '作者', email: 'author@example.com' },
      },
    };
    const prisma = {
      chapter: {
        findUnique: async (args: { include?: unknown }) => (args.include ? updated : chapter),
        updateMany: async (args: unknown) => {
          transitionArgs = args;
          return { count: 1 };
        },
      },
      novel: { update: async () => assert.fail('word count must wait for publication') },
      reviewLog: { create: async () => ({}) },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    };
    const service = new AdminReviewsService(
      prisma as never,
      { record: async () => undefined } as never,
      {
        create: async (data: unknown) => {
          authorNotification = data;
        },
      } as never,
      { notifyFollowers: async () => assert.fail('followers must wait for publication') } as never,
    );

    const result = await service.reviewChapter(reviewer, chapter.id, { action: 'approve' });

    assert.equal(result.status, ChapterStatus.SCHEDULED);
    const transition = transitionArgs as {
      data: { status: ChapterStatus; scheduledAt: Date; publishedAt: Date | null };
    };
    assert.equal(transition.data.status, ChapterStatus.SCHEDULED);
    assert.equal(transition.data.scheduledAt, scheduledAt);
    assert.equal(transition.data.publishedAt, null);
    assert.match(
      (authorNotification as { content: string }).content,
      /已通过审核，将于.*自动发布/,
    );
  });
});
