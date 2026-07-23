import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { after, before, describe, it } from 'node:test';

const API_BASE = process.env.NOVEL_API_BASE_URL ?? 'http://localhost:3000/api';

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

let token = '';
let currentUserId = '';
const prisma = new PrismaClient();

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

describe('admin management HTTP flow', () => {
  after(async () => {
    await prisma.$disconnect();
  });

  before(async () => {
    const health = await fetch(`${API_BASE}/health`);
    assert.equal(health.ok, true, 'server must be running before functional tests');

    const login = await request<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@novel.local', password: 'Admin123456' }),
    });
    assert.equal(login.response.status, 201);
    assert.ok(login.payload?.data.accessToken);
    token = login.payload.data.accessToken;

    const me = await request<{ id: string; role: string }>('/auth/me');
    assert.equal(me.response.status, 200);
    assert.equal(me.payload?.data.role, 'ADMIN');
    currentUserId = me.payload.data.id;
  });

  it('lists novels and loads the first novel detail', async () => {
    const list = await request<{
      items: Array<{ id: string; title: string }>;
      pagination: { total: number };
    }>('/admin/novels?page=1&pageSize=1&sort=popular');

    assert.equal(list.response.status, 200);
    assert.ok(list.payload);
    assert.ok(list.payload.data.pagination.total >= 1);
    assert.ok(list.payload.data.items[0]?.id);

    const detail = await request<{
      id: string;
      title: string;
      chapters: unknown[];
      comments: unknown[];
      reviewLogs: unknown[];
    }>(`/admin/novels/${list.payload.data.items[0].id}`);

    assert.equal(detail.response.status, 200);
    assert.equal(detail.payload?.data.id, list.payload.data.items[0].id);
    assert.equal(Array.isArray(detail.payload.data.chapters), true);
    assert.equal(Array.isArray(detail.payload.data.comments), true);
    assert.equal(Array.isArray(detail.payload.data.reviewLogs), true);
  });

  it('lists users and loads the first user detail', async () => {
    const list = await request<{
      items: Array<{ id: string; email: string }>;
      pagination: { total: number };
    }>('/admin/users?page=1&pageSize=1');

    assert.equal(list.response.status, 200);
    assert.ok(list.payload);
    assert.ok(list.payload.data.pagination.total >= 1);
    assert.ok(list.payload.data.items[0]?.id);

    const detail = await request<{
      id: string;
      email: string;
      novels: unknown[];
      bookshelfItems: unknown[];
      readingHistories: unknown[];
      comments: unknown[];
    }>(`/admin/users/${list.payload.data.items[0].id}`);

    assert.equal(detail.response.status, 200);
    assert.equal(detail.payload?.data.id, list.payload.data.items[0].id);
    assert.equal(Array.isArray(detail.payload.data.novels), true);
    assert.equal(Array.isArray(detail.payload.data.bookshelfItems), true);
    assert.equal(Array.isArray(detail.payload.data.readingHistories), true);
    assert.equal(Array.isArray(detail.payload.data.comments), true);
  });

  it('rejects removing the current admin role', async () => {
    const demotion = await request(`/admin/users/${currentUserId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'READER' }),
    });

    assert.equal(demotion.response.status, 400);
    assert.match(demotion.payload?.message ?? '', /不能移除自己的管理员权限/);
  });

  it('rejects suspending the current admin account', async () => {
    const suspension = await request(`/admin/users/${currentUserId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'SUSPENDED', reason: '测试封禁' }),
    });

    assert.equal(suspension.response.status, 400);
    assert.match(suspension.payload?.message ?? '', /不能封禁当前登录的管理员账号/);
  });

  it('batch reviews pending novels and returns a per-item result', async () => {
    const marker = `批量审核回归${Date.now()}`;
    const novelIds = [`functional_batch_novel_${Date.now()}_1`, `functional_batch_novel_${Date.now()}_2`];
    const author = await prisma.user.findUniqueOrThrow({ where: { email: 'author@novel.local' } });
    const category = await prisma.category.findUniqueOrThrow({ where: { name: '科幻' } });

    try {
      await prisma.novel.createMany({
        data: novelIds.map((id, index) => ({
          id,
          title: `${marker}-${index + 1}`,
          summary: '用于验证管理端批量审核接口的功能测试作品。',
          status: 'REVIEWING',
          authorId: author.id,
          categoryId: category.id,
        })),
      });

      const queue = await request<{
        items: Array<{ id: string; title: string }>;
        pagination: { page: number; pageSize: number; total: number };
      }>(
        `/admin/reviews/queue?targetType=novel&page=1&pageSize=1&keyword=${encodeURIComponent(marker)}`,
      );
      assert.equal(queue.response.status, 200);
      assert.equal(queue.payload?.data.pagination.total, 2);
      assert.equal(queue.payload?.data.items.length, 1);

      const detailBefore = await request<{
        id: string;
        title: string;
        chapters: unknown[];
        reviewLogs: unknown[];
      }>(`/admin/reviews/novels/${novelIds[0]}`);
      assert.equal(detailBefore.response.status, 200);
      assert.equal(detailBefore.payload?.data.id, novelIds[0]);
      assert.equal(detailBefore.payload?.data.chapters.length, 0);
      assert.equal(detailBefore.payload?.data.reviewLogs.length, 0);

      const reviewed = await request<{
        total: number;
        succeeded: number;
        failed: number;
        items: Array<{ id: string; success: boolean; error?: string }>;
      }>('/admin/reviews/batch', {
        method: 'PATCH',
        body: JSON.stringify({
          targetType: 'novel',
          ids: [...novelIds, 'functional_batch_missing'],
          action: 'reject',
          reason: '批量审核功能回归',
        }),
      });

      assert.equal(reviewed.response.status, 200);
      assert.equal(reviewed.payload?.data.total, 3);
      assert.equal(reviewed.payload?.data.succeeded, 2);
      assert.equal(reviewed.payload?.data.failed, 1);
      assert.equal(
        reviewed.payload?.data.items.find((item) => item.id === 'functional_batch_missing')
          ?.success,
        false,
      );

      const novels = await prisma.novel.findMany({
        where: { id: { in: novelIds } },
        select: { id: true, status: true },
      });
      assert.equal(novels.every((novel) => novel.status === 'REJECTED'), true);
      assert.equal(
        await prisma.reviewLog.count({ where: { targetType: 'novel', targetId: { in: novelIds } } }),
        2,
      );
      assert.equal(
        await prisma.adminAuditLog.count({
          where: { action: 'review.novel.reject', targetId: { in: novelIds } },
        }),
        2,
      );

      const detailAfter = await request<{
        status: string;
        reviewLogs: Array<{ action: string; reason?: string | null }>;
      }>(`/admin/reviews/novels/${novelIds[0]}`);
      assert.equal(detailAfter.payload?.data.status, 'REJECTED');
      assert.equal(detailAfter.payload?.data.reviewLogs[0]?.action, 'reject');
      assert.equal(detailAfter.payload?.data.reviewLogs[0]?.reason, '批量审核功能回归');
    } finally {
      await prisma.adminAuditLog.deleteMany({ where: { targetId: { in: novelIds } } });
      await prisma.reviewLog.deleteMany({ where: { targetId: { in: novelIds } } });
      await prisma.notification.deleteMany({
        where: { userId: author.id, content: { contains: marker } },
      });
      await prisma.novel.deleteMany({ where: { id: { in: novelIds } } });
    }
  });

  it('batch deletes comments and preserves per-item audit records', async () => {
    const marker = `批量评论删除回归${Date.now()}`;
    const commentIds = [`functional_batch_comment_${Date.now()}_1`, `functional_batch_comment_${Date.now()}_2`];
    try {
      await prisma.comment.createMany({
        data: commentIds.map((id, index) => ({
          id,
          userId: currentUserId,
          novelId: 'seed_novel_star_pact',
          content: `${marker}-${index + 1}`,
        })),
      });

      const deleted = await request<{
        total: number;
        succeeded: number;
        failed: number;
        items: Array<{ id: string; success: boolean; error?: string }>;
      }>('/admin/comments', {
        method: 'DELETE',
        body: JSON.stringify({ ids: [...commentIds, 'functional_batch_comment_missing'] }),
      });

      assert.equal(deleted.response.status, 200);
      assert.equal(deleted.payload?.data.succeeded, 2);
      assert.equal(deleted.payload?.data.failed, 1);
      assert.equal(await prisma.comment.count({ where: { id: { in: commentIds } } }), 0);
      assert.equal(
        await prisma.adminAuditLog.count({
          where: { action: 'comment.delete', targetId: { in: commentIds } },
        }),
        2,
      );
    } finally {
      await prisma.adminAuditLog.deleteMany({ where: { targetId: { in: commentIds } } });
      await prisma.comment.deleteMany({ where: { id: { in: commentIds } } });
    }
  });

  it('suspends a user, invalidates their token, and restores access after unblocking', async () => {
    const authorLogin = await request<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'author@novel.local', password: 'Admin123456' }),
    });
    assert.equal(authorLogin.response.status, 201);
    assert.ok(authorLogin.payload?.data.accessToken);
    const authorToken = authorLogin.payload.data.accessToken;

    const users = await request<{
      items: Array<{ id: string; email: string }>;
    }>('/admin/users?keyword=author%40novel.local&page=1&pageSize=5');
    assert.equal(users.response.status, 200);
    const author = users.payload?.data.items.find((item) => item.email === 'author@novel.local');
    assert.ok(author?.id);

    try {
      const suspension = await request<{
        status: string;
        suspensionReason?: string;
      }>(`/admin/users/${author.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'SUSPENDED', reason: '功能测试临时封禁' }),
      });
      assert.equal(suspension.response.status, 200);
      assert.equal(suspension.payload?.data.status, 'SUSPENDED');
      assert.equal(suspension.payload?.data.suspensionReason, '功能测试临时封禁');

      const oldSession = await request('/auth/me', {
        headers: { Authorization: `Bearer ${authorToken}` },
      });
      assert.equal(oldSession.response.status, 401);
      assert.match(oldSession.payload?.message ?? '', /账号已被封禁/);

      const blockedLogin = await request('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'author@novel.local', password: 'Admin123456' }),
      });
      assert.equal(blockedLogin.response.status, 401);
      assert.match(blockedLogin.payload?.message ?? '', /功能测试临时封禁/);

      const filtered = await request<{
        items: Array<{ id: string; status: string }>;
      }>('/admin/users?status=SUSPENDED&page=1&pageSize=20');
      assert.equal(filtered.response.status, 200);
      assert.equal(filtered.payload?.data.items.some((item) => item.id === author.id), true);
    } finally {
      const restore = await request(`/admin/users/${author.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'ACTIVE' }),
      });
      assert.equal(restore.response.status, 200);
    }

    const restoredLogin = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'author@novel.local', password: 'Admin123456' }),
    });
    assert.equal(restoredLogin.response.status, 201);

    const logs = await request<{
      items: Array<{ action: string; targetId: string }>;
    }>('/admin/audit-logs?action=user.status.update&targetType=user&pageSize=5');
    assert.equal(logs.response.status, 200);
    assert.equal(logs.payload?.data.items.some((item) => item.targetId === author.id), true);
  });

  it('saves and submits novel and chapter drafts', async () => {
    const authorLogin = await request<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'author@novel.local', password: 'Admin123456' }),
    });
    assert.equal(authorLogin.response.status, 201);
    assert.ok(authorLogin.payload?.data.accessToken);
    const authorToken = authorLogin.payload.data.accessToken;
    const authorHeaders = { Authorization: `Bearer ${authorToken}` };

    const categories = await request<Array<{ id: string }>>('/categories');
    assert.equal(categories.response.status, 200);
    const categoryId = categories.payload?.data[0]?.id;
    assert.ok(categoryId);

    const suffix = Date.now().toString();
    let novelId = '';
    let chapterId = '';
    try {
      const novelDraft = await request<{ id: string; status: string }>('/author/novels', {
        method: 'POST',
        headers: authorHeaders,
        body: JSON.stringify({
          title: `草稿作品${suffix}`,
          summary: '短简介',
          categoryId,
          action: 'save',
        }),
      });
      assert.equal(novelDraft.response.status, 201);
      assert.equal(novelDraft.payload?.data.status, 'DRAFT');
      novelId = novelDraft.payload?.data.id ?? '';
      assert.ok(novelId);

      const novelAutosave = await request<{ status: string }>(`/author/novels/${novelId}`, {
        method: 'PUT',
        headers: authorHeaders,
        body: JSON.stringify({
          title: `草稿作品${suffix}`,
          summary: '自动保存中的短简介',
          categoryId,
          action: 'save',
        }),
      });
      assert.equal(novelAutosave.response.status, 200);
      assert.equal(novelAutosave.payload?.data.status, 'DRAFT');

      const invalidNovelSubmit = await request(`/author/novels/${novelId}`, {
        method: 'PUT',
        headers: authorHeaders,
        body: JSON.stringify({
          title: `草稿作品${suffix}`,
          summary: '太短',
          categoryId,
          action: 'submit',
        }),
      });
      assert.equal(invalidNovelSubmit.response.status, 400);

      const novelSubmit = await request<{ status: string }>(`/author/novels/${novelId}`, {
        method: 'PUT',
        headers: authorHeaders,
        body: JSON.stringify({
          title: `草稿作品${suffix}`,
          summary: '这是一段已经满足审核提交长度要求的作品简介。',
          categoryId,
          action: 'submit',
        }),
      });
      assert.equal(novelSubmit.response.status, 200);
      assert.equal(novelSubmit.payload?.data.status, 'REVIEWING');

      const chapterDraft = await request<{ id: string; status: string }>(
        '/author/novels/seed_novel_star_pact/chapters',
        {
          method: 'POST',
          headers: authorHeaders,
          body: JSON.stringify({
            title: `草稿章节${suffix}`,
            content: '未写完',
            action: 'save',
          }),
        },
      );
      assert.equal(chapterDraft.response.status, 201);
      assert.equal(chapterDraft.payload?.data.status, 'DRAFT');
      chapterId = chapterDraft.payload?.data.id ?? '';
      assert.ok(chapterId);

      const chapterAutosave = await request<{ status: string }>(`/author/chapters/${chapterId}`, {
        method: 'PUT',
        headers: authorHeaders,
        body: JSON.stringify({
          title: `草稿章节${suffix}`,
          content: '继续写了一点',
          action: 'save',
        }),
      });
      assert.equal(chapterAutosave.response.status, 200);
      assert.equal(chapterAutosave.payload?.data.status, 'DRAFT');

      const invalidChapterSubmit = await request(`/author/chapters/${chapterId}`, {
        method: 'PUT',
        headers: authorHeaders,
        body: JSON.stringify({
          title: `草稿章节${suffix}`,
          content: '太短',
          action: 'submit',
        }),
      });
      assert.equal(invalidChapterSubmit.response.status, 400);

      const chapterSubmit = await request<{ status: string }>(`/author/chapters/${chapterId}`, {
        method: 'PUT',
        headers: authorHeaders,
        body: JSON.stringify({
          title: `草稿章节${suffix}`,
          content: '这是已经补充完整并且满足二十个字审核要求的章节正文内容。',
          action: 'submit',
        }),
      });
      assert.equal(chapterSubmit.response.status, 200);
      assert.equal(chapterSubmit.payload?.data.status, 'REVIEWING');
    } finally {
      if (chapterId) {
        await prisma.chapter.deleteMany({ where: { id: chapterId } });
      }
      if (novelId) {
        await prisma.novel.deleteMany({ where: { id: novelId } });
      }
    }
  });

  it('reorders and batch deletes author chapter drafts', async () => {
    const authorLogin = await request<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'author@novel.local', password: 'Admin123456' }),
    });
    assert.equal(authorLogin.response.status, 201);
    assert.ok(authorLogin.payload?.data.accessToken);
    const authorHeaders = { Authorization: `Bearer ${authorLogin.payload.data.accessToken}` };

    const categories = await request<Array<{ id: string }>>('/categories');
    assert.equal(categories.response.status, 200);
    const categoryId = categories.payload?.data[0]?.id;
    assert.ok(categoryId);

    const suffix = Date.now().toString();
    let novelId = '';
    const chapterIds: string[] = [];
    try {
      const novelDraft = await request<{ id: string }>('/author/novels', {
        method: 'POST',
        headers: authorHeaders,
        body: JSON.stringify({
          title: `章节管理${suffix}`,
          summary: '管理测试',
          categoryId,
          action: 'save',
        }),
      });
      assert.equal(novelDraft.response.status, 201);
      novelId = novelDraft.payload?.data.id ?? '';
      assert.ok(novelId);

      for (let index = 1; index <= 3; index += 1) {
        const chapter = await request<{ id: string; orderIndex: number }>(
          `/author/novels/${novelId}/chapters`,
          {
            method: 'POST',
            headers: authorHeaders,
            body: JSON.stringify({
              title: `管理章节${index}`,
              content: `草稿${index}`,
              action: 'save',
            }),
          },
        );
        assert.equal(chapter.response.status, 201);
        assert.equal(chapter.payload?.data.orderIndex, index);
        chapterIds.push(chapter.payload?.data.id ?? '');
      }
      assert.equal(chapterIds.every(Boolean), true);

      const reorderedIds = [chapterIds[2], chapterIds[0], chapterIds[1]];
      const reordered = await request<Array<{ id: string; orderIndex: number }>>(
        `/author/novels/${novelId}/chapters/order`,
        {
          method: 'PUT',
          headers: authorHeaders,
          body: JSON.stringify({ chapterIds: reorderedIds }),
        },
      );
      assert.equal(reordered.response.status, 200);
      assert.deepEqual(
        reordered.payload?.data.map((chapter) => chapter.id),
        reorderedIds,
      );
      assert.deepEqual(
        reordered.payload?.data.map((chapter) => chapter.orderIndex),
        [1, 2, 3],
      );

      const batchDeleted = await request<{
        deletedCount: number;
        chapters: Array<{ id: string; orderIndex: number }>;
      }>(`/author/novels/${novelId}/chapters/batch-delete`, {
        method: 'POST',
        headers: authorHeaders,
        body: JSON.stringify({ chapterIds: [chapterIds[2], chapterIds[1]] }),
      });
      assert.equal(batchDeleted.response.status, 201);
      assert.equal(batchDeleted.payload?.data.deletedCount, 2);
      assert.equal(batchDeleted.payload?.data.chapters.length, 1);
      assert.equal(batchDeleted.payload?.data.chapters[0]?.id, chapterIds[0]);
      assert.equal(batchDeleted.payload?.data.chapters[0]?.orderIndex, 1);

      const singleDeleted = await request<{ chapters: unknown[] }>(
        `/author/chapters/${chapterIds[0]}`,
        {
          method: 'DELETE',
          headers: authorHeaders,
        },
      );
      assert.equal(singleDeleted.response.status, 200);
      assert.deepEqual(singleDeleted.payload?.data.chapters, []);
    } finally {
      if (novelId) {
        await prisma.chapter.deleteMany({ where: { novelId } });
        await prisma.novel.deleteMany({ where: { id: novelId } });
      }
    }
  });

  it('returns author dashboard overview and trends', async () => {
    const authorLogin = await request<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'author@novel.local', password: 'Admin123456' }),
    });
    assert.equal(authorLogin.response.status, 201);
    assert.ok(authorLogin.payload?.data.accessToken);

    const dashboard = await request<{
      periodDays: number;
      overview: { novels: number; chapters: number; publishedWords: number };
      trend: Array<{ date: string }>;
      novels: Array<{ id: string; title: string }>;
    }>('/author/dashboard?days=7', {
      headers: { Authorization: `Bearer ${authorLogin.payload.data.accessToken}` },
    });

    assert.equal(dashboard.response.status, 200);
    assert.equal(dashboard.payload?.data.periodDays, 7);
    assert.equal(dashboard.payload?.data.trend.length, 7);
    assert.ok((dashboard.payload?.data.overview.novels ?? 0) >= 2);
    assert.ok((dashboard.payload?.data.overview.chapters ?? 0) >= 3);
    assert.ok((dashboard.payload?.data.overview.publishedWords ?? 0) > 0);
    assert.equal(
      dashboard.payload?.data.novels.some((novel) => novel.id === 'seed_novel_star_pact'),
      true,
    );
  });

  it('updates profile, manages own comments, and receives notifications', async () => {
    const authorLogin = await request<{
      accessToken: string;
      user: { id: string; nickname: string };
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'author@novel.local', password: 'Admin123456' }),
    });
    assert.equal(authorLogin.response.status, 201);
    assert.ok(authorLogin.payload?.data.accessToken);
    const authorToken = authorLogin.payload.data.accessToken;
    const author = authorLogin.payload.data.user;
    const authorHeaders = { Authorization: `Bearer ${authorToken}` };
    const originalNickname = author.nickname;

    const suffix = Date.now().toString();
    const notificationIds: string[] = [];
    let adminCommentId = '';
    let authorCommentId = '';
    let novelId = '';
    try {
      const updatedProfile = await request<{ nickname: string }>('/auth/me', {
        method: 'PATCH',
        headers: authorHeaders,
        body: JSON.stringify({ nickname: `测试作者${suffix.slice(-4)}` }),
      });
      assert.equal(updatedProfile.response.status, 200);
      assert.equal(updatedProfile.payload?.data.nickname, `测试作者${suffix.slice(-4)}`);

      const authorComment = await request<{ id: string }>(
        '/novels/seed_novel_star_pact/comments',
        {
          method: 'POST',
          headers: authorHeaders,
          body: JSON.stringify({ content: `作者自评${suffix}` }),
        },
      );
      assert.equal(authorComment.response.status, 201);
      authorCommentId = authorComment.payload?.data.id ?? '';
      assert.ok(authorCommentId);

      const mine = await request<{ items: Array<{ id: string }> }>('/me/comments?page=1&pageSize=10', {
        headers: authorHeaders,
      });
      assert.equal(mine.response.status, 200);
      assert.equal(mine.payload?.data.items.some((comment) => comment.id === authorCommentId), true);

      const deletedMine = await request<{ deleted: boolean }>(`/me/comments/${authorCommentId}`, {
        method: 'DELETE',
        headers: authorHeaders,
      });
      assert.equal(deletedMine.response.status, 200);
      assert.equal(deletedMine.payload?.data.deleted, true);

      const adminComment = await request<{ id: string }>('/novels/seed_novel_star_pact/comments', {
        method: 'POST',
        body: JSON.stringify({ content: `管理员评论${suffix}` }),
      });
      assert.equal(adminComment.response.status, 201);
      adminCommentId = adminComment.payload?.data.id ?? '';
      assert.ok(adminCommentId);

      const categories = await request<Array<{ id: string }>>('/categories');
      const categoryId = categories.payload?.data[0]?.id;
      assert.ok(categoryId);
      const submittedNovel = await request<{ id: string }>('/author/novels', {
        method: 'POST',
        headers: authorHeaders,
        body: JSON.stringify({
          title: `通知测试作品${suffix}`,
          summary: '这是一段满足审核要求并用于通知功能测试的作品简介。',
          categoryId,
          action: 'submit',
        }),
      });
      assert.equal(submittedNovel.response.status, 201);
      novelId = submittedNovel.payload?.data.id ?? '';
      assert.ok(novelId);

      const rejected = await request(`/admin/reviews/novels/${novelId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'reject', reason: '通知功能回归测试' }),
      });
      assert.equal(rejected.response.status, 200);

      const notifications = await request<{
        items: Array<{ id: string; type: string; isRead: boolean }>;
        unreadCount: number;
      }>('/notifications?unreadOnly=true&pageSize=20', { headers: authorHeaders });
      assert.equal(notifications.response.status, 200);
      assert.equal(notifications.payload?.data.items.some((item) => item.type === 'COMMENT'), true);
      assert.equal(notifications.payload?.data.items.some((item) => item.type === 'REVIEW'), true);
      notificationIds.push(...(notifications.payload?.data.items.map((item) => item.id) ?? []));

      const firstNotificationId = notifications.payload?.data.items[0]?.id;
      assert.ok(firstNotificationId);
      const marked = await request<{ isRead: boolean }>(
        `/notifications/${firstNotificationId}/read`,
        {
          method: 'PATCH',
          headers: authorHeaders,
        },
      );
      assert.equal(marked.response.status, 200);
      assert.equal(marked.payload?.data.isRead, true);

      const markedAll = await request<{ updatedCount: number }>('/notifications/read-all', {
        method: 'PATCH',
        headers: authorHeaders,
      });
      assert.equal(markedAll.response.status, 200);
      const afterRead = await request<{ unreadCount: number }>('/notifications?pageSize=20', {
        headers: authorHeaders,
      });
      assert.equal(afterRead.payload?.data.unreadCount, 0);
    } finally {
      await prisma.user.update({ where: { id: author.id }, data: { nickname: originalNickname } });
      if (adminCommentId) {
        await prisma.comment.deleteMany({ where: { id: adminCommentId } });
      }
      if (authorCommentId) {
        await prisma.comment.deleteMany({ where: { id: authorCommentId } });
      }
      if (notificationIds.length > 0) {
        await prisma.notification.deleteMany({ where: { id: { in: notificationIds } } });
      }
      if (novelId) {
        await prisma.reviewLog.deleteMany({ where: { targetType: 'novel', targetId: novelId } });
        await prisma.novel.deleteMany({ where: { id: novelId } });
      }
    }
  });

  it('deletes draft novels and manages serialization lifecycle', async () => {
    const authorLogin = await request<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'author@novel.local', password: 'Admin123456' }),
    });
    assert.equal(authorLogin.response.status, 201);
    assert.ok(authorLogin.payload?.data.accessToken);
    const authorHeaders = { Authorization: `Bearer ${authorLogin.payload.data.accessToken}` };

    const categories = await request<Array<{ id: string }>>('/categories');
    const categoryId = categories.payload?.data[0]?.id;
    assert.ok(categoryId);

    const suffix = Date.now().toString();
    let novelId = '';
    try {
      const novelDraft = await request<{ id: string }>('/author/novels', {
        method: 'POST',
        headers: authorHeaders,
        body: JSON.stringify({
          title: `待删除作品${suffix}`,
          summary: '待删除草稿',
          categoryId,
          action: 'save',
        }),
      });
      assert.equal(novelDraft.response.status, 201);
      novelId = novelDraft.payload?.data.id ?? '';
      assert.ok(novelId);

      const chapterDraft = await request<{ id: string }>(
        `/author/novels/${novelId}/chapters`,
        {
          method: 'POST',
          headers: authorHeaders,
          body: JSON.stringify({ title: '随作品删除的章节', content: '草稿', action: 'save' }),
        },
      );
      assert.equal(chapterDraft.response.status, 201);

      const invalidComplete = await request(`/author/novels/${novelId}/lifecycle`, {
        method: 'PATCH',
        headers: authorHeaders,
        body: JSON.stringify({ action: 'complete' }),
      });
      assert.equal(invalidComplete.response.status, 400);

      const deleted = await request<{ deletedId: string }>(`/author/novels/${novelId}`, {
        method: 'DELETE',
        headers: authorHeaders,
      });
      assert.equal(deleted.response.status, 200);
      assert.equal(deleted.payload?.data.deletedId, novelId);
      assert.equal(await prisma.novel.count({ where: { id: novelId } }), 0);
      assert.equal(await prisma.chapter.count({ where: { novelId } }), 0);

      const invalidDelete = await request('/author/novels/seed_novel_star_pact', {
        method: 'DELETE',
        headers: authorHeaders,
      });
      assert.equal(invalidDelete.response.status, 400);

      const completed = await request<{ status: string }>(
        '/author/novels/seed_novel_star_pact/lifecycle',
        {
          method: 'PATCH',
          headers: authorHeaders,
          body: JSON.stringify({ action: 'complete' }),
        },
      );
      assert.equal(completed.response.status, 200);
      assert.equal(completed.payload?.data.status, 'COMPLETED');

      const resumed = await request<{ status: string }>(
        '/author/novels/seed_novel_star_pact/lifecycle',
        {
          method: 'PATCH',
          headers: authorHeaders,
          body: JSON.stringify({ action: 'resume' }),
        },
      );
      assert.equal(resumed.response.status, 200);
      assert.equal(resumed.payload?.data.status, 'SERIALIZING');
    } finally {
      await prisma.novel.updateMany({
        where: { id: 'seed_novel_star_pact' },
        data: { status: 'SERIALIZING' },
      });
      if (novelId) {
        await prisma.chapter.deleteMany({ where: { novelId } });
        await prisma.novel.deleteMany({ where: { id: novelId } });
      }
    }
  });

  it('records recommendation updates in the admin audit log', async () => {
    const slot = await request<{
      id: string;
      items: Array<{ novel: { id: string } }>;
    }>('/admin/recommend-slots/home_featured');

    assert.equal(slot.response.status, 200);
    assert.ok(slot.payload);

    const update = await request('/admin/recommend-slots/home_featured/items', {
      method: 'PUT',
      body: JSON.stringify({
        novelIds: slot.payload.data.items.map((item) => item.novel.id),
      }),
    });
    assert.equal(update.response.status, 200);

    const logs = await request<{
      items: Array<{
        action: string;
        targetType: string;
        actor: { id: string };
        before?: unknown;
        after?: unknown;
      }>;
      pagination: { total: number };
    }>('/admin/audit-logs?action=recommend_slot.items.update&targetType=recommend_slot&pageSize=5');

    assert.equal(logs.response.status, 200);
    assert.ok(logs.payload);
    assert.ok(logs.payload.data.pagination.total >= 1);
    assert.equal(logs.payload.data.items[0]?.action, 'recommend_slot.items.update');
    assert.equal(logs.payload.data.items[0]?.targetType, 'recommend_slot');
    assert.equal(logs.payload.data.items[0]?.actor.id, currentUserId);
    assert.notEqual(logs.payload.data.items[0]?.before, undefined);
    assert.notEqual(logs.payload.data.items[0]?.after, undefined);
  });
});
