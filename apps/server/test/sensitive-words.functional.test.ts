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
let adminToken = '';
let authorToken = '';
const sessionIds: string[] = [];
const ruleIds: string[] = [];
let commentId = '';
let chapterId = '';

async function request<T>(path: string, init: RequestInit = {}, token?: string) {
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

describe('sensitive word moderation HTTP flow', () => {
  before(async () => {
    const health = await fetch(`${API_BASE}/health`);
    assert.equal(health.ok, true, 'server must be running before functional tests');

    const adminLogin = await request<{ accessToken: string; sessionId: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@novel.local', password: 'Admin123456' }),
    });
    adminToken = adminLogin.payload?.data.accessToken ?? '';
    sessionIds.push(adminLogin.payload?.data.sessionId ?? '');
    assert.ok(adminToken);

    const authorLogin = await request<{ accessToken: string; sessionId: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'author@novel.local', password: 'Admin123456' }),
    });
    authorToken = authorLogin.payload?.data.accessToken ?? '';
    sessionIds.push(authorLogin.payload?.data.sessionId ?? '');
    assert.ok(authorToken);
  });

  after(async () => {
    if (commentId) {
      await prisma.comment.deleteMany({ where: { id: commentId } });
    }
    if (chapterId) {
      await prisma.chapter.deleteMany({ where: { id: chapterId } });
    }
    await prisma.sensitiveWordRule.deleteMany({ where: { id: { in: ruleIds } } });
    await prisma.loginActivity.deleteMany({ where: { sessionId: { in: sessionIds.filter(Boolean) } } });
    await prisma.authSession.deleteMany({ where: { id: { in: sessionIds.filter(Boolean) } } });
    await prisma.$disconnect();
  });

  it('manages rules and blocks comments and chapter submissions', async () => {
    const suffix = Date.now().toString();
    const commentTerm = `评论屏蔽词${suffix}`;
    const commentRule = await request<{ id: string; isEnabled: boolean }>(
      '/admin/sensitive-words',
      {
        method: 'POST',
        body: JSON.stringify({
          term: commentTerm,
          scope: 'COMMENT',
          note: '功能测试',
          isEnabled: true,
        }),
      },
      adminToken,
    );
    assert.equal(commentRule.response.status, 201);
    const commentRuleId = commentRule.payload?.data.id ?? '';
    ruleIds.push(commentRuleId);
    assert.ok(commentRuleId);

    const listed = await request<{
      items: Array<{ id: string; term: string }>;
      pagination: { total: number };
    }>(`/admin/sensitive-words?keyword=${encodeURIComponent(commentTerm)}`, {}, adminToken);
    assert.equal(listed.response.status, 200);
    assert.equal(listed.payload?.data.items.some((item) => item.id === commentRuleId), true);

    const blockedComment = await request(`/novels/${novelId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content: `这条评论包含${commentTerm}` }),
    }, authorToken);
    assert.equal(blockedComment.response.status, 400);
    assert.match(blockedComment.payload?.message ?? '', /内容包含不适宜词语/);

    const disabled = await request<{ isEnabled: boolean }>(
      `/admin/sensitive-words/${commentRuleId}`,
      { method: 'PATCH', body: JSON.stringify({ isEnabled: false }) },
      adminToken,
    );
    assert.equal(disabled.response.status, 200);
    assert.equal(disabled.payload?.data.isEnabled, false);

    const allowedComment = await request<{ id: string }>(
      `/novels/${novelId}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ content: `停用后允许${commentTerm}` }),
      },
      authorToken,
    );
    assert.equal(allowedComment.response.status, 201);
    commentId = allowedComment.payload?.data.id ?? '';
    assert.ok(commentId);

    const chapterTerm = `章节屏蔽词${suffix}`;
    const chapterRule = await request<{ id: string }>(
      '/admin/sensitive-words',
      {
        method: 'POST',
        body: JSON.stringify({ term: chapterTerm, scope: 'CHAPTER', isEnabled: true }),
      },
      adminToken,
    );
    const chapterRuleId = chapterRule.payload?.data.id ?? '';
    ruleIds.push(chapterRuleId);
    assert.ok(chapterRuleId);

    const chapterDraft = await request<{ id: string; status: string }>(
      `/author/novels/${novelId}/chapters`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: `测试章节${suffix}`,
          content: `草稿中暂时包含${chapterTerm}`,
          action: 'save',
        }),
      },
      authorToken,
    );
    assert.equal(chapterDraft.response.status, 201);
    assert.equal(chapterDraft.payload?.data.status, 'DRAFT');
    chapterId = chapterDraft.payload?.data.id ?? '';

    const blockedSubmission = await request(
      `/author/chapters/${chapterId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          title: `测试章节${suffix}`,
          content: `这是一段满足长度要求但包含${chapterTerm}并且不能提交审核的章节正文内容。`,
          action: 'submit',
        }),
      },
      authorToken,
    );
    assert.equal(blockedSubmission.response.status, 400);
    assert.match(blockedSubmission.payload?.message ?? '', /章节正文/);

    for (const ruleId of ruleIds) {
      const deleted = await request<{ deletedId: string }>(
        `/admin/sensitive-words/${ruleId}`,
        { method: 'DELETE' },
        adminToken,
      );
      assert.equal(deleted.response.status, 200);
    }
    ruleIds.length = 0;
  });
});
