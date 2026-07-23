import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AdminAuditService } from '../src/modules/admin-audit/admin-audit.service';

describe('AdminAuditService', () => {
  it('lists audit logs with filters and pagination', async () => {
    const calls: Record<string, unknown> = {};
    const prisma = {
      adminAuditLog: {
        findMany: async (args: unknown) => {
          calls.findMany = args;
          return [{ id: 'audit_1', action: 'novel.status.update' }];
        },
        count: async (args: unknown) => {
          calls.count = args;
          return 21;
        },
      },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    };
    const service = new AdminAuditService(prisma as never);

    const result = await service.list({
      keyword: '管理员',
      actorId: 'admin_1',
      action: 'novel.status.update',
      targetType: 'novel',
      page: 2,
      pageSize: 10,
    });

    const where = {
      actorId: 'admin_1',
      action: 'novel.status.update',
      targetType: 'novel',
      OR: [
        { summary: { contains: '管理员', mode: 'insensitive' } },
        { targetId: { contains: '管理员', mode: 'insensitive' } },
        { actor: { nickname: { contains: '管理员', mode: 'insensitive' } } },
        { actor: { email: { contains: '管理员', mode: 'insensitive' } } },
      ],
    };

    assert.deepEqual(result.items, [{ id: 'audit_1', action: 'novel.status.update' }]);
    assert.deepEqual(result.pagination, {
      page: 2,
      pageSize: 10,
      total: 21,
      totalPages: 3,
    });
    assert.deepEqual(calls.findMany, {
      where,
      skip: 10,
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { id: true, nickname: true, email: true, role: true } },
      },
    });
    assert.deepEqual(calls.count, { where });
  });

  it('writes through the provided transaction client', async () => {
    const calls: Record<string, unknown> = {};
    const tx = {
      adminAuditLog: {
        create: async (args: unknown) => {
          calls.create = args;
          return { id: 'audit_1' };
        },
      },
    };
    const service = new AdminAuditService({} as never);

    await service.record(
      {
        actorId: 'admin_1',
        action: 'comment.delete',
        targetType: 'comment',
        targetId: 'comment_1',
        summary: '删除评论',
        before: { content: '测试评论' },
      },
      tx as never,
    );

    assert.deepEqual(calls.create, {
      data: {
        actorId: 'admin_1',
        action: 'comment.delete',
        targetType: 'comment',
        targetId: 'comment_1',
        summary: '删除评论',
        before: { content: '测试评论' },
      },
    });
  });
});
