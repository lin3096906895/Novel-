import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const API_BASE = process.env.NOVEL_API_BASE_URL ?? 'http://localhost:3000/api';
const prisma = new PrismaClient();
const email = `password-recovery-${Date.now()}@example.com`;
const unknownEmail = `password-recovery-unknown-${Date.now()}@example.com`;
const originalPassword = 'Recovery123!';
const newPassword = 'Recovery456!';

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  user: { id: string; email: string };
}

interface ResetRequestPayload {
  accepted: boolean;
  retryAfterSeconds: number;
  developmentCode?: string;
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

describe('password recovery HTTP flow', () => {
  before(async () => {
    const health = await fetch(`${API_BASE}/health`);
    assert.equal(health.ok, true, 'server must be running before functional tests');
  });

  after(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('requests a code, resets the password, and invalidates prior credentials', async () => {
    const registrationCodeRequest = await request<ResetRequestPayload>('/auth/register/code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    assert.equal(registrationCodeRequest.response.status, 201);
    const registrationCode = registrationCodeRequest.payload?.data.developmentCode ?? '';
    assert.match(registrationCode, /^\d{6}$/);

    const registered = await request<AuthPayload>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password: originalPassword,
        verificationCode: registrationCode,
        nickname: '密码找回测试',
      }),
    });
    assert.equal(registered.response.status, 201);
    const accessToken = registered.payload?.data.accessToken ?? '';
    const userId = registered.payload?.data.user.id ?? '';
    assert.ok(accessToken);
    assert.ok(userId);

    const unknownRequest = await request<ResetRequestPayload>('/auth/password/forgot', {
      method: 'POST',
      body: JSON.stringify({ email: unknownEmail }),
    });
    assert.equal(unknownRequest.response.status, 201);
    assert.equal(unknownRequest.payload?.data.accepted, true);
    assert.equal(unknownRequest.payload?.data.developmentCode, undefined);

    const resetRequest = await request<ResetRequestPayload>('/auth/password/forgot', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    assert.equal(resetRequest.response.status, 201);
    assert.equal(resetRequest.payload?.data.accepted, true);
    assert.equal(resetRequest.payload?.data.retryAfterSeconds, 60);
    const code = resetRequest.payload?.data.developmentCode ?? '';
    assert.match(code, /^\d{6}$/);

    const savedCode = await prisma.passwordResetCode.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(savedCode);
    assert.notEqual(savedCode.codeHash, code);
    assert.equal(savedCode.attemptCount, 0);

    const cooldownRequest = await request<ResetRequestPayload>('/auth/password/forgot', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    assert.equal(cooldownRequest.response.status, 201);
    assert.equal(cooldownRequest.payload?.data.accepted, true);
    assert.equal(cooldownRequest.payload?.data.developmentCode, undefined);
    assert.equal(await prisma.passwordResetCode.count({ where: { userId } }), 1);

    const wrongCode = code === '000000' ? '999999' : '000000';
    const invalidReset = await request('/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify({ email, code: wrongCode, newPassword }),
    });
    assert.equal(invalidReset.response.status, 400);
    assert.equal(
      (await prisma.passwordResetCode.findUnique({ where: { id: savedCode.id } }))?.attemptCount,
      1,
    );

    const reset = await request<{ reset: boolean; revokedSessions: number }>(
      '/auth/password/reset',
      {
        method: 'POST',
        body: JSON.stringify({ email, code, newPassword }),
      },
    );
    assert.equal(reset.response.status, 201);
    assert.equal(reset.payload?.data.reset, true);
    assert.equal(reset.payload?.data.revokedSessions, 1);

    const revokedProfile = await request('/auth/me', {}, accessToken);
    assert.equal(revokedProfile.response.status, 401);

    const oldPasswordLogin = await request<AuthPayload>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: originalPassword }),
    });
    assert.equal(oldPasswordLogin.response.status, 401);

    const newPasswordLogin = await request<AuthPayload>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password: newPassword }),
    });
    assert.equal(newPasswordLogin.response.status, 201);
    const newAccessToken = newPasswordLogin.payload?.data.accessToken ?? '';
    assert.ok(newAccessToken);

    const reusedCode = await request('/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify({ email, code, newPassword: 'Recovery789!' }),
    });
    assert.equal(reusedCode.response.status, 400);

    const logout = await request<{ revoked: boolean }>(
      '/auth/logout',
      { method: 'POST' },
      newAccessToken,
    );
    assert.equal(logout.response.status, 201);
    assert.equal(logout.payload?.data.revoked, true);
  });
});
