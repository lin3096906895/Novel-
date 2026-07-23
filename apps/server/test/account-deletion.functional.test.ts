import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const API_BASE = process.env.NOVEL_API_BASE_URL ?? 'http://localhost:3000/api';
const prisma = new PrismaClient();
const email = `account-deletion-${Date.now()}@example.com`;
const password = 'DeleteAccount123';
let userId = '';
let token = '';
let secondToken = '';
let commentId = '';

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

interface AuthPayload {
  accessToken: string;
  sessionId: string;
  user: { id: string };
}

interface DeletionStatus {
  pending: boolean;
  requestedAt: string | null;
  scheduledAt: string | null;
  daysRemaining: number;
  revokedSessions?: number;
}

async function request<T>(path: string, init: RequestInit = {}, accessToken?: string) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => undefined)) as ApiResponse<T> | undefined;
  return { response, payload };
}

describe('account deletion and anonymization HTTP flow', () => {
  before(async () => {
    const health = await fetch(`${API_BASE}/health`);
    assert.equal(health.ok, true, 'server must be running before functional tests');

    const codeRequest = await request<{ developmentCode?: string }>('/auth/register/code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    const verificationCode = codeRequest.payload?.data.developmentCode ?? '';
    assert.match(verificationCode, /^\d{6}$/);

    const registered = await request<AuthPayload>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        nickname: '注销流程测试',
        verificationCode,
      }),
    });
    assert.equal(registered.response.status, 201);
    userId = registered.payload?.data.user.id ?? '';
    token = registered.payload?.data.accessToken ?? '';
    assert.ok(userId);
    assert.ok(token);

    const secondLogin = await request<AuthPayload>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    secondToken = secondLogin.payload?.data.accessToken ?? '';
    assert.ok(secondToken);
  });

  after(async () => {
    if (commentId) {
      await prisma.comment.deleteMany({ where: { id: commentId } });
    }
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.emailVerificationCode.deleteMany({ where: { email } });
    await prisma.loginActivity.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('schedules deletion, revokes other devices, and allows cancellation during cooling off', async () => {
    const initial = await request<DeletionStatus>('/auth/account-deletion', {}, token);
    assert.equal(initial.response.status, 200);
    assert.equal(initial.payload?.data.pending, false);

    const invalidConfirmation = await request(
      '/auth/account-deletion',
      {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: password,
          confirmation: '确认注销',
        }),
      },
      token,
    );
    assert.equal(invalidConfirmation.response.status, 400);

    const invalidPassword = await request(
      '/auth/account-deletion',
      {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: 'WrongPassword',
          confirmation: '注销账号',
        }),
      },
      token,
    );
    assert.equal(invalidPassword.response.status, 400);

    const scheduled = await request<DeletionStatus>(
      '/auth/account-deletion',
      {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: password,
          confirmation: '注销账号',
          reason: '功能测试',
        }),
      },
      token,
    );
    assert.equal(scheduled.response.status, 201);
    assert.equal(scheduled.payload?.data.pending, true);
    assert.equal(scheduled.payload?.data.daysRemaining, 7);
    assert.equal((scheduled.payload?.data.revokedSessions ?? 0) >= 1, true);

    const revokedSecondSession = await request('/auth/me', {}, secondToken);
    assert.equal(revokedSecondSession.response.status, 401);

    const pendingLogin = await request<AuthPayload>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    assert.equal(pendingLogin.response.status, 201);
    token = pendingLogin.payload?.data.accessToken ?? '';

    const cancelled = await request<DeletionStatus>(
      '/auth/account-deletion',
      {
        method: 'DELETE',
        body: JSON.stringify({ currentPassword: password }),
      },
      token,
    );
    assert.equal(cancelled.response.status, 200);
    assert.equal(cancelled.payload?.data.pending, false);
  });

  it('cleans personal data and anonymizes retained public comments when the deadline arrives', async () => {
    const bookshelf = await request(
      '/novels/seed_novel_star_pact/bookshelf',
      { method: 'POST' },
      token,
    );
    assert.equal(bookshelf.response.status, 201);

    const comment = await request<{ id: string }>(
      '/novels/seed_novel_star_pact/comments',
      {
        method: 'POST',
        body: JSON.stringify({ content: `注销保留评论 ${Date.now()}` }),
      },
      token,
    );
    assert.equal(comment.response.status, 201);
    commentId = comment.payload?.data.id ?? '';
    assert.ok(commentId);

    const scheduled = await request<DeletionStatus>(
      '/auth/account-deletion',
      {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: password,
          confirmation: '注销账号',
        }),
      },
      token,
    );
    assert.equal(scheduled.response.status, 201);
    await prisma.user.update({
      where: { id: userId },
      data: { deletionScheduledAt: new Date(Date.now() - 1000) },
    });

    let deletedAccount: Awaited<ReturnType<typeof prisma.user.findUnique>> = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      deletedAccount = await prisma.user.findUnique({ where: { id: userId } });
      if (deletedAccount?.deletedAt) {
        break;
      }
    }

    assert.ok(deletedAccount?.deletedAt);
    assert.equal(deletedAccount?.nickname, '已注销用户');
    assert.equal(deletedAccount?.email, `deleted-${userId}@deleted.local`);
    assert.equal(deletedAccount?.deletionScheduledAt, null);
    assert.equal(await prisma.bookshelfItem.count({ where: { userId } }), 0);
    assert.equal(await prisma.authSession.count({ where: { userId } }), 0);

    const retainedComment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: { user: { select: { nickname: true, email: true } } },
    });
    assert.equal(retainedComment?.user.nickname, '已注销用户');
    assert.equal(retainedComment?.user.email, `deleted-${userId}@deleted.local`);

    const revokedCurrentSession = await request('/auth/me', {}, token);
    assert.equal(revokedCurrentSession.response.status, 401);
    const oldEmailLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    assert.equal(oldEmailLogin.response.status, 401);
  });
});
