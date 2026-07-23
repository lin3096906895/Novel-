import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const API_BASE = process.env.NOVEL_API_BASE_URL ?? 'http://localhost:3000/api';
const prisma = new PrismaClient();
const suffix = Date.now().toString();
const novelTitle = `定时发布功能测试${suffix}`;
let authorToken = '';
let adminToken = '';
let authorId = '';
let novelId = '';
let chapterId = '';

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

describe('scheduled chapter publication HTTP flow', () => {
  before(async () => {
    const health = await fetch(`${API_BASE}/health`);
    assert.equal(health.ok, true, 'server must be running before functional tests');

    const authorLogin = await request<{
      accessToken: string;
      user: { id: string };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'author@novel.local', password: 'Admin123456' }),
    });
    authorToken = authorLogin.payload?.data.accessToken ?? '';
    authorId = authorLogin.payload?.data.user.id ?? '';
    assert.ok(authorToken);
    assert.ok(authorId);

    const adminLogin = await request<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@novel.local', password: 'Admin123456' }),
    });
    adminToken = adminLogin.payload?.data.accessToken ?? '';
    assert.ok(adminToken);
  });

  after(async () => {
    if (authorId) {
      await prisma.notification.deleteMany({
        where: {
          userId: authorId,
          content: { contains: novelTitle },
        },
      });
    }
    const targetIds = [novelId, chapterId].filter(Boolean);
    if (targetIds.length > 0) {
      await prisma.reviewLog.deleteMany({ where: { targetId: { in: targetIds } } });
      await prisma.adminAuditLog.deleteMany({ where: { targetId: { in: targetIds } } });
    }
    if (chapterId) {
      await prisma.chapter.deleteMany({ where: { id: chapterId } });
    }
    if (novelId) {
      await prisma.novelVolume.deleteMany({ where: { novelId } });
      await prisma.novel.deleteMany({ where: { id: novelId } });
    }
    await prisma.$disconnect();
  });

  it('keeps an approved chapter hidden until the background publisher releases it', async () => {
    const categories = await request<Array<{ id: string }>>('/categories');
    const categoryId = categories.payload?.data[0]?.id ?? '';
    assert.ok(categoryId);

    const novel = await request<{ id: string; status: string }>(
      '/author/novels',
      {
        method: 'POST',
        body: JSON.stringify({
          title: novelTitle,
          summary: '这是一部用于验证章节定时发布流程的完整测试作品。',
          categoryId,
          action: 'submit',
        }),
      },
      authorToken,
    );
    assert.equal(novel.response.status, 201);
    novelId = novel.payload?.data.id ?? '';
    assert.ok(novelId);

    const approvedNovel = await request<{ status: string }>(
      `/admin/reviews/novels/${novelId}`,
      { method: 'PATCH', body: JSON.stringify({ action: 'approve' }) },
      adminToken,
    );
    assert.equal(approvedNovel.response.status, 200);
    assert.equal(approvedNovel.payload?.data.status, 'SERIALIZING');

    const initialSchedule = new Date(Date.now() + 10 * 60_000).toISOString();
    const content = '定时发布章节正文需要满足审核长度，并在计划时间到达前保持对读者不可见。';
    const chapter = await request<{
      id: string;
      status: string;
      scheduledAt: string;
    }>(
      `/author/novels/${novelId}/chapters`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: '第一章 定时抵达',
          content,
          scheduledAt: initialSchedule,
          action: 'submit',
        }),
      },
      authorToken,
    );
    assert.equal(chapter.response.status, 201);
    chapterId = chapter.payload?.data.id ?? '';
    assert.ok(chapterId);

    const approvedChapter = await request<{
      status: string;
      scheduledAt: string;
      publishedAt: null;
    }>(
      `/admin/reviews/chapters/${chapterId}`,
      { method: 'PATCH', body: JSON.stringify({ action: 'approve' }) },
      adminToken,
    );
    assert.equal(approvedChapter.response.status, 200);
    assert.equal(approvedChapter.payload?.data.status, 'SCHEDULED');
    assert.equal(approvedChapter.payload?.data.publishedAt, null);

    const hiddenChapters = await request<Array<{ id: string }>>(
      `/novels/${novelId}/chapters`,
    );
    assert.equal(hiddenChapters.response.status, 200);
    assert.equal(hiddenChapters.payload?.data.some((item) => item.id === chapterId), false);

    const nearSchedule = new Date(Date.now() + 3000).toISOString();
    const rescheduled = await request<{ status: string; scheduledAt: string }>(
      `/author/chapters/${chapterId}/schedule`,
      {
        method: 'PATCH',
        body: JSON.stringify({ scheduledAt: nearSchedule }),
      },
      authorToken,
    );
    assert.equal(rescheduled.response.status, 200);
    assert.equal(rescheduled.payload?.data.status, 'SCHEDULED');

    const deadline = Date.now() + 12_000;
    let publicChapters: Array<{ id: string }> = [];
    while (Date.now() < deadline) {
      const list = await request<Array<{ id: string }>>(`/novels/${novelId}/chapters`);
      publicChapters = list.payload?.data ?? [];
      if (publicChapters.some((item) => item.id === chapterId)) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.equal(publicChapters.some((item) => item.id === chapterId), true);

    const authorNovels = await request<
      Array<{
        id: string;
        wordCount: number;
        chapters: Array<{ id: string; status: string; publishedAt: string | null }>;
      }>
    >('/author/novels', {}, authorToken);
    const publishedNovel = authorNovels.payload?.data.find((item) => item.id === novelId);
    const publishedChapter = publishedNovel?.chapters.find((item) => item.id === chapterId);
    assert.equal(publishedChapter?.status, 'PUBLISHED');
    assert.ok(publishedChapter?.publishedAt);
    assert.equal(publishedNovel?.wordCount, content.replace(/\s/g, '').length);

    const notifications = await request<{
      items: Array<{ title: string; content: string }>;
    }>('/notifications?page=1&pageSize=20', {}, authorToken);
    assert.equal(
      notifications.payload?.data.items.some(
        (item) => item.title === '定时章节已发布' && item.content.includes(novelTitle),
      ),
      true,
    );
  });
});
