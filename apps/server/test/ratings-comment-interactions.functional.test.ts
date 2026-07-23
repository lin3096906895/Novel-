import { PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const API_BASE = process.env.NOVEL_API_BASE_URL ?? 'http://localhost:3000/api';
const novelId = 'seed_novel_star_pact';
const prisma = new PrismaClient();

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

interface RatingSummary {
  average: number;
  count: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  myScore: number | null;
}

interface CommentRecord {
  id: string;
  parentId?: string | null;
  content: string | null;
  isDeleted: boolean;
  isLiked: boolean;
  likeCount: number;
  replies: CommentRecord[];
}

interface PaginatedComments {
  items: CommentRecord[];
  pagination: { total: number };
}

let token = '';
let userId = '';
let rootCommentId = '';
let replyCommentId = '';
let originalRating: Awaited<ReturnType<typeof prisma.novelRating.findUnique>>;
const marker = `评分评论交互回归 ${Date.now()}`;

async function request<T>(path: string, init: RequestInit = {}, activeToken?: string) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => undefined)) as ApiResponse<T> | undefined;
  return { response, payload };
}

describe('novel ratings and ordinary comment interactions HTTP flow', () => {
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

    originalRating = await prisma.novelRating.findUnique({
      where: { userId_novelId: { userId, novelId } },
    });
    await prisma.novelRating.deleteMany({ where: { userId, novelId } });
  });

  after(async () => {
    if (rootCommentId) {
      await prisma.comment.deleteMany({ where: { id: rootCommentId } });
    }
    await prisma.comment.deleteMany({ where: { content: { contains: marker } } });
    await prisma.novelRating.deleteMany({ where: { userId, novelId } });
    if (originalRating) {
      await prisma.novelRating.create({
        data: {
          id: originalRating.id,
          userId: originalRating.userId,
          novelId: originalRating.novelId,
          score: originalRating.score,
          createdAt: originalRating.createdAt,
          updatedAt: originalRating.updatedAt,
        },
      });
    }
    await prisma.$disconnect();
  });

  it('saves, updates and removes a viewer-aware rating', async () => {
    const anonymous = await request<RatingSummary>(`/novels/${novelId}/rating`);
    assert.equal(anonymous.response.status, 200);
    assert.equal(anonymous.payload?.data.myScore, null);
    const baselineCount = anonymous.payload?.data.count ?? 0;
    const baselineFourStar = anonymous.payload?.data.distribution['4'] ?? 0;

    const saved = await request<RatingSummary>(
      `/novels/${novelId}/rating`,
      { method: 'PUT', body: JSON.stringify({ score: 4 }) },
      token,
    );
    assert.equal(saved.response.status, 200);
    assert.equal(saved.payload?.data.myScore, 4);
    assert.equal(saved.payload?.data.count, baselineCount + 1);
    assert.equal(saved.payload?.data.distribution['4'], baselineFourStar + 1);

    const updated = await request<RatingSummary>(
      `/novels/${novelId}/rating`,
      { method: 'PUT', body: JSON.stringify({ score: 2 }) },
      token,
    );
    assert.equal(updated.response.status, 200);
    assert.equal(updated.payload?.data.myScore, 2);
    assert.equal(updated.payload?.data.count, baselineCount + 1);
    assert.equal(updated.payload?.data.distribution['4'], baselineFourStar);

    const removed = await request<RatingSummary>(
      `/novels/${novelId}/rating`,
      { method: 'DELETE' },
      token,
    );
    assert.equal(removed.response.status, 200);
    assert.equal(removed.payload?.data.myScore, null);
    assert.equal(removed.payload?.data.count, baselineCount);
  });

  it('supports one-level replies, likes and a preserved deleted root', async () => {
    const root = await request<CommentRecord>(
      `/novels/${novelId}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ content: `${marker} 根评论` }),
      },
      token,
    );
    assert.equal(root.response.status, 201);
    rootCommentId = root.payload?.data.id ?? '';
    assert.ok(rootCommentId);
    assert.equal(root.payload?.data.replies.length, 0);

    const reply = await request<CommentRecord>(
      `/novels/${novelId}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ content: `${marker} 一级回复`, parentId: rootCommentId }),
      },
      token,
    );
    assert.equal(reply.response.status, 201);
    replyCommentId = reply.payload?.data.id ?? '';
    assert.ok(replyCommentId);
    assert.equal(reply.payload?.data.parentId, rootCommentId);

    const nestedReply = await request(
      `/novels/${novelId}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ content: `${marker} 非法二级回复`, parentId: replyCommentId }),
      },
      token,
    );
    assert.equal(nestedReply.response.status, 400);

    const likedRoot = await request<{ commentId: string; isLiked: boolean; likeCount: number }>(
      `/comments/${rootCommentId}/like`,
      { method: 'PUT' },
      token,
    );
    assert.equal(likedRoot.response.status, 200);
    assert.equal(likedRoot.payload?.data.isLiked, true);
    assert.equal(likedRoot.payload?.data.likeCount, 1);

    const likedReply = await request<{ isLiked: boolean; likeCount: number }>(
      `/comments/${replyCommentId}/like`,
      { method: 'PUT' },
      token,
    );
    assert.equal(likedReply.response.status, 200);
    assert.equal(likedReply.payload?.data.isLiked, true);

    const authenticatedList = await request<PaginatedComments>(
      `/novels/${novelId}/comments?pageSize=50`,
      {},
      token,
    );
    const listedRoot = authenticatedList.payload?.data.items.find(
      (comment) => comment.id === rootCommentId,
    );
    assert.equal(listedRoot?.isLiked, true);
    assert.equal(listedRoot?.replies[0]?.id, replyCommentId);
    assert.equal(listedRoot?.replies[0]?.isLiked, true);

    const unlikedRoot = await request<{ isLiked: boolean; likeCount: number }>(
      `/comments/${rootCommentId}/like`,
      { method: 'DELETE' },
      token,
    );
    assert.equal(unlikedRoot.response.status, 200);
    assert.equal(unlikedRoot.payload?.data.isLiked, false);
    assert.equal(unlikedRoot.payload?.data.likeCount, 0);

    const removed = await request<{ deleted: boolean; softDeleted: boolean }>(
      `/me/comments/${rootCommentId}`,
      { method: 'DELETE' },
      token,
    );
    assert.equal(removed.response.status, 200);
    assert.equal(removed.payload?.data.deleted, true);
    assert.equal(removed.payload?.data.softDeleted, true);

    const deletedList = await request<PaginatedComments>(
      `/novels/${novelId}/comments?pageSize=50`,
      {},
      token,
    );
    const deletedRoot = deletedList.payload?.data.items.find(
      (comment) => comment.id === rootCommentId,
    );
    assert.equal(deletedRoot?.isDeleted, true);
    assert.equal(deletedRoot?.content, null);
    assert.equal(deletedRoot?.isLiked, false);
    assert.equal(deletedRoot?.replies[0]?.id, replyCommentId);
    assert.equal(deletedRoot?.replies[0]?.content, `${marker} 一级回复`);
  });
});
