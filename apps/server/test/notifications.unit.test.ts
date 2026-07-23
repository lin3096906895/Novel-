import { NotificationType, UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NotificationsService } from '../src/modules/notifications/notifications.service';

const user = {
  id: 'user_1',
  email: 'user@example.com',
  role: UserRole.READER,
};

describe('NotificationsService', () => {
  it('lists notifications with unread count and pagination', async () => {
    const now = new Date();
    const calls: unknown[] = [];
    const service = new NotificationsService({
      notification: {
        findMany: async (args: unknown) => {
          calls.push(args);
          return [
            {
              id: 'notification_1',
              userId: user.id,
              type: NotificationType.UPDATE,
              title: '测试通知',
              content: '通知内容',
              link: null,
              isRead: false,
              createdAt: now,
            },
          ];
        },
        count: async (args: { where: { isRead?: boolean; type?: NotificationType } }) => {
          calls.push(args);
          return args.where.isRead === false ? 1 : 3;
        },
      },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    } as never);

    const result = await service.list(user, {
      page: 1,
      pageSize: 10,
      type: NotificationType.UPDATE,
    });

    assert.equal(result.items.length, 1);
    assert.equal(result.unreadCount, 1);
    assert.deepEqual(result.pagination, {
      page: 1,
      pageSize: 10,
      total: 3,
      totalPages: 1,
    });
    assert.deepEqual(calls, [
      {
        where: { userId: user.id, type: NotificationType.UPDATE },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
      },
      { where: { userId: user.id, type: NotificationType.UPDATE } },
      { where: { userId: user.id, isRead: false } },
    ]);
  });

  it('marks all unread notifications as read', async () => {
    let updateArgs: unknown;
    const service = new NotificationsService({
      notification: {
        updateMany: async (args: unknown) => {
          updateArgs = args;
          return { count: 2 };
        },
      },
    } as never);

    const result = await service.markAllRead(user);

    assert.deepEqual(result, { updatedCount: 2 });
    assert.deepEqual(updateArgs, {
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    });
  });
});
