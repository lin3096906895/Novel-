import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const API_BASE = process.env.NOVEL_API_BASE_URL ?? 'http://localhost:3000/api';
const prisma = new PrismaClient();
const email = `author-onboarding-${Date.now()}@example.com`;
const password = 'AuthorOnboarding123!';
let userId = '';
let applicationId = '';

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

interface AuthPayload {
  accessToken: string;
  user: { id: string; role: string };
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

describe('author onboarding HTTP flow', () => {
  before(async () => {
    const health = await fetch(`${API_BASE}/health`);
    assert.equal(health.ok, true, 'server must be running before functional tests');
  });

  after(async () => {
    if (userId) {
      await prisma.notification.deleteMany({ where: { userId } });
      await prisma.authorProfile.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (applicationId) {
      await prisma.adminAuditLog.deleteMany({
        where: { targetType: 'author-application', targetId: applicationId },
      });
    }
    await prisma.emailVerificationCode.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('rejects, resubmits, approves, and activates an author profile', async () => {
    const registrationCodeRequest = await request<{ developmentCode?: string }>(
      '/auth/register/code',
      { method: 'POST', body: JSON.stringify({ email }) },
    );
    const registrationCode = registrationCodeRequest.payload?.data.developmentCode ?? '';
    assert.match(registrationCode, /^\d{6}$/);

    const registered = await request<AuthPayload>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        verificationCode: registrationCode,
        nickname: '作者申请测试',
      }),
    });
    assert.equal(registered.response.status, 201);
    const readerToken = registered.payload?.data.accessToken ?? '';
    userId = registered.payload?.data.user.id ?? '';
    assert.ok(readerToken);
    assert.ok(userId);

    const initial = await request<{
      canWrite: boolean;
      emailVerified: boolean;
      application: null;
    }>('/author/onboarding', {}, readerToken);
    assert.equal(initial.response.status, 200);
    assert.equal(initial.payload?.data.canWrite, false);
    assert.equal(initial.payload?.data.emailVerified, true);
    assert.equal(initial.payload?.data.application, null);

    const submitted = await request<{
      id: string;
      status: string;
      penName: string;
    }>(
      '/author/onboarding',
      {
        method: 'POST',
        body: JSON.stringify({
          penName: '初次笔名',
          bio: '擅长悬疑与科幻题材。',
          statement: '我计划持续创作原创长篇小说，并认真维护作品更新与读者互动。',
        }),
      },
      readerToken,
    );
    assert.equal(submitted.response.status, 201);
    assert.equal(submitted.payload?.data.status, 'PENDING');
    applicationId = submitted.payload?.data.id ?? '';
    assert.ok(applicationId);

    const duplicate = await request(
      '/author/onboarding',
      {
        method: 'POST',
        body: JSON.stringify({
          penName: '重复笔名',
          statement: '这是一段长度足够但不应被重复提交的作者申请说明文本。',
        }),
      },
      readerToken,
    );
    assert.equal(duplicate.response.status, 400);

    const adminLogin = await request<AuthPayload>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@novel.local', password: 'Admin123456' }),
    });
    const adminToken = adminLogin.payload?.data.accessToken ?? '';
    assert.ok(adminToken);

    const pendingList = await request<{
      items: Array<{ id: string; userId: string }>;
    }>('/admin/author-applications?status=PENDING&page=1&pageSize=20', {}, adminToken);
    assert.equal(pendingList.response.status, 200);
    assert.equal(
      pendingList.payload?.data.items.some((item) => item.id === applicationId),
      true,
    );

    const rejected = await request<{ status: string; reviewReason: string }>(
      `/admin/author-applications/${applicationId}/review`,
      {
        method: 'PATCH',
        body: JSON.stringify({ action: 'reject', reason: '请补充更清晰的创作计划' }),
      },
      adminToken,
    );
    assert.equal(rejected.response.status, 200);
    assert.equal(rejected.payload?.data.status, 'REJECTED');

    const rejectedStatus = await request<{
      canWrite: boolean;
      application: { status: string; reviewReason: string };
    }>('/author/onboarding', {}, readerToken);
    assert.equal(rejectedStatus.payload?.data.canWrite, false);
    assert.equal(rejectedStatus.payload?.data.application.status, 'REJECTED');
    assert.equal(
      rejectedStatus.payload?.data.application.reviewReason,
      '请补充更清晰的创作计划',
    );

    const resubmitted = await request<{ status: string; penName: string }>(
      '/author/onboarding',
      {
        method: 'POST',
        body: JSON.stringify({
          penName: '星海执笔',
          bio: '专注科幻、悬疑和群像故事。',
          statement: '未来一年计划完成一部长篇科幻作品，每周稳定更新并及时回应读者反馈。',
        }),
      },
      readerToken,
    );
    assert.equal(resubmitted.response.status, 201);
    assert.equal(resubmitted.payload?.data.status, 'PENDING');
    assert.equal(resubmitted.payload?.data.penName, '星海执笔');

    const approved = await request<{
      status: string;
      user: { role: string };
    }>(
      `/admin/author-applications/${applicationId}/review`,
      { method: 'PATCH', body: JSON.stringify({ action: 'approve' }) },
      adminToken,
    );
    assert.equal(approved.response.status, 200);
    assert.equal(approved.payload?.data.status, 'APPROVED');
    assert.equal(approved.payload?.data.user.role, 'AUTHOR');

    const approvedStatus = await request<{
      canWrite: boolean;
      profile: { penName: string; bio: string };
      application: { status: string };
    }>('/author/onboarding', {}, readerToken);
    assert.equal(approvedStatus.payload?.data.canWrite, true);
    assert.equal(approvedStatus.payload?.data.profile.penName, '星海执笔');
    assert.equal(approvedStatus.payload?.data.application.status, 'APPROVED');

    const authorNovels = await request('/author/novels', {}, readerToken);
    assert.equal(authorNovels.response.status, 200);

    const updatedProfile = await request<{ penName: string; bio: string }>(
      '/author/profile',
      {
        method: 'PATCH',
        body: JSON.stringify({
          penName: '星海执笔者',
          bio: '持续创作科幻、悬疑和群像故事。',
        }),
      },
      readerToken,
    );
    assert.equal(updatedProfile.response.status, 200);
    assert.equal(updatedProfile.payload?.data.penName, '星海执笔者');

    const notifications = await request<{
      items: Array<{ title: string }>;
    }>('/notifications?page=1&pageSize=20', {}, readerToken);
    const titles = notifications.payload?.data.items.map((item) => item.title) ?? [];
    assert.equal(titles.includes('作者申请未通过'), true);
    assert.equal(titles.includes('作者申请已通过'), true);

    const auditActions = await prisma.adminAuditLog.findMany({
      where: { targetType: 'author-application', targetId: applicationId },
      select: { action: true },
    });
    assert.equal(
      auditActions.some((item) => item.action === 'author.application.reject'),
      true,
    );
    assert.equal(
      auditActions.some((item) => item.action === 'author.application.approve'),
      true,
    );
  });
});
