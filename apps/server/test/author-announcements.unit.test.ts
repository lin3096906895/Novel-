import { BadRequestException } from '@nestjs/common';
import { NovelStatus, UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthorAnnouncementsService } from '../src/modules/author/author-announcements.service';

const author = {
  id: 'author_1',
  email: 'author@novel.local',
  role: UserRole.AUTHOR,
};

function createService(
  prismaOverrides: Record<string, unknown>,
  notificationOverrides: Record<string, unknown> = {},
) {
  return new AuthorAnnouncementsService(
    prismaOverrides as never,
    notificationOverrides as never,
  );
}

describe('AuthorAnnouncementsService', () => {
  it('saves an announcement draft without notifying followers', async () => {
    let createArgs: unknown;
    let notificationCalls = 0;
    const transactionClient = {
      novelAnnouncement: {
        create: async (args: unknown) => {
          createArgs = args;
          return { id: 'announcement_1', publishedAt: null };
        },
      },
    };
    const service = createService(
      {
        novel: {
          findUnique: async () => ({
            id: 'novel_1',
            title: '测试作品',
            authorId: author.id,
            status: NovelStatus.DRAFT,
          }),
        },
        $transaction: async (callback: (tx: unknown) => unknown) => callback(transactionClient),
      },
      {
        createMany: async () => {
          notificationCalls += 1;
        },
      },
    );

    const result = await service.create(author, 'novel_1', {
      title: '更新安排',
      content: '这是一条暂未公开的公告。',
      isPinned: true,
      action: 'save',
    });

    assert.equal(result.publishedAt, null);
    assert.equal(notificationCalls, 0);
    assert.deepEqual(
      (createArgs as { data: { title: string; content: string; isPinned: boolean } }).data,
      {
        novelId: 'novel_1',
        title: '更新安排',
        content: '这是一条暂未公开的公告。',
        isPinned: true,
        publishedAt: null,
      },
    );
  });

  it('publishes an announcement and notifies subscribed followers', async () => {
    let notifications: Array<{ userId: string; title: string; link?: string }> = [];
    const transactionClient = {
      novelAnnouncement: {
        create: async (args: { data: { title: string; content: string } }) => ({
          id: 'announcement_1',
          ...args.data,
          publishedAt: new Date(),
        }),
      },
      bookshelfItem: {
        findMany: async () => [{ userId: 'reader_1' }, { userId: 'reader_2' }],
      },
    };
    const service = createService(
      {
        novel: {
          findUnique: async () => ({
            id: 'novel_1',
            title: '测试作品',
            authorId: author.id,
            status: NovelStatus.SERIALIZING,
          }),
        },
        $transaction: async (callback: (tx: unknown) => unknown) => callback(transactionClient),
      },
      {
        createMany: async (items: typeof notifications) => {
          notifications = items;
          return { count: items.length };
        },
      },
    );

    const result = await service.create(author, 'novel_1', {
      title: '本周更新安排',
      content: '周三和周六各更新一章。',
      action: 'publish',
    });

    assert.ok(result.publishedAt);
    assert.equal(notifications.length, 2);
    assert.equal(notifications[0].userId, 'reader_1');
    assert.equal(notifications[0].title, '《测试作品》发布了公告');
    assert.equal(notifications[0].link, '/novels/novel_1');
  });

  it('rejects publishing an announcement before the novel is public', async () => {
    const service = createService({
      novel: {
        findUnique: async () => ({
          id: 'novel_1',
          title: '待审作品',
          authorId: author.id,
          status: NovelStatus.REVIEWING,
        }),
      },
    });

    await assert.rejects(
      () =>
        service.create(author, 'novel_1', {
          title: '提前公告',
          content: '作品上架后再发布。',
          action: 'publish',
        }),
      BadRequestException,
    );
  });

  it('does not notify again when editing an already published announcement', async () => {
    let notificationCalls = 0;
    const publishedAt = new Date('2026-07-18T06:00:00.000Z');
    const transactionClient = {
      novelAnnouncement: {
        update: async (args: { data: { publishedAt: Date } }) => ({
          id: 'announcement_1',
          ...args.data,
        }),
      },
    };
    const service = createService(
      {
        novelAnnouncement: {
          findUnique: async () => ({
            id: 'announcement_1',
            publishedAt,
            novel: {
              id: 'novel_1',
              title: '测试作品',
              authorId: author.id,
              status: NovelStatus.SERIALIZING,
            },
          }),
        },
        $transaction: async (callback: (tx: unknown) => unknown) => callback(transactionClient),
      },
      {
        createMany: async () => {
          notificationCalls += 1;
        },
      },
    );

    const result = await service.update(author, 'announcement_1', {
      title: '修订后的安排',
      content: '更新时间调整到周日。',
      isPinned: true,
      action: 'publish',
    });

    assert.equal(result.publishedAt, publishedAt);
    assert.equal(notificationCalls, 0);
  });
});
