import { UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AccountDeletionService } from '../src/modules/auth/account-deletion.service';

const user = {
  id: 'user_1',
  email: 'reader@example.com',
  role: UserRole.READER,
  sessionId: 'session_1',
};

describe('AccountDeletionService', () => {
  it('schedules deletion for seven days later and revokes other sessions', async () => {
    let userUpdate: unknown;
    let sessionUpdate: unknown;
    let verification: unknown;
    const tx = {
      user: {
        update: async (args: unknown) => {
          userUpdate = args;
          const data = (args as { data: { deletionRequestedAt: Date; deletionScheduledAt: Date } })
            .data;
          return {
            deletionRequestedAt: data.deletionRequestedAt,
            deletionScheduledAt: data.deletionScheduledAt,
            deletionReason: '暂时离开',
            deletedAt: null,
          };
        },
      },
      authSession: {
        updateMany: async (args: unknown) => {
          sessionUpdate = args;
          return { count: 2 };
        },
      },
    };
    const service = new AccountDeletionService(
      {
        user: {
          findUnique: async () => ({
            id: user.id,
            role: user.role,
            deletionRequestedAt: null,
            deletionScheduledAt: null,
            deletionReason: null,
            deletedAt: null,
          }),
        },
        $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      } as never,
      {
        verifySensitiveAction: async (...args: unknown[]) => {
          verification = args;
        },
      } as never,
    );

    const before = Date.now();
    const result = await service.request(user, {
      currentPassword: 'Password123',
      confirmation: '注销账号',
      reason: ' 暂时离开 ',
    });

    const data = (userUpdate as { data: { deletionScheduledAt: Date } }).data;
    assert.equal(data.deletionScheduledAt.getTime() >= before + 7 * 24 * 60 * 60 * 1000, true);
    assert.equal(result.pending, true);
    assert.equal(result.revokedSessions, 2);
    assert.deepEqual(verification, [user, 'Password123', undefined]);
    assert.deepEqual((sessionUpdate as { where: unknown }).where, {
      userId: user.id,
      id: { not: user.sessionId },
      revokedAt: null,
    });
  });

  it('rejects self-service deletion for administrator accounts', async () => {
    const service = new AccountDeletionService(
      {
        user: {
          findUnique: async () => ({
            id: 'admin_1',
            role: UserRole.ADMIN,
            deletionRequestedAt: null,
            deletionScheduledAt: null,
            deletionReason: null,
            deletedAt: null,
          }),
        },
      } as never,
      {} as never,
    );

    await assert.rejects(
      () =>
        service.request(
          { ...user, id: 'admin_1', role: UserRole.ADMIN },
          {
            currentPassword: 'Password123',
            confirmation: '注销账号',
          },
        ),
      /管理员账号不能通过用户端自助注销/,
    );
  });
});
