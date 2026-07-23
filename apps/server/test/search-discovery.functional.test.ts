import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const API_BASE = process.env.NOVEL_API_BASE_URL ?? 'http://localhost:3000/api';
const prisma = new PrismaClient();
const keyword = `功能检索${Date.now()}`;
let token = '';
let userId = '';

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

async function request<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => undefined)) as ApiResponse<T> | undefined;
  return { response, payload };
}

describe('search discovery HTTP flow', () => {
  before(async () => {
    const health = await fetch(`${API_BASE}/health`);
    assert.equal(health.ok, true, 'server must be running before functional tests');

    const login = await request<{ accessToken: string; user: { id: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@novel.local', password: 'Admin123456' }),
    });
    assert.equal(login.response.status, 201);
    token = login.payload?.data.accessToken ?? '';
    userId = login.payload?.data.user.id ?? '';
    assert.ok(token);
    assert.ok(userId);
  });

  after(async () => {
    await prisma.searchHistory.deleteMany({ where: { userId, keyword } });
    await prisma.searchTerm.deleteMany({ where: { keyword } });
    await prisma.$disconnect();
  });

  it('records searches, exposes history and hot terms, suggests public content, and deletes history', async () => {
    const recorded = await request<{
      keyword: string;
      history: { id: string; keyword: string } | null;
    }>('/searches', {
      method: 'POST',
      body: JSON.stringify({ keyword }),
    });
    assert.equal(recorded.response.status, 201);
    assert.equal(recorded.payload?.data.keyword, keyword);
    const historyId = recorded.payload?.data.history?.id ?? '';
    assert.ok(historyId);

    const histories = await request<Array<{ id: string; keyword: string }>>(
      '/me/search-histories?limit=20',
    );
    assert.equal(histories.response.status, 200);
    assert.equal(
      histories.payload?.data.some((item) => item.id === historyId),
      true,
    );

    const hot =
      await request<Array<{ keyword: string; searchCount: number }>>('/searches/hot?limit=20');
    assert.equal(hot.response.status, 200);
    assert.equal(
      hot.payload?.data.some((item) => item.keyword === keyword),
      true,
    );

    const suggestions = await request<Array<{ type: string; label: string; novelId?: string }>>(
      '/searches/suggestions?keyword=%E6%98%9F%E6%B2%B3&limit=8',
    );
    assert.equal(suggestions.response.status, 200);
    assert.equal(
      suggestions.payload?.data.some(
        (item) => item.type === 'novel' && item.novelId === 'seed_novel_star_pact',
      ),
      true,
    );

    const tagSearch = await request<{
      items: Array<{ id: string }>;
    }>('/novels?keyword=%E6%98%9F%E9%99%85&page=1&pageSize=12');
    assert.equal(tagSearch.response.status, 200);
    assert.equal(
      tagSearch.payload?.data.items.some((item) => item.id === 'seed_novel_star_pact'),
      true,
    );

    const removed = await request<{ deleted: boolean }>(`/me/search-histories/${historyId}`, {
      method: 'DELETE',
    });
    assert.equal(removed.response.status, 200);
    assert.equal(removed.payload?.data.deleted, true);
  });

  it('returns account-aware recommendations with preference context', async () => {
    const recommendations = await request<{
      source: 'personalized' | 'fallback';
      basis: {
        historyCount: number;
        bookshelfCount: number;
        categories: string[];
        tags: string[];
      };
      items: Array<{ reason: string; score: number; novel: { id: string } }>;
    }>('/me/recommendations?limit=6');

    assert.equal(recommendations.response.status, 200);
    assert.ok(
      recommendations.payload?.data.source === 'personalized' ||
        recommendations.payload?.data.source === 'fallback',
    );
    assert.equal(Array.isArray(recommendations.payload?.data.basis.categories), true);
    assert.equal(Array.isArray(recommendations.payload?.data.basis.tags), true);
    assert.equal(Array.isArray(recommendations.payload?.data.items), true);
    assert.equal(
      recommendations.payload?.data.items.every(
        (item) => Boolean(item.novel.id && item.reason) && Number.isFinite(item.score),
      ),
      true,
    );
  });
});
