import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NovelStatus, UserRole, UserStatus } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AdminManagementService } from '../src/modules/admin/admin-management.service';

function createService(
  prismaOverrides: Record<string, unknown>,
  auditOverrides: Record<string, unknown> = { record: async () => undefined },
) {
  return new AdminManagementService(prismaOverrides as never, auditOverrides as never);
}

describe('AdminManagementService', () => {
  it('lists novels with keyword, status, popularity sorting, and pagination', async () => {
    const calls: Record<string, unknown> = {};
    const prisma = {
      novel: {
        findMany: async (args: unknown) => {
          calls.findMany = args;
          return [{ id: 'novel_1', title: '测试作品' }];
        },
        count: async (args: unknown) => {
          calls.count = args;
          return 7;
        },
      },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    };
    const service = createService(prisma);

    const result = await service.listNovels({
      keyword: '星河',
      status: 'SERIALIZING',
      sort: 'popular',
      page: 2,
      pageSize: 3,
    });

    assert.equal(result.pagination.page, 2);
    assert.equal(result.pagination.pageSize, 3);
    assert.equal(result.pagination.total, 7);
    assert.equal(result.pagination.totalPages, 3);
    assert.deepEqual(result.items, [{ id: 'novel_1', title: '测试作品' }]);
    assert.deepEqual(calls.findMany, {
      where: {
        status: 'SERIALIZING',
        OR: [
          { title: { contains: '星河', mode: 'insensitive' } },
          { summary: { contains: '星河', mode: 'insensitive' } },
          { author: { nickname: { contains: '星河', mode: 'insensitive' } } },
          { author: { email: { contains: '星河', mode: 'insensitive' } } },
        ],
      },
      skip: 3,
      take: 3,
      orderBy: [{ bookshelf: { _count: 'desc' } }, { comments: { _count: 'desc' } }],
      include: {
        author: { select: { id: true, nickname: true, email: true, role: true } },
        category: true,
        tags: true,
        _count: {
          select: {
            bookshelf: true,
            chapters: { where: { deletedAt: null } },
            comments: true,
          },
        },
      },
    });
    assert.deepEqual(calls.count, {
      where: {
        status: 'SERIALIZING',
        OR: [
          { title: { contains: '星河', mode: 'insensitive' } },
          { summary: { contains: '星河', mode: 'insensitive' } },
          { author: { nickname: { contains: '星河', mode: 'insensitive' } } },
          { author: { email: { contains: '星河', mode: 'insensitive' } } },
        ],
      },
    });
  });

  it('returns novel detail with review logs', async () => {
    const prisma = {
      novel: {
        findUnique: async () => ({
          id: 'novel_1',
          title: '测试作品',
          chapters: [],
          comments: [],
          _count: { bookshelf: 1, chapters: 0, comments: 0, histories: 2 },
        }),
      },
      reviewLog: {
        findMany: async () => [{ id: 'log_1', action: 'approve' }],
      },
    };
    const service = createService(prisma);

    const result = await service.getNovel('novel_1');

    assert.equal(result.id, 'novel_1');
    assert.deepEqual(result.reviewLogs, [{ id: 'log_1', action: 'approve' }]);
  });

  it('throws when novel detail does not exist', async () => {
    const service = createService({
      novel: { findUnique: async () => null },
    });

    await assert.rejects(() => service.getNovel('missing'), NotFoundException);
  });

  it('prevents an admin from removing their own admin role', async () => {
    const service = createService({
      user: {
        findUnique: async () => ({ id: 'admin_1', nickname: '管理员', role: UserRole.ADMIN }),
      },
    });

    await assert.rejects(
      () =>
        service.updateUserRole(
          { id: 'admin_1', email: 'admin@novel.local', role: UserRole.ADMIN },
          'admin_1',
          { role: UserRole.READER },
        ),
      BadRequestException,
    );
  });

  it('updates novel status after checking existence', async () => {
    const calls: Record<string, unknown> = {};
    const prisma = {
      novel: {
        findUnique: async (args: unknown) => {
          calls.findUnique = args;
          return { id: 'novel_1', title: '测试作品', status: NovelStatus.SERIALIZING };
        },
        update: async (args: unknown) => {
          calls.update = args;
          return { id: 'novel_1', status: NovelStatus.HIDDEN };
        },
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    };
    const audit = {
      record: async (input: unknown, tx: unknown) => {
        calls.audit = input;
        calls.auditTx = tx;
      },
    };
    const service = createService(prisma, audit);

    const result = await service.updateNovelStatus(
      { id: 'admin_1', email: 'admin@novel.local', role: UserRole.ADMIN },
      'novel_1',
      { status: 'HIDDEN' },
    );

    assert.equal(result.status, NovelStatus.HIDDEN);
    assert.deepEqual(calls.findUnique, {
      where: { id: 'novel_1' },
      select: { id: true, title: true, status: true },
    });
    assert.deepEqual(calls.update, {
      where: { id: 'novel_1' },
      data: { status: NovelStatus.HIDDEN },
      include: {
        author: { select: { id: true, nickname: true, email: true, role: true } },
        category: true,
        tags: true,
        _count: {
          select: {
            bookshelf: true,
            chapters: { where: { deletedAt: null } },
            comments: true,
          },
        },
      },
    });
    assert.deepEqual(calls.audit, {
      actorId: 'admin_1',
      action: 'novel.status.update',
      targetType: 'novel',
      targetId: 'novel_1',
      summary: '将作品《测试作品》的状态从 SERIALIZING 调整为 HIDDEN',
      before: { status: NovelStatus.SERIALIZING },
      after: { status: NovelStatus.HIDDEN },
    });
    assert.equal(calls.auditTx, prisma);
  });

  it('requires a reason when suspending a user', async () => {
    const service = createService({
      user: {
        findUnique: async () => ({
          id: 'reader_1',
          nickname: '测试读者',
          status: UserStatus.ACTIVE,
          suspendedAt: null,
          suspensionReason: null,
        }),
      },
    });

    await assert.rejects(
      () =>
        service.updateUserStatus(
          { id: 'admin_1', email: 'admin@novel.local', role: UserRole.ADMIN },
          'reader_1',
          { status: 'SUSPENDED', reason: '   ' },
        ),
      BadRequestException,
    );
  });

  it('prevents an admin from suspending their own account', async () => {
    const service = createService({
      user: {
        findUnique: async () => ({
          id: 'admin_1',
          nickname: '管理员',
          status: UserStatus.ACTIVE,
          suspendedAt: null,
          suspensionReason: null,
        }),
      },
    });

    await assert.rejects(
      () =>
        service.updateUserStatus(
          { id: 'admin_1', email: 'admin@novel.local', role: UserRole.ADMIN },
          'admin_1',
          { status: 'SUSPENDED', reason: '测试封禁' },
        ),
      BadRequestException,
    );
  });

  it('suspends a user and records the reason in the audit log', async () => {
    const calls: Record<string, unknown> = {};
    const suspendedAt = new Date('2026-07-14T08:00:00.000Z');
    const prisma = {
      user: {
        findUnique: async () => ({
          id: 'reader_1',
          nickname: '测试读者',
          status: UserStatus.ACTIVE,
          suspendedAt: null,
          suspensionReason: null,
        }),
        update: async (args: { data: { suspendedAt?: Date } }) => {
          calls.update = args;
          return {
            id: 'reader_1',
            nickname: '测试读者',
            status: UserStatus.SUSPENDED,
            suspendedAt,
            suspensionReason: '违反社区规范',
          };
        },
      },
      authSession: {
        updateMany: async (args: unknown) => {
          calls.sessions = args;
          return { count: 2 };
        },
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma),
    };
    const audit = {
      record: async (input: unknown, tx: unknown) => {
        calls.audit = input;
        calls.auditTx = tx;
      },
    };
    const service = createService(prisma, audit);

    const result = await service.updateUserStatus(
      { id: 'admin_1', email: 'admin@novel.local', role: UserRole.ADMIN },
      'reader_1',
      { status: 'SUSPENDED', reason: '  违反社区规范  ' },
    );

    assert.equal(result.status, UserStatus.SUSPENDED);
    const update = calls.update as { data: Record<string, unknown> };
    assert.equal(update.data.status, UserStatus.SUSPENDED);
    assert.equal(update.data.suspensionReason, '违反社区规范');
    assert.equal(update.data.suspendedAt instanceof Date, true);
    assert.deepEqual(calls.sessions, {
      where: { userId: 'reader_1', revokedAt: null },
      data: { revokedAt: (calls.sessions as { data: { revokedAt: Date } }).data.revokedAt },
    });
    assert.deepEqual(calls.audit, {
      actorId: 'admin_1',
      action: 'user.status.update',
      targetType: 'user',
      targetId: 'reader_1',
      summary: '封禁用户 测试读者：违反社区规范',
      before: {
        status: UserStatus.ACTIVE,
        suspendedAt: null,
        suspensionReason: null,
      },
      after: {
        status: UserStatus.SUSPENDED,
        suspendedAt,
        suspensionReason: '违反社区规范',
      },
    });
    assert.equal(calls.auditTx, prisma);
  });
});
