import { PrismaClient } from '@prisma/client';
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

describe('author volume management HTTP flow', () => {
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

  it('creates, edits, reorders, assigns, and safely deletes volumes', async () => {
    const categories = await request<Array<{ id: string }>>('/categories');
    const categoryId = categories.payload?.data[0]?.id ?? '';
    assert.ok(categoryId);

    const createdNovel = await request<{
      id: string;
      volumes: Array<{ id: string; title: string; orderIndex: number }>;
    }>('/author/novels', {
      method: 'POST',
      body: JSON.stringify({
        title: `分卷功能测试${Date.now()}`,
        summary: '分卷功能测试草稿',
        categoryId,
        action: 'save',
      }),
    });
    assert.equal(createdNovel.response.status, 201);
    novelId = createdNovel.payload?.data.id ?? '';
    const defaultVolume = createdNovel.payload?.data.volumes[0];
    assert.ok(novelId);
    assert.equal(defaultVolume?.title, '正文');

    const secondVolume = await request<{
      id: string;
      title: string;
      description: string;
      orderIndex: number;
    }>(`/author/novels/${novelId}/volumes`, {
      method: 'POST',
      body: JSON.stringify({ title: '第二卷', description: '暗潮涌动' }),
    });
    assert.equal(secondVolume.response.status, 201);
    const secondVolumeId = secondVolume.payload?.data.id ?? '';
    assert.equal(secondVolume.payload?.data.orderIndex, 2);
    assert.ok(secondVolumeId);

    const updatedVolume = await request<{ title: string; description: string }>(
      `/author/volumes/${secondVolumeId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ title: '第二卷 暗潮', description: '新的冲突开始浮现' }),
      },
    );
    assert.equal(updatedVolume.response.status, 200);
    assert.equal(updatedVolume.payload?.data.title, '第二卷 暗潮');

    const reordered = await request<Array<{ id: string; orderIndex: number }>>(
      `/author/novels/${novelId}/volumes/order`,
      {
        method: 'PUT',
        body: JSON.stringify({ volumeIds: [secondVolumeId, defaultVolume?.id] }),
      },
    );
    assert.equal(reordered.response.status, 200);
    assert.deepEqual(
      reordered.payload?.data.map((volume) => [volume.id, volume.orderIndex]),
      [
        [secondVolumeId, 1],
        [defaultVolume?.id, 2],
      ],
    );

    const chapter = await request<{ id: string; volumeId: string }>(
      `/author/novels/${novelId}/chapters`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: '第一章 暗潮初现',
          content: '分卷功能测试章节草稿',
          volumeId: secondVolumeId,
          action: 'save',
        }),
      },
    );
    assert.equal(chapter.response.status, 201);
    const chapterId = chapter.payload?.data.id ?? '';
    assert.equal(chapter.payload?.data.volumeId, secondVolumeId);

    const assigned = await request<{ volumeId: string }>(
      `/author/chapters/${chapterId}/volume`,
      {
        method: 'PATCH',
        body: JSON.stringify({ volumeId: defaultVolume?.id }),
      },
    );
    assert.equal(assigned.response.status, 200);
    assert.equal(assigned.payload?.data.volumeId, defaultVolume?.id);

    const deletedSecond = await request(`/author/volumes/${secondVolumeId}`, {
      method: 'DELETE',
    });
    assert.equal(deletedSecond.response.status, 200);

    const protectedDefault = await request(`/author/volumes/${defaultVolume?.id}`, {
      method: 'DELETE',
    });
    assert.equal(protectedDefault.response.status, 400);
    assert.match(protectedDefault.payload?.message ?? '', /仍有章节/);

    const unassigned = await request<{ volumeId: null }>(
      `/author/chapters/${chapterId}/volume`,
      {
        method: 'PATCH',
        body: JSON.stringify({ volumeId: null }),
      },
    );
    assert.equal(unassigned.response.status, 200);
    assert.equal(unassigned.payload?.data.volumeId, null);

    const deletedDefault = await request(`/author/volumes/${defaultVolume?.id}`, {
      method: 'DELETE',
    });
    assert.equal(deletedDefault.response.status, 200);

    const novels = await request<
      Array<{
        id: string;
        volumes: unknown[];
        chapters: Array<{ id: string; volumeId: string | null }>;
      }>
    >('/author/novels');
    const currentNovel = novels.payload?.data.find((novel) => novel.id === novelId);
    assert.deepEqual(currentNovel?.volumes, []);
    assert.equal(currentNovel?.chapters[0]?.volumeId, null);
  });
});
