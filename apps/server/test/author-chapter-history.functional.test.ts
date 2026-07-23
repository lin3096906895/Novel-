import { ChapterVersionSource, PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const API_BASE = process.env.NOVEL_API_BASE_URL ?? 'http://localhost:3000/api';
const prisma = new PrismaClient();
let token = '';
let novelId = '';

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

describe('author chapter history and recycle bin HTTP flow', () => {
  before(async () => {
    const health = await fetch(`${API_BASE}/health`);
    assert.equal(health.ok, true, 'server must be running before functional tests');

    const login = await request<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'author@novel.local', password: 'Admin123456' }),
    });
    assert.equal(login.response.status, 201);
    token = login.payload?.data.accessToken ?? '';
    assert.ok(token);
  });

  after(async () => {
    if (novelId) {
      const chapters = await prisma.chapter.findMany({
        where: { novelId },
        select: { id: true },
      });
      const targetIds = [novelId, ...chapters.map((chapter) => chapter.id)];
      await prisma.reviewLog.deleteMany({ where: { targetId: { in: targetIds } } });
      await prisma.chapter.deleteMany({ where: { novelId } });
      await prisma.novelVolume.deleteMany({ where: { novelId } });
      await prisma.novel.deleteMany({ where: { id: novelId } });
    }
    await prisma.$disconnect();
  });

  it('snapshots, restores, recycles, restores from trash, and permanently deletes a chapter', async () => {
    const categories = await request<Array<{ id: string }>>('/categories');
    const categoryId = categories.payload?.data[0]?.id ?? '';
    assert.ok(categoryId);

    const novel = await request<{ id: string }>('/author/novels', {
      method: 'POST',
      body: JSON.stringify({
        title: `章节历史功能测试${Date.now()}`,
        summary: '章节历史与回收站功能测试草稿',
        categoryId,
        action: 'save',
      }),
    });
    assert.equal(novel.response.status, 201);
    novelId = novel.payload?.data.id ?? '';
    assert.ok(novelId);

    const first = await request<{ id: string; title: string }>(
      `/author/novels/${novelId}/chapters`,
      {
        method: 'POST',
        body: JSON.stringify({ title: '第一章 初稿', content: '最初的正文', action: 'save' }),
      },
    );
    const firstChapterId = first.payload?.data.id ?? '';
    assert.equal(first.response.status, 201);
    assert.ok(firstChapterId);

    const second = await request<{ id: string }>(`/author/novels/${novelId}/chapters`, {
      method: 'POST',
      body: JSON.stringify({ title: '第二章 草稿', content: '第二章正文', action: 'save' }),
    });
    assert.equal(second.response.status, 201);
    assert.ok(second.payload?.data.id);

    const manualSave = await request(`/author/chapters/${firstChapterId}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: '第一章 手动保存',
        content: '手动保存后的正文',
        action: 'save',
        saveSource: 'manual',
      }),
    });
    assert.equal(manualSave.response.status, 200);

    const afterManual = await request<
      Array<{ id: string; title: string; source: ChapterVersionSource }>
    >(`/author/chapters/${firstChapterId}/versions`);
    assert.equal(afterManual.response.status, 200);
    assert.equal(afterManual.payload?.data.length, 1);
    assert.equal(afterManual.payload?.data[0]?.title, '第一章 初稿');
    assert.equal(afterManual.payload?.data[0]?.source, ChapterVersionSource.MANUAL);
    const originalVersionId = afterManual.payload?.data[0]?.id ?? '';

    const firstAutosave = await request(`/author/chapters/${firstChapterId}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: '第一章 自动保存一',
        content: '第一次自动保存后的正文',
        action: 'save',
        saveSource: 'autosave',
      }),
    });
    assert.equal(firstAutosave.response.status, 200);

    const secondAutosave = await request(`/author/chapters/${firstChapterId}`, {
      method: 'PUT',
      body: JSON.stringify({
        title: '第一章 自动保存二',
        content: '第二次自动保存后的正文',
        action: 'save',
        saveSource: 'autosave',
      }),
    });
    assert.equal(secondAutosave.response.status, 200);

    const afterAutosaves = await request<Array<{ source: ChapterVersionSource }>>(
      `/author/chapters/${firstChapterId}/versions`,
    );
    assert.equal(afterAutosaves.payload?.data.length, 2);
    assert.equal(
      afterAutosaves.payload?.data.filter(
        (version) => version.source === ChapterVersionSource.AUTOSAVE,
      ).length,
      1,
    );

    const restoredVersion = await request<{ title: string; status: string }>(
      `/author/chapters/${firstChapterId}/versions/${originalVersionId}/restore`,
      { method: 'POST' },
    );
    assert.equal(restoredVersion.response.status, 201);
    assert.equal(restoredVersion.payload?.data.title, '第一章 初稿');
    assert.equal(restoredVersion.payload?.data.status, 'DRAFT');

    const deleted = await request<{ chapters: Array<{ id: string; orderIndex: number }> }>(
      `/author/chapters/${firstChapterId}`,
      { method: 'DELETE' },
    );
    assert.equal(deleted.response.status, 200);
    assert.equal(deleted.payload?.data.chapters.length, 1);
    assert.equal(deleted.payload?.data.chapters[0]?.orderIndex, 1);

    const trash = await request<
      Array<{ id: string; deletedAt: string; _count: { versions: number } }>
    >(`/author/novels/${novelId}/chapter-trash`);
    assert.equal(trash.response.status, 200);
    assert.equal(trash.payload?.data[0]?.id, firstChapterId);
    assert.ok(trash.payload?.data[0]?.deletedAt);
    assert.equal(trash.payload?.data[0]?._count.versions, 3);

    const restoredTrash = await request<{ id: string; orderIndex: number; deletedAt: null }>(
      `/author/chapters/${firstChapterId}/restore`,
      { method: 'POST' },
    );
    assert.equal(restoredTrash.response.status, 201);
    assert.equal(restoredTrash.payload?.data.orderIndex, 2);
    assert.equal(restoredTrash.payload?.data.deletedAt, null);

    await request(`/author/chapters/${firstChapterId}`, { method: 'DELETE' });
    const permanent = await request<{ deletedId: string }>(
      `/author/chapters/${firstChapterId}/permanent`,
      { method: 'DELETE' },
    );
    assert.equal(permanent.response.status, 200);
    assert.equal(permanent.payload?.data.deletedId, firstChapterId);

    const emptyTrash = await request<unknown[]>(`/author/novels/${novelId}/chapter-trash`);
    assert.deepEqual(emptyTrash.payload?.data, []);
    assert.equal(await prisma.chapterVersion.count({ where: { chapterId: firstChapterId } }), 0);
  });
});
