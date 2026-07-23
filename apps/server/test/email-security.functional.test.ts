import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const API_BASE = process.env.NOVEL_API_BASE_URL ?? 'http://localhost:3000/api';
const prisma = new PrismaClient();
const suffix = Date.now();
const originalEmail = `email-security-${suffix}@example.com`;
const changedEmail = `email-security-changed-${suffix}@example.com`;
const password = 'EmailSecurity123!';

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

interface AuthPayload {
  accessToken: string;
  sessionId: string;
  user: { id: string; email: string; emailVerified: boolean };
}

interface CodePayload {
  accepted: boolean;
  retryAfterSeconds: number;
  developmentCode?: string;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: { accessToken?: string; deviceName?: string; userAgent?: string } = {},
) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      ...(options.deviceName ? { 'X-Device-Name': options.deviceName } : {}),
      ...(options.userAgent ? { 'User-Agent': options.userAgent } : {}),
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => undefined)) as ApiResponse<T> | undefined;
  return { response, payload };
}

describe('registration email verification and account email security HTTP flow', () => {
  before(async () => {
    const health = await fetch(`${API_BASE}/health`);
    assert.equal(health.ok, true, 'server must be running before functional tests');
  });

  after(async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: [originalEmail, changedEmail] } },
      select: { id: true },
    });
    await prisma.notification.deleteMany({
      where: { userId: { in: users.map((user) => user.id) } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [originalEmail, changedEmail] } },
    });
    await prisma.emailVerificationCode.deleteMany({
      where: { email: { in: [originalEmail, changedEmail] } },
    });
    await prisma.$disconnect();
  });

  it('verifies registration, changes email, and alerts only for new browser devices', async () => {
    const registrationCodeRequest = await request<CodePayload>('/auth/register/code', {
      method: 'POST',
      body: JSON.stringify({ email: originalEmail }),
    });
    assert.equal(registrationCodeRequest.response.status, 201);
    const registrationCode = registrationCodeRequest.payload?.data.developmentCode ?? '';
    assert.match(registrationCode, /^\d{6}$/);

    const invalidRegistration = await request<AuthPayload>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: originalEmail,
        password,
        verificationCode: registrationCode === '000000' ? '999999' : '000000',
        nickname: '邮箱安全测试',
      }),
    });
    assert.equal(invalidRegistration.response.status, 400);

    const registered = await request<AuthPayload>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: originalEmail,
        password,
        verificationCode: registrationCode,
        nickname: '邮箱安全测试',
      }),
    });
    assert.equal(registered.response.status, 201);
    assert.equal(registered.payload?.data.user.emailVerified, true);
    const userId = registered.payload?.data.user.id ?? '';
    assert.ok(userId);

    const browserA = await request<AuthPayload>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email: originalEmail, password }),
      },
      { deviceName: 'Functional Browser A', userAgent: 'Mozilla/5.0 Functional Browser A' },
    );
    assert.equal(browserA.response.status, 201);
    const browserAToken = browserA.payload?.data.accessToken ?? '';
    assert.ok(browserAToken);

    const browserARepeat = await request<AuthPayload>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email: originalEmail, password }),
      },
      { deviceName: 'Functional Browser A', userAgent: 'Mozilla/5.0 Functional Browser A' },
    );
    assert.equal(browserARepeat.response.status, 201);

    const browserB = await request<AuthPayload>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email: originalEmail, password }),
      },
      { deviceName: 'Functional Browser B', userAgent: 'Mozilla/5.0 Functional Browser B' },
    );
    assert.equal(browserB.response.status, 201);
    const browserBToken = browserB.payload?.data.accessToken ?? '';
    assert.ok(browserBToken);

    const notifications = await request<{
      items: Array<{ title: string; content: string }>;
    }>('/notifications?page=1&pageSize=20', {}, { accessToken: browserAToken });
    assert.equal(notifications.response.status, 200);
    const deviceAlerts =
      notifications.payload?.data.items.filter((item) => item.title === '新设备登录') ?? [];
    assert.equal(deviceAlerts.length, 2);
    assert.equal(
      deviceAlerts.some((item) => item.content.includes('Functional Browser B')),
      true,
    );

    const emailCodeRequest = await request<CodePayload>(
      '/auth/email/change/code',
      { method: 'POST', body: JSON.stringify({ email: changedEmail }) },
      { accessToken: browserAToken },
    );
    assert.equal(emailCodeRequest.response.status, 201);
    const emailCode = emailCodeRequest.payload?.data.developmentCode ?? '';
    assert.match(emailCode, /^\d{6}$/);

    const wrongPasswordChange = await request(
      '/auth/email',
      {
        method: 'PATCH',
        body: JSON.stringify({
          email: changedEmail,
          code: emailCode,
          currentPassword: 'WrongPassword123!',
        }),
      },
      { accessToken: browserAToken },
    );
    assert.equal(wrongPasswordChange.response.status, 400);

    const changed = await request<{
      user: { email: string; emailVerified: boolean };
      revokedSessions: number;
    }>(
      '/auth/email',
      {
        method: 'PATCH',
        body: JSON.stringify({
          email: changedEmail,
          code: emailCode,
          currentPassword: password,
        }),
      },
      { accessToken: browserAToken },
    );
    assert.equal(changed.response.status, 200);
    assert.equal(changed.payload?.data.user.email, changedEmail);
    assert.equal(changed.payload?.data.user.emailVerified, true);
    assert.equal(changed.payload?.data.revokedSessions, 3);

    const currentProfile = await request<{ email: string }>(
      '/auth/me',
      {},
      { accessToken: browserAToken },
    );
    assert.equal(currentProfile.response.status, 200);
    assert.equal(currentProfile.payload?.data.email, changedEmail);

    const revokedBrowser = await request('/auth/me', {}, { accessToken: browserBToken });
    assert.equal(revokedBrowser.response.status, 401);

    const oldEmailLogin = await request<AuthPayload>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: originalEmail, password }),
    });
    assert.equal(oldEmailLogin.response.status, 401);

    const newEmailLogin = await request<AuthPayload>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: changedEmail, password }),
    });
    assert.equal(newEmailLogin.response.status, 201);

    const consumedCode = await prisma.emailVerificationCode.findFirst({
      where: { email: changedEmail, purpose: 'CHANGE_EMAIL', userId },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(consumedCode?.consumedAt);

    const updatedNotifications = await request<{
      items: Array<{ title: string }>;
    }>('/notifications?page=1&pageSize=20', {}, { accessToken: browserAToken });
    assert.equal(
      updatedNotifications.payload?.data.items.some((item) => item.title === '登录邮箱已修改'),
      true,
    );
  });
});
