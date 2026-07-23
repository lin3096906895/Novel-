import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const API_BASE = process.env.NOVEL_API_BASE_URL ?? 'http://localhost:3000/api';
const prisma = new PrismaClient();
const email = `data-export-${Date.now()}@example.com`;
const password = 'ExportAccount123';
let userId = '';
let token = '';
let commentId = '';

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
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

describe('personal data export HTTP flow', () => {
  before(async () => {
    const health = await fetch(`${API_BASE}/health`);
    assert.equal(health.ok, true, 'server must be running before functional tests');

    const codeRequest = await request<{ developmentCode?: string }>('/auth/register/code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
    const verificationCode = codeRequest.payload?.data.developmentCode ?? '';
    const registered = await request<{
      accessToken: string;
      user: { id: string };
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        nickname: '数据导出测试',
        verificationCode,
      }),
    });
    assert.equal(registered.response.status, 201);
    userId = registered.payload?.data.user.id ?? '';
    token = registered.payload?.data.accessToken ?? '';

    await request('/novels/seed_novel_star_pact/bookshelf', { method: 'POST' }, token);
    const comment = await request<{ id: string }>(
      '/novels/seed_novel_star_pact/comments',
      {
        method: 'POST',
        body: JSON.stringify({ content: '个人数据导出评论' }),
      },
      token,
    );
    commentId = comment.payload?.data.id ?? '';
    await request(
      '/novels/seed_novel_star_pact/rating',
      { method: 'PUT', body: JSON.stringify({ score: 5 }) },
      token,
    );
  });

  after(async () => {
    if (commentId) {
      await prisma.comment.deleteMany({ where: { id: commentId } });
    }
    if (userId) {
      await prisma.bookshelfItem.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    await prisma.emailVerificationCode.deleteMany({ where: { email } });
    await prisma.loginActivity.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it('requires identity confirmation and exports owned data without authentication secrets', async () => {
    const invalid = await request(
      '/auth/data-export',
      {
        method: 'POST',
        body: JSON.stringify({ currentPassword: 'WrongPassword' }),
      },
      token,
    );
    assert.equal(invalid.response.status, 400);

    const exported = await request<{
      format: string;
      version: number;
      account: { email: string };
      reading: { bookshelf: Array<{ novel: { id: string } }> };
      interactions: {
        comments: Array<{ id: string; content: string }>;
        ratings: Array<{ score: number; novel: { id: string } }>;
      };
      security: { sessions: Array<Record<string, unknown>> };
    }>(
      '/auth/data-export',
      {
        method: 'POST',
        body: JSON.stringify({ currentPassword: password }),
      },
      token,
    );
    assert.equal(exported.response.status, 201);
    const data = exported.payload?.data;
    assert.equal(data?.format, 'novel-platform-personal-data');
    assert.equal(data?.version, 1);
    assert.equal(data?.account.email, email);
    assert.equal(
      data?.reading.bookshelf.some((item) => item.novel.id === 'seed_novel_star_pact'),
      true,
    );
    assert.equal(
      data?.interactions.comments.some((comment) => comment.id === commentId),
      true,
    );
    assert.equal(
      data?.interactions.ratings.some(
        (rating) => rating.novel.id === 'seed_novel_star_pact' && rating.score === 5,
      ),
      true,
    );
    assert.equal((data?.security.sessions.length ?? 0) >= 1, true);

    const serialized = JSON.stringify(data);
    for (const forbiddenField of [
      'passwordHash',
      'refreshTokenHash',
      'secretEncrypted',
      'codeHash',
      'commentAuthorEmail',
    ]) {
      assert.equal(serialized.includes(forbiddenField), false);
    }
  });
});
