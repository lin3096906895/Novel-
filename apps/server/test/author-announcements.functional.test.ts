import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { after, before, describe, it } from 'node:test';

const API_BASE = process.env.NOVEL_API_BASE_URL ?? 'http://localhost:3000/api';
const novelId = 'seed_novel_star_pact';

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

const prisma = new PrismaClient();
let token = '';
let sessionId = '';
let announcementId = '';
let announcementTitle = '';

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

describe('author novel announcements HTTP flow', () => {
  before(async () => {
    const health = await fetch(`${API_BASE}/health`);
    assert.equal(health.ok, true, 'server must be running before functional tests');

    const login = await request<{ accessToken: string; sessionId: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'author@novel.local', password: 'Admin123456' }),
    });
    assert.equal(login.response.status, 201);
    assert.ok(login.payload?.data.accessToken);
    token = login.payload.data.accessToken;
    sessionId = login.payload.data.sessionId;
  });

  after(async () => {
    if (announcementId) {
      await prisma.novelAnnouncement.deleteMany({ where: { id: announcementId } });
    }
    if (announcementTitle) {
      await prisma.notification.deleteMany({
        where: { content: { startsWith: `${announcementTitle}：` } },
      });
    }
    if (sessionId) {
      await prisma.authSession.deleteMany({ where: { id: sessionId } });
    }
    await prisma.$disconnect();
  });

  it('saves, publishes, unpublishes, and deletes an announcement', async () => {
    const suffix = Date.now().toString();
    const title = `公告功能测试${suffix}`;
    announcementTitle = title;
    const created = await request<{
      id: string;
      publishedAt: string | null;
    }>(`/author/novels/${novelId}/announcements`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        content: '这是一条先保存为草稿的作品公告。',
        isPinned: true,
        action: 'save',
      }),
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.payload?.data.publishedAt, null);
    announcementId = created.payload?.data.id ?? '';
    assert.ok(announcementId);

    const hidden = await request<Array<{ id: string }>>(`/novels/${novelId}/announcements`);
    assert.equal(hidden.response.status, 200);
    assert.equal(hidden.payload?.data.some((item) => item.id === announcementId), false);

    const authorList = await request<Array<{ id: string; publishedAt: string | null }>>(
      `/author/novels/${novelId}/announcements`,
    );
    assert.equal(authorList.response.status, 200);
    assert.equal(authorList.payload?.data.some((item) => item.id === announcementId), true);

    const published = await request<{ publishedAt: string | null }>(
      `/author/announcements/${announcementId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          content: '这条公告现在已经公开，可在作品详情页查看。',
          isPinned: true,
          action: 'publish',
        }),
      },
    );
    assert.equal(published.response.status, 200);
    assert.ok(published.payload?.data.publishedAt);

    const visible = await request<Array<{ id: string; title: string; isPinned: boolean }>>(
      `/novels/${novelId}/announcements`,
    );
    assert.equal(visible.response.status, 200);
    const publicAnnouncement = visible.payload?.data.find((item) => item.id === announcementId);
    assert.equal(publicAnnouncement?.title, title);
    assert.equal(publicAnnouncement?.isPinned, true);

    const unpublished = await request<{ publishedAt: string | null }>(
      `/author/announcements/${announcementId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          title,
          content: '这条公告已重新转为草稿。',
          isPinned: false,
          action: 'save',
        }),
      },
    );
    assert.equal(unpublished.response.status, 200);
    assert.equal(unpublished.payload?.data.publishedAt, null);

    const hiddenAgain = await request<Array<{ id: string }>>(`/novels/${novelId}/announcements`);
    assert.equal(hiddenAgain.payload?.data.some((item) => item.id === announcementId), false);

    const deleted = await request<{ deletedId: string }>(
      `/author/announcements/${announcementId}`,
      { method: 'DELETE' },
    );
    assert.equal(deleted.response.status, 200);
    assert.equal(deleted.payload?.data.deletedId, announcementId);
    announcementId = '';
  });
});
