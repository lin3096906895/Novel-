import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { authenticator } from 'otplib';

const API_BASE = process.env.NOVEL_API_BASE_URL ?? 'http://localhost:3000/api';
const prisma = new PrismaClient();
const email = `two-factor-${Date.now()}@example.com`;
const password = 'TwoFactor123';
let accessToken = '';
let secret = '';
let recoveryCodes: string[] = [];

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

interface AuthPayload {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  usedRecoveryCode?: boolean;
}

interface ChallengePayload {
  requiresTwoFactor: true;
  challengeToken: string;
  expiresIn: number;
  recoveryCodesAvailable: number;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  options: { token?: string; deviceName?: string } = {},
) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.deviceName ? { 'X-Device-Name': options.deviceName } : {}),
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => undefined)) as ApiResponse<T> | undefined;
  return { response, payload };
}

async function loginForChallenge(deviceName: string) {
  const login = await request<ChallengePayload>(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    },
    { deviceName },
  );
  assert.equal(login.response.status, 201);
  assert.equal(login.payload?.data.requiresTwoFactor, true);
  assert.ok(login.payload?.data.challengeToken);
  return login.payload!.data;
}

function invalidTotp() {
  return authenticator.generate(secret) === '000000' ? '000001' : '000000';
}

describe('two-factor authentication HTTP flow', () => {
  before(async () => {
    const health = await fetch(`${API_BASE}/health`);
    assert.equal(health.ok, true, 'server must be running before functional tests');

    const codeRequest = await request<{
      developmentCode?: string;
    }>('/auth/register/code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    assert.equal(codeRequest.response.status, 201);
    const verificationCode = codeRequest.payload?.data.developmentCode ?? '';
    assert.match(verificationCode, /^\d{6}$/);

    const registered = await request<AuthPayload>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          email,
          password,
          nickname: '两步验证测试',
          verificationCode,
        }),
      },
      { deviceName: 'Two Factor Setup Device' },
    );
    assert.equal(registered.response.status, 201);
    accessToken = registered.payload?.data.accessToken ?? '';
    assert.ok(accessToken);
  });

  after(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.emailVerificationCode.deleteMany({ where: { email } });
    await prisma.loginActivity.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('enables an authenticator and returns one-time recovery codes', async () => {
    const initial = await request<{
      enabled: boolean;
      pendingSetup: boolean;
    }>('/auth/two-factor', {}, { token: accessToken });
    assert.equal(initial.response.status, 200);
    assert.equal(initial.payload?.data.enabled, false);

    const invalidPassword = await request(
      '/auth/two-factor/setup',
      {
        method: 'POST',
        body: JSON.stringify({ currentPassword: 'WrongPassword' }),
      },
      { token: accessToken },
    );
    assert.equal(invalidPassword.response.status, 400);

    const setup = await request<{
      secret: string;
      otpauthUrl: string;
      qrCodeDataUrl: string;
    }>(
      '/auth/two-factor/setup',
      {
        method: 'POST',
        body: JSON.stringify({ currentPassword: password }),
      },
      { token: accessToken },
    );
    assert.equal(setup.response.status, 201);
    secret = setup.payload?.data.secret ?? '';
    assert.ok(secret);
    assert.match(setup.payload?.data.otpauthUrl ?? '', /^otpauth:\/\/totp\//);
    assert.match(setup.payload?.data.qrCodeDataUrl ?? '', /^data:image\/png;base64,/);

    const invalidEnable = await request(
      '/auth/two-factor/enable',
      { method: 'POST', body: JSON.stringify({ code: invalidTotp() }) },
      { token: accessToken },
    );
    assert.equal(invalidEnable.response.status, 400);

    const enabled = await request<{
      enabled: boolean;
      recoveryCodes: string[];
      recoveryCodesRemaining: number;
    }>(
      '/auth/two-factor/enable',
      {
        method: 'POST',
        body: JSON.stringify({ code: authenticator.generate(secret) }),
      },
      { token: accessToken },
    );
    assert.equal(enabled.response.status, 201);
    assert.equal(enabled.payload?.data.enabled, true);
    recoveryCodes = enabled.payload?.data.recoveryCodes ?? [];
    assert.equal(recoveryCodes.length, 10);
    assert.equal(new Set(recoveryCodes).size, 10);
    assert.equal(
      recoveryCodes.every((code) => /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)),
      true,
    );
  });

  it('requires and consumes a login challenge for TOTP and recovery codes', async () => {
    const lockedChallenge = await loginForChallenge('Two Factor Locked Login');
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const rejected = await request('/auth/two-factor/login', {
        method: 'POST',
        body: JSON.stringify({
          challengeToken: lockedChallenge.challengeToken,
          code: invalidTotp(),
        }),
      });
      assert.equal(rejected.response.status, 401);
    }
    const lockedCorrectCode = await request('/auth/two-factor/login', {
      method: 'POST',
      body: JSON.stringify({
        challengeToken: lockedChallenge.challengeToken,
        code: authenticator.generate(secret),
      }),
    });
    assert.equal(lockedCorrectCode.response.status, 401);

    const totpChallenge = await loginForChallenge('Two Factor TOTP Login');
    const invalid = await request('/auth/two-factor/login', {
      method: 'POST',
      body: JSON.stringify({
        challengeToken: totpChallenge.challengeToken,
        code: invalidTotp(),
      }),
    });
    assert.equal(invalid.response.status, 401);

    const totpLogin = await request<AuthPayload>('/auth/two-factor/login', {
      method: 'POST',
      body: JSON.stringify({
        challengeToken: totpChallenge.challengeToken,
        code: authenticator.generate(secret),
      }),
    });
    assert.equal(totpLogin.response.status, 201);
    assert.ok(totpLogin.payload?.data.accessToken);
    assert.equal(totpLogin.payload?.data.usedRecoveryCode, false);

    const recoveryChallenge = await loginForChallenge('Two Factor Recovery Login');
    const recoveryLogin = await request<AuthPayload>('/auth/two-factor/login', {
      method: 'POST',
      body: JSON.stringify({
        challengeToken: recoveryChallenge.challengeToken,
        code: recoveryCodes[0],
      }),
    });
    assert.equal(recoveryLogin.response.status, 201);
    assert.equal(recoveryLogin.payload?.data.usedRecoveryCode, true);
    accessToken = recoveryLogin.payload?.data.accessToken ?? '';

    const status = await request<{ recoveryCodesRemaining: number }>(
      '/auth/two-factor',
      {},
      { token: accessToken },
    );
    assert.equal(status.payload?.data.recoveryCodesRemaining, 9);
  });

  it('regenerates recovery codes, rejects old codes, and safely disables two-factor auth', async () => {
    const regenerated = await request<{
      recoveryCodes: string[];
      recoveryCodesRemaining: number;
    }>(
      '/auth/two-factor/recovery-codes',
      {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: password,
          code: authenticator.generate(secret),
        }),
      },
      { token: accessToken },
    );
    assert.equal(regenerated.response.status, 201);
    const newRecoveryCodes = regenerated.payload?.data.recoveryCodes ?? [];
    assert.equal(newRecoveryCodes.length, 10);
    assert.equal(regenerated.payload?.data.recoveryCodesRemaining, 10);

    const oldCodeChallenge = await loginForChallenge('Two Factor Old Recovery Login');
    const oldCodeLogin = await request('/auth/two-factor/login', {
      method: 'POST',
      body: JSON.stringify({
        challengeToken: oldCodeChallenge.challengeToken,
        code: recoveryCodes[1],
      }),
    });
    assert.equal(oldCodeLogin.response.status, 401);

    const recoveryLogin = await request<AuthPayload>('/auth/two-factor/login', {
      method: 'POST',
      body: JSON.stringify({
        challengeToken: oldCodeChallenge.challengeToken,
        code: newRecoveryCodes[0],
      }),
    });
    assert.equal(recoveryLogin.response.status, 201);
    accessToken = recoveryLogin.payload?.data.accessToken ?? '';

    const disabled = await request<{ disabled: boolean }>(
      '/auth/two-factor',
      {
        method: 'DELETE',
        body: JSON.stringify({
          currentPassword: password,
          code: authenticator.generate(secret),
        }),
      },
      { token: accessToken },
    );
    assert.equal(disabled.response.status, 200);
    assert.equal(disabled.payload?.data.disabled, true);

    const normalLogin = await request<AuthPayload>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    assert.equal(normalLogin.response.status, 201);
    assert.ok(normalLogin.payload?.data.accessToken);
  });
});
