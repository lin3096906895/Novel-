import { ForbiddenException } from '@nestjs/common';
import { AuthorCalendarEventType, ChapterStatus, UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthorCalendarService } from '../src/modules/author/author-calendar.service';

const author = {
  id: 'author_1',
  email: 'author@novel.local',
  role: UserRole.AUTHOR,
};

function createService(prismaOverrides: Record<string, unknown>) {
  return new AuthorCalendarService(prismaOverrides as never);
}

describe('AuthorCalendarService', () => {
  it('combines plans with scheduled and published chapter events', async () => {
    const service = createService({
      authorCalendarEvent: {
        findMany: async () => [
          {
            id: 'plan_1',
            title: '完成第二章初稿',
            note: '至少三千字',
            type: AuthorCalendarEventType.WRITING,
            eventAt: new Date('2026-07-10T02:00:00.000Z'),
            isCompleted: true,
            novel: { id: 'novel_1', title: '测试作品' },
          },
        ],
      },
      chapter: {
        findMany: async () => [
          {
            id: 'chapter_1',
            title: '第一章',
            status: ChapterStatus.PUBLISHED,
            scheduledAt: new Date('2026-07-12T02:00:00.000Z'),
            publishedAt: new Date('2026-07-12T02:00:05.000Z'),
            novel: { id: 'novel_1', title: '测试作品' },
          },
        ],
      },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    });

    const result = await service.getMonth(author, { month: '2026-07' });

    assert.equal(result.events.length, 3);
    assert.deepEqual(
      result.events.map((event) => event.source),
      ['PLAN', 'CHAPTER_SCHEDULED', 'CHAPTER_PUBLISHED'],
    );
    assert.deepEqual(result.summary, {
      plans: 1,
      completedPlans: 1,
      scheduledChapters: 1,
      publishedChapters: 1,
    });
  });

  it('creates a plan for an owned novel', async () => {
    let createArgs: unknown;
    const service = createService({
      novel: {
        findUnique: async () => ({ id: 'novel_1', authorId: author.id }),
      },
      authorCalendarEvent: {
        create: async (args: unknown) => {
          createArgs = args;
          return { id: 'plan_1', title: '修订第一章' };
        },
      },
    });

    const result = await service.create(author, 'novel_1', {
      title: '修订第一章',
      note: '检查人物称谓',
      eventAt: '2026-07-20T02:00:00.000Z',
      type: AuthorCalendarEventType.REVISION,
    });

    assert.equal(result.id, 'plan_1');
    assert.deepEqual(
      (createArgs as { data: { novelId: string; title: string; note: string; type: string } }).data,
      {
        novelId: 'novel_1',
        title: '修订第一章',
        note: '检查人物称谓',
        eventAt: new Date('2026-07-20T02:00:00.000Z'),
        type: AuthorCalendarEventType.REVISION,
      },
    );
  });

  it('rejects updating another author plan', async () => {
    const service = createService({
      authorCalendarEvent: {
        findUnique: async () => ({
          id: 'plan_1',
          novel: { authorId: 'author_2' },
        }),
      },
    });

    await assert.rejects(
      () => service.update(author, 'plan_1', { isCompleted: true }),
      ForbiddenException,
    );
  });
});
