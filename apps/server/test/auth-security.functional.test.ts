import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const API_BASE = process.env.NOVEL_API_BASE_URL ?? 'http://localhost:3000/api';
const prisma = new PrismaClient();
const email = `auth-security-${Date.now()}@example.com`;
const originalPassword = 'Security123!';
const newPassword = 'Security456!';

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  expiresIn: number;
  refreshExpiresIn: number;
  user: { id: string; email: string };
}

interface SessionPayload {
  id: string;
  deviceName: string;
  isCurrent: boolean;
}

interface LoginActivityPayload {
  items: Array<{
    status: 'SUCCESS' | 'FAILURE';
    failureReason?: string | null;
    deviceName: string;
  }>;
  pagination: { total: number };
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: { accessToken?: string; deviceName?: string } = {},
) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      ...(options.deviceName ? { 'X-Device-Name': options.deviceName } : {}),
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => undefined)) as ApiResponse<T> | undefined;
  return { response, payload };
}

describe('authentication session security HTTP flow', () => {
  before(async () => {
    const health = await fetch(`${API_BASE}/health`);
    assert.equal(health.ok, true, 'server must be running before functional tests');
  });

  after(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('rotates tokens, manages devices, revokes sessions, and changes the password', async () => {
    const registrationCodeRequest = await request<{
      developmentCode?: string;
    }>('/auth/register/code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    assert.equal(registrationCodeRequest.response.status, 201);
    const registrationCode = registrationCodeRequest.payload?.data.developmentCode ?? '';
    assert.match(registrationCode, /^\d{6}$/);

    const registered = await request<AuthPayload>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email,
          password: originalPassword,
          verificationCode: registrationCode,
          nickname: '认证安全测试',
        }),
      },
      { deviceName: 'Functional Main Device' },
    );
    assert.equal(registered.response.status, 201);
    assert.equal(registered.payload?.data.user.email, email);
    assert.equal(registered.payload?.data.expiresIn, 30 * 60);
    assert.equal(registered.payload?.data.refreshExpiresIn, 30 * 24 * 60 * 60);
    const main = registered.payload?.data;
    assert.ok(main?.accessToken);
    assert.ok(main.refreshToken);
    assert.ok(main.sessionId);

    const secondLogin = await request<AuthPayload>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password: originalPassword }),
      },
      { deviceName: 'Functional Second Device' },
    );
    assert.equal(secondLogin.response.status, 201);
    const second = secondLogin.payload?.data;
    assert.ok(second?.accessToken);
    assert.ok(second.refreshToken);
    assert.ok(second.sessionId);

    const sessions = await request<SessionPayload[]>(
      '/auth/sessions',
      {},
      { accessToken: main.accessToken },
    );
    assert.equal(sessions.response.status, 200);
    assert.equal(sessions.payload?.data.length, 2);
    assert.equal(
      sessions.payload?.data.some(
        (session) =>
          session.id === main.sessionId &&
          session.deviceName === 'Functional Main Device' &&
          session.isCurrent,
      ),
      true,
    );
    assert.equal(
      sessions.payload?.data.some(
        (session) =>
          session.id === second.sessionId &&
          session.deviceName === 'Functional Second Device' &&
          !session.isCurrent,
      ),
      true,
    );

    const refreshed = await request<AuthPayload>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: second.refreshToken }),
    });
    assert.equal(refreshed.response.status, 201);
    const rotatedSecond = refreshed.payload?.data;
    assert.ok(rotatedSecond?.accessToken);
    assert.notEqual(rotatedSecond.refreshToken, second.refreshToken);
    assert.equal(rotatedSecond.sessionId, second.sessionId);

    const reusedRefreshToken = await request<AuthPayload>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: second.refreshToken }),
    });
    assert.equal(reusedRefreshToken.response.status, 401);

    const revokedSecond = await request<{ revoked: boolean }>(
      `/auth/sessions/${second.sessionId}`,
      { method: 'DELETE' },
      { accessToken: main.accessToken },
    );
    assert.equal(revokedSecond.response.status, 200);
    assert.equal(revokedSecond.payload?.data.revoked, true);

    const revokedProfile = await request('/auth/me', {}, { accessToken: rotatedSecond.accessToken });
    assert.equal(revokedProfile.response.status, 401);

    const passwordChangeDevice = await request<AuthPayload>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password: originalPassword }),
      },
      { deviceName: 'Functional Password Device' },
    );
    assert.equal(passwordChangeDevice.response.status, 201);
    const otherAccessToken = passwordChangeDevice.payload?.data.accessToken ?? '';
    assert.ok(otherAccessToken);

    const changedPassword = await request<{ changed: boolean; revokedSessions: number }>(
      '/auth/password',
      {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword: originalPassword,
          newPassword,
        }),
      },
      { accessToken: main.accessToken },
    );
    assert.equal(changedPassword.response.status, 200);
    assert.equal(changedPassword.payload?.data.changed, true);
    assert.equal(changedPassword.payload?.data.revokedSessions, 1);

    const passwordRevokedProfile = await request('/auth/me', {}, { accessToken: otherAccessToken });
    assert.equal(passwordRevokedProfile.response.status, 401);

    const oldPasswordLogin = await request<AuthPayload>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: originalPassword }),
    });
    assert.equal(oldPasswordLogin.response.status, 401);

    const newPasswordLogin = await request<AuthPayload>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password: newPassword }),
      },
      { deviceName: 'Functional New Password Device' },
    );
    assert.equal(newPasswordLogin.response.status, 201);
    const newPasswordAccessToken = newPasswordLogin.payload?.data.accessToken ?? '';
    assert.ok(newPasswordAccessToken);

    const loginActivities = await request<LoginActivityPayload>(
      '/auth/login-activities?page=1&pageSize=20',
      {},
      { accessToken: newPasswordAccessToken },
    );
    assert.equal(loginActivities.response.status, 200);
    assert.ok((loginActivities.payload?.data.pagination.total ?? 0) >= 4);
    assert.equal(
      loginActivities.payload?.data.items.some(
        (activity) =>
          activity.status === 'SUCCESS' && activity.deviceName === 'Functional New Password Device',
      ),
      true,
    );
    assert.equal(
      loginActivities.payload?.data.items.some(
        (activity) =>
          activity.status === 'FAILURE' && activity.failureReason === 'INVALID_PASSWORD',
      ),
      true,
    );

    const currentProfile = await request('/auth/me', {}, { accessToken: main.accessToken });
    assert.equal(currentProfile.response.status, 200);

    const loggedOut = await request<{ revoked: boolean }>(
      '/auth/logout',
      { method: 'POST' },
      { accessToken: main.accessToken },
    );
    assert.equal(loggedOut.response.status, 201);
    assert.equal(loggedOut.payload?.data.revoked, true);

    const loggedOutProfile = await request('/auth/me', {}, { accessToken: main.accessToken });
    assert.equal(loggedOutProfile.response.status, 401);

    const finalLogout = await request<{ revoked: boolean }>(
      '/auth/logout',
      { method: 'POST' },
      { accessToken: newPasswordAccessToken },
    );
    assert.equal(finalLogout.response.status, 201);
    assert.equal(finalLogout.payload?.data.revoked, true);
  });
});
