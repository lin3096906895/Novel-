import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const API_BASE = process.env.NOVEL_API_BASE_URL ?? 'http://localhost:3000/api';
const prisma = new PrismaClient();
let token = '';
let adminId = '';
let authorId = '';

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

async function request<T>(path: string, init: RequestInit & { anonymous?: boolean } = {}) {
  const { anonymous, ...requestInit } = init;
  const response = await fetch(`${API_BASE}${path}`, {
    ...requestInit,
    headers: {
      'Content-Type': 'application/json',
      ...(!anonymous && token ? { Authorization: `Bearer ${token}` } : {}),
      ...requestInit.headers,
    },
  });
  const payload = (await response.json().catch(() => undefined)) as ApiResponse<T> | undefined;
  return { response, payload };
}

describe('public author profile and following HTTP flow', () => {
  before(async () => {
    const health = await fetch(`${API_BASE}/health`);
    assert.equal(health.ok, true, 'server must be running before functional tests');

    const author = await prisma.user.findUniqueOrThrow({
      where: { email: 'author@novel.local' },
      select: { id: true },
    });
    authorId = author.id;

    const login = await request<{ accessToken: string; user: { id: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@novel.local', password: 'Admin123456' }),
      anonymous: true,
    });
    assert.equal(login.response.status, 201);
    token = login.payload?.data.accessToken ?? '';
    adminId = login.payload?.data.user.id ?? '';
    assert.ok(token);
    assert.ok(adminId);

    await prisma.authorFollow.deleteMany({ where: { followerId: adminId, authorId } });
  });

  after(async () => {
    if (adminId && authorId) {
      await prisma.authorFollow.deleteMany({ where: { followerId: adminId, authorId } });
    }
    await prisma.$disconnect();
  });

  it('exposes the author profile publicly and manages an idempotent follow relationship', async () => {
    const anonymous = await request<{
      id: string;
      penName: string;
      isFollowing: boolean;
      stats: { works: number; followers: number };
      novels: Array<{ id: string }>;
    }>(`/authors/${authorId}`, { anonymous: true });
    assert.equal(anonymous.response.status, 200);
    assert.equal(anonymous.payload?.data.penName, '南城纸伞');
    assert.equal(anonymous.payload?.data.isFollowing, false);
    assert.equal(anonymous.payload?.data.stats.works >= 1, true);
    assert.equal(
      anonymous.payload?.data.novels.some((novel) => novel.id === 'seed_novel_star_pact'),
      true,
    );

    const followed = await request<{
      authorId: string;
      isFollowing: boolean;
      followerCount: number;
    }>(`/authors/${authorId}/follow`, { method: 'POST' });
    assert.equal(followed.response.status, 201);
    assert.equal(followed.payload?.data.isFollowing, true);
    const followerCount = followed.payload?.data.followerCount ?? 0;

    const followedAgain = await request<{ followerCount: number }>(`/authors/${authorId}/follow`, {
      method: 'POST',
    });
    assert.equal(followedAgain.response.status, 201);
    assert.equal(followedAgain.payload?.data.followerCount, followerCount);

    const authenticated = await request<{ isFollowing: boolean }>(`/authors/${authorId}`);
    assert.equal(authenticated.payload?.data.isFollowing, true);

    const mine =
      await request<Array<{ author: { id: string }; latestNovels: unknown[] }>>(
        '/me/followed-authors',
      );
    assert.equal(mine.response.status, 200);
    assert.equal(
      mine.payload?.data.some((item) => item.author.id === authorId),
      true,
    );

    const selfFollow = await request(`/authors/${adminId}/follow`, { method: 'POST' });
    assert.equal(selfFollow.response.status, 400);

    const unfollowed = await request<{ isFollowing: boolean; followerCount: number }>(
      `/authors/${authorId}/follow`,
      { method: 'DELETE' },
    );
    assert.equal(unfollowed.response.status, 200);
    assert.equal(unfollowed.payload?.data.isFollowing, false);
    assert.equal(unfollowed.payload?.data.followerCount, Math.max(0, followerCount - 1));
  });
});
