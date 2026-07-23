import { LoginActivityStatus, LoginRiskLevel, UserRole, UserStatus } from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { createHash, createHmac } from 'crypto';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthService } from '../src/modules/auth/auth.service';

function account(passwordHash: string) {
  return {
    id: 'user_1',
    email: 'reader@example.com',
    nickname: '读者',
    passwordHash,
    role: UserRole.READER,
    status: UserStatus.ACTIVE,
    suspendedAt: null,
    suspensionReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createService({
  users,
  prisma,
  sign,
  mail,
  twoFactor,
}: {
  users: unknown;
  prisma: unknown;
  sign?: Function;
  mail?: unknown;
  twoFactor?: unknown;
}) {
  return new AuthService(
    users as never,
    { signAsync: sign ?? (async () => 'access_token') } as never,
    {
      get: (key: string) => (key === 'NODE_ENV' ? 'development' : 'test_secret'),
    } as never,
    prisma as never,
    (mail ?? { sendPasswordResetCode: async () => ({ provider: 'console' }) }) as never,
    (twoFactor ?? { createLoginChallenge: async () => null }) as never,
  );
}

describe('AuthService session security', () => {
  it('creates a database session and session-bound access token on login', async () => {
    const passwordHash = await hash('Password123', 4);
    let createArgs: unknown;
    let activityCreateArgs: unknown;
    let jwtPayload: unknown;
    const service = createService({
      users: { findByEmail: async () => account(passwordHash) },
      prisma: {
        authSession: {
          findFirst: async () => null,
          create: async (args: unknown) => {
            createArgs = args;
            return { id: 'session_1' };
          },
          findMany: async () => [{ id: 'session_1' }],
          updateMany: async () => ({ count: 0 }),
        },
        loginActivity: {
          create: async (args: unknown) => {
            activityCreateArgs = args;
            return { id: 'activity_1' };
          },
        },
      },
      sign: async (payload: unknown) => {
        jwtPayload = payload;
        return 'access_token';
      },
    });

    const result = await service.login(
      { email: 'reader@example.com', password: 'Password123' },
      { deviceName: '测试设备', userAgent: 'Unit Test', ipAddress: '127.0.0.1' },
    );

    assert.equal(result.accessToken, 'access_token');
    assert.equal(result.sessionId, 'session_1');
    assert.ok(result.refreshToken.length >= 64);
    assert.equal(result.expiresIn, 30 * 60);
    assert.deepEqual(jwtPayload, {
      sub: 'user_1',
      email: 'reader@example.com',
      role: UserRole.READER,
      sid: 'session_1',
    });
    const sessionData = (createArgs as { data: Record<string, unknown> }).data;
    assert.equal(sessionData.deviceName, '测试设备');
    assert.equal(sessionData.userAgent, 'Unit Test');
    assert.equal(sessionData.ipAddress, '127.0.0.1');
    assert.equal(typeof sessionData.refreshTokenHash, 'string');
    const activityData = (activityCreateArgs as { data: Record<string, unknown> }).data;
    assert.equal(activityData.userId, 'user_1');
    assert.equal(activityData.status, LoginActivityStatus.SUCCESS);
    assert.equal(activityData.riskLevel, LoginRiskLevel.NORMAL);
    assert.equal(activityData.sessionId, 'session_1');
  });

  it('returns a two-factor challenge before creating a session', async () => {
    const passwordHash = await hash('Password123', 4);
    const challenge = {
      requiresTwoFactor: true as const,
      challengeToken: 'challenge_token',
      expiresIn: 300,
      recoveryCodesAvailable: 8,
    };
    const service = createService({
      users: { findByEmail: async () => account(passwordHash) },
      prisma: {},
      twoFactor: { createLoginChallenge: async () => challenge },
    });

    const result = await service.login(
      { email: 'reader@example.com', password: 'Password123' },
      { deviceName: '测试设备' },
    );

    assert.deepEqual(result, challenge);
  });

  it('records a failed login for an existing account', async () => {
    const passwordHash = await hash('Password123', 4);
    let activityCreateArgs: unknown;
    const service = createService({
      users: { findByEmail: async () => account(passwordHash) },
      prisma: {
        loginActivity: {
          create: async (args: unknown) => {
            activityCreateArgs = args;
            return { id: 'activity_1' };
          },
        },
      },
    });

    await assert.rejects(
      () =>
        service.login(
          { email: 'reader@example.com', password: 'WrongPassword' },
          { deviceName: '测试设备', ipAddress: '127.0.0.1' },
        ),
      /邮箱或密码错误/,
    );

    const data = (activityCreateArgs as { data: Record<string, unknown> }).data;
    assert.equal(data.userId, 'user_1');
    assert.equal(data.status, LoginActivityStatus.FAILURE);
    assert.equal(data.riskLevel, LoginRiskLevel.NOTICE);
    assert.equal(data.failureReason, 'INVALID_PASSWORD');
  });

  it('lists only the current account login history with pagination', async () => {
    const item = {
      id: 'activity_1',
      status: LoginActivityStatus.SUCCESS,
      riskLevel: LoginRiskLevel.NORMAL,
      occurredAt: new Date(),
    };
    const service = createService({
      users: {},
      prisma: {
        loginActivity: {
          findMany: async () => [item],
          count: async () => 1,
        },
        $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
      },
    });

    const result = await service.listLoginActivities(
      {
        id: 'user_1',
        email: 'reader@example.com',
        role: UserRole.READER,
        sessionId: 'session_1',
      },
      { page: 1, pageSize: 10 },
    );

    assert.deepEqual(result.items, [item]);
    assert.deepEqual(result.pagination, {
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('rotates a valid refresh token atomically', async () => {
    const refreshToken = 'r'.repeat(64);
    const refreshTokenHash = createHash('sha256').update(refreshToken).digest('hex');
    let updateArgs: unknown;
    const passwordHash = await hash('Password123', 4);
    const service = createService({
      users: {},
      prisma: {
        authSession: {
          findUnique: async () => ({
            id: 'session_1',
            userId: 'user_1',
            refreshTokenHash,
            revokedAt: null,
            expiresAt: new Date(Date.now() + 60_000),
            user: account(passwordHash),
          }),
          updateMany: async (args: unknown) => {
            updateArgs = args;
            return { count: 1 };
          },
        },
      },
    });

    const result = await service.refresh({ refreshToken });

    assert.equal(result.sessionId, 'session_1');
    assert.notEqual(result.refreshToken, refreshToken);
    const update = updateArgs as {
      where: { refreshTokenHash: string };
      data: { refreshTokenHash: string; lastUsedAt: Date };
    };
    assert.equal(update.where.refreshTokenHash, refreshTokenHash);
    assert.notEqual(update.data.refreshTokenHash, refreshTokenHash);
    assert.equal(update.data.lastUsedAt instanceof Date, true);
  });

  it('revokes the current session on logout', async () => {
    let updateArgs: unknown;
    const service = createService({
      users: {},
      prisma: {
        authSession: {
          updateMany: async (args: unknown) => {
            updateArgs = args;
            return { count: 1 };
          },
        },
      },
    });

    assert.deepEqual(
      await service.logout({
        id: 'user_1',
        email: 'reader@example.com',
        role: UserRole.READER,
        sessionId: 'session_1',
      }),
      { revoked: true },
    );
    assert.deepEqual(updateArgs, {
      where: { id: 'session_1', userId: 'user_1', revokedAt: null },
      data: { revokedAt: (updateArgs as { data: { revokedAt: Date } }).data.revokedAt },
    });
  });

  it('changes the password and revokes every other session', async () => {
    const passwordHash = await hash('Password123', 4);
    let passwordUpdate: unknown;
    let sessionUpdate: unknown;
    const tx = {
      user: {
        update: async (args: unknown) => {
          passwordUpdate = args;
        },
      },
      authSession: {
        updateMany: async (args: unknown) => {
          sessionUpdate = args;
          return { count: 2 };
        },
      },
    };
    const service = createService({
      users: { findById: async () => account(passwordHash) },
      prisma: {
        $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      },
    });

    const result = await service.changePassword(
      {
        id: 'user_1',
        email: 'reader@example.com',
        role: UserRole.READER,
        sessionId: 'session_1',
      },
      { currentPassword: 'Password123', newPassword: 'NewPassword456' },
    );

    assert.deepEqual(result, { changed: true, revokedSessions: 2 });
    assert.equal(
      typeof (passwordUpdate as { data: { passwordHash: string } }).data.passwordHash,
      'string',
    );
    assert.deepEqual((sessionUpdate as { where: unknown }).where, {
      userId: 'user_1',
      id: { not: 'session_1' },
      revokedAt: null,
    });
  });

  it('stores only a hashed password reset code and sends the generated code', async () => {
    const passwordHash = await hash('Password123', 4);
    let createArgs: unknown;
    let mailedCode = '';
    const tx = {
      passwordResetCode: {
        updateMany: async () => ({ count: 0 }),
        create: async (args: unknown) => {
          createArgs = args;
          return { id: 'reset_1' };
        },
      },
    };
    const service = createService({
      users: { findByEmail: async () => account(passwordHash) },
      prisma: {
        passwordResetCode: { findFirst: async () => null },
        $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      },
      mail: {
        sendPasswordResetCode: async (input: { code: string }) => {
          mailedCode = input.code;
          return { provider: 'console' };
        },
      },
    });

    const result = await service.requestPasswordReset(
      { email: 'READER@example.com' },
      { userAgent: 'Unit Test', ipAddress: '127.0.0.1' },
    );

    assert.match(mailedCode, /^\d{6}$/);
    assert.equal(result.developmentCode, mailedCode);
    const data = (createArgs as { data: Record<string, unknown> }).data;
    assert.equal(data.userId, 'user_1');
    assert.notEqual(data.codeHash, mailedCode);
    assert.equal(data.userAgent, 'Unit Test');
    assert.equal(data.requestedIp, '127.0.0.1');
    assert.equal(data.expiresAt instanceof Date, true);
  });

  it('increments the attempt count for an invalid password reset code', async () => {
    const passwordHash = await hash('Password123', 4);
    const correctHash = createHmac('sha256', 'test_secret').update('user_1:123456').digest('hex');
    let updateArgs: unknown;
    const service = createService({
      users: { findByEmail: async () => account(passwordHash) },
      prisma: {
        passwordResetCode: {
          findFirst: async () => ({
            id: 'reset_1',
            codeHash: correctHash,
            attemptCount: 1,
          }),
          updateMany: async (args: unknown) => {
            updateArgs = args;
            return { count: 1 };
          },
        },
      },
    });

    await assert.rejects(
      () =>
        service.resetPassword({
          email: 'reader@example.com',
          code: '654321',
          newPassword: 'NewPassword456',
        }),
      /验证码无效或已过期/,
    );
    assert.deepEqual((updateArgs as { data: unknown }).data, {
      attemptCount: { increment: 1 },
    });
  });

  it('resets the password, consumes the code, and revokes every active session', async () => {
    const passwordHash = await hash('Password123', 4);
    const codeHash = createHmac('sha256', 'test_secret').update('user_1:123456').digest('hex');
    let passwordUpdate: unknown;
    let sessionUpdate: unknown;
    const resetUpdates: unknown[] = [];
    const tx = {
      passwordResetCode: {
        updateMany: async (args: unknown) => {
          resetUpdates.push(args);
          return { count: 1 };
        },
      },
      user: {
        update: async (args: unknown) => {
          passwordUpdate = args;
        },
      },
      authSession: {
        updateMany: async (args: unknown) => {
          sessionUpdate = args;
          return { count: 3 };
        },
      },
    };
    const service = createService({
      users: { findByEmail: async () => account(passwordHash) },
      prisma: {
        passwordResetCode: {
          findFirst: async () => ({ id: 'reset_1', codeHash, attemptCount: 0 }),
        },
        $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
      },
    });

    const result = await service.resetPassword({
      email: 'reader@example.com',
      code: '123456',
      newPassword: 'NewPassword456',
    });

    assert.deepEqual(result, { reset: true, revokedSessions: 3 });
    assert.equal(resetUpdates.length, 2);
    assert.equal(
      await compare(
        'NewPassword456',
        (passwordUpdate as { data: { passwordHash: string } }).data.passwordHash,
      ),
      true,
    );
    assert.deepEqual((sessionUpdate as { where: unknown }).where, {
      userId: 'user_1',
      revokedAt: null,
    });
  });
});
