import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

const API_BASE = process.env.NOVEL_API_BASE_URL ?? 'http://localhost:3000/api';

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

const prisma = new PrismaClient();
let token = '';

async function request<T>(path: string, init: RequestInit = {}, activeToken = token) {
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

describe('taxonomy and content safety HTTP flow', () => {
  before(async () => {
    const health = await fetch(`${API_BASE}/health`);
    assert.equal(health.ok, true, 'server must be running before functional tests');
    const login = await request<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'admin@novel.local', password: 'Admin123456' }),
    });
    assert.equal(login.response.status, 201);
    token = login.payload!.data.accessToken;
  });

  after(async () => {
    await prisma.$disconnect();
  });

  it('manages channels, categories, and tags with usage-safe deletion', async () => {
    const suffix = Date.now();
    const code = `test_${suffix}`;
    const channelName = `测试频道${suffix}`;
    const categoryName = `测试分类${suffix}`;
    const tagName = `测试标签${suffix}`;
    const novelId = `taxonomy_novel_${suffix}`;
    let channelId = '';
    let categoryId = '';
    let tagId = '';
    const auditTargetIds: string[] = [];

    try {
      const channel = await request<{ id: string; code: string }>('/admin/taxonomy/channels', {
        method: 'POST',
        body: JSON.stringify({ code, name: channelName, sortOrder: 90 }),
      });
      assert.equal(channel.response.status, 201);
      assert.equal(channel.payload?.data.code, code);
      channelId = channel.payload!.data.id;
      auditTargetIds.push(channelId);

      const category = await request<{ id: string }>('/admin/taxonomy/categories', {
        method: 'POST',
        body: JSON.stringify({ name: categoryName, channel: code, sortOrder: 91 }),
      });
      assert.equal(category.response.status, 201);
      categoryId = category.payload!.data.id;
      auditTargetIds.push(categoryId);

      const tag = await request<{ id: string }>('/admin/taxonomy/tags', {
        method: 'POST',
        body: JSON.stringify({ name: tagName, sortOrder: 92 }),
      });
      assert.equal(tag.response.status, 201);
      tagId = tag.payload!.data.id;
      auditTargetIds.push(tagId);

      const author = await prisma.user.findUniqueOrThrow({
        where: { email: 'author@novel.local' },
      });
      await prisma.novel.create({
        data: {
          id: novelId,
          title: `分类占用测试${suffix}`,
          summary: '用于验证分类与标签仍被作品使用时不能删除。',
          authorId: author.id,
          categoryId,
          tags: { connect: { id: tagId } },
        },
      });

      const categoryDeleteBlocked = await request(`/admin/taxonomy/categories/${categoryId}`, {
        method: 'DELETE',
      });
      assert.equal(categoryDeleteBlocked.response.status, 400);
      const tagDeleteBlocked = await request(`/admin/taxonomy/tags/${tagId}`, { method: 'DELETE' });
      assert.equal(tagDeleteBlocked.response.status, 400);
      const channelDeleteBlocked = await request(`/admin/taxonomy/channels/${channelId}`, {
        method: 'DELETE',
      });
      assert.equal(channelDeleteBlocked.response.status, 400);

      const overview = await request<{
        channels: Array<{ id: string; categoryCount: number }>;
        categories: Array<{ id: string; _count: { novels: number } }>;
        tags: Array<{ id: string; _count: { novels: number } }>;
      }>('/admin/taxonomy');
      assert.equal(overview.response.status, 200);
      assert.equal(
        overview.payload?.data.channels.find((item) => item.id === channelId)?.categoryCount,
        1,
      );
      assert.equal(
        overview.payload?.data.categories.find((item) => item.id === categoryId)?._count.novels,
        1,
      );
      assert.equal(overview.payload?.data.tags.find((item) => item.id === tagId)?._count.novels, 1);

      await prisma.novel.delete({ where: { id: novelId } });
      assert.equal(
        (await request(`/admin/taxonomy/tags/${tagId}`, { method: 'DELETE' })).response.status,
        200,
      );
      tagId = '';
      assert.equal(
        (await request(`/admin/taxonomy/categories/${categoryId}`, { method: 'DELETE' })).response
          .status,
        200,
      );
      categoryId = '';
      assert.equal(
        (await request(`/admin/taxonomy/channels/${channelId}`, { method: 'DELETE' })).response
          .status,
        200,
      );
      channelId = '';
    } finally {
      await prisma.novel.deleteMany({ where: { id: novelId } });
      await prisma.adminAuditLog.deleteMany({
        where: { targetId: { in: auditTargetIds } },
      });
      if (tagId) await prisma.tag.deleteMany({ where: { id: tagId } });
      if (categoryId) await prisma.category.deleteMany({ where: { id: categoryId } });
      if (channelId) await prisma.contentChannel.deleteMany({ where: { id: channelId } });
    }
  });

  it('takes down a reported chapter and suspends a reported user', async () => {
    const suffix = Date.now();
    const novelId = `safety_novel_${suffix}`;
    const chapterId = `safety_chapter_${suffix}`;
    const userId = `safety_user_${suffix}`;
    const userEmail = `safety-${suffix}@example.com`;
    const targetIds = [chapterId, userId];
    let userToken = '';

    try {
      const author = await prisma.user.findUniqueOrThrow({
        where: { email: 'author@novel.local' },
      });
      const category = await prisma.category.findFirstOrThrow();
      await prisma.novel.create({
        data: {
          id: novelId,
          title: `内容安全测试${suffix}`,
          summary: '用于验证章节举报下架和作品字数回扣。',
          status: 'SERIALIZING',
          wordCount: 1200,
          authorId: author.id,
          categoryId: category.id,
          chapters: {
            create: {
              id: chapterId,
              title: '待处置章节',
              content: '用于内容安全功能测试的章节正文。',
              orderIndex: 1,
              status: 'PUBLISHED',
              wordCount: 1200,
              publishedAt: new Date(),
            },
          },
        },
      });

      const chapterReport = await request<{ id: string }>('/content-reports/CHAPTER/' + chapterId, {
        method: 'POST',
        body: JSON.stringify({ reason: 'OTHER', detail: '章节内容违规' }),
      });
      assert.equal(chapterReport.response.status, 201);

      const reports = await request<{
        items: Array<{ id: string; targetId: string; status: string }>;
      }>(`/admin/content-reports?status=PENDING&keyword=${encodeURIComponent('待处置章节')}`);
      assert.equal(reports.response.status, 200);
      assert.equal(
        reports.payload?.data.items.some((item) => item.targetId === chapterId),
        true,
      );

      const restricted = await request(`/admin/content-reports/${chapterReport.payload!.data.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'restrict', note: '功能测试下架' }),
      });
      assert.equal(restricted.response.status, 200);
      const chapter = await prisma.chapter.findUniqueOrThrow({ where: { id: chapterId } });
      const novel = await prisma.novel.findUniqueOrThrow({ where: { id: novelId } });
      assert.equal(chapter.status, 'REJECTED');
      assert.equal(chapter.publishedAt, null);
      assert.equal(novel.wordCount, 0);
      assert.equal(
        await prisma.adminAuditLog.count({
          where: { action: 'content_report.restrict', targetId: chapterId },
        }),
        1,
      );
      assert.equal((await request(`/chapters/${chapterId}`, {}, '')).response.status, 404);

      await prisma.user.create({
        data: {
          id: userId,
          email: userEmail,
          nickname: '待处置用户',
          passwordHash: await hash('TempPass123', 12),
          emailVerifiedAt: new Date(),
        },
      });
      const userLogin = await request<{ accessToken: string }>(
        '/auth/login',
        { method: 'POST', body: JSON.stringify({ email: userEmail, password: 'TempPass123' }) },
        '',
      );
      assert.equal(userLogin.response.status, 201);
      userToken = userLogin.payload!.data.accessToken;

      const userReport = await request<{ id: string }>(`/content-reports/USER/${userId}`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'ABUSE', detail: '账号行为违规' }),
      });
      assert.equal(userReport.response.status, 201);
      const userRestricted = await request(
        `/admin/content-reports/${userReport.payload!.data.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ action: 'restrict', note: '功能测试封禁' }),
        },
      );
      assert.equal(userRestricted.response.status, 200);
      assert.equal((await request('/auth/me', {}, userToken)).response.status, 401);
      const suspended = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      assert.equal(suspended.status, 'SUSPENDED');
      assert.equal(suspended.suspensionReason, '功能测试封禁');
      assert.equal(
        await prisma.authSession.count({ where: { userId, revokedAt: { not: null } } }),
        1,
      );
    } finally {
      await prisma.adminAuditLog.deleteMany({ where: { targetId: { in: targetIds } } });
      await prisma.contentReport.deleteMany({ where: { targetId: { in: targetIds } } });
      await prisma.authSession.deleteMany({ where: { userId } });
      await prisma.loginActivity.deleteMany({ where: { userId } });
      await prisma.chapter.deleteMany({ where: { id: chapterId } });
      await prisma.novel.deleteMany({ where: { id: novelId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  });

  it('accepts a chapter appeal, restores publication, and exposes safety statistics', async () => {
    const suffix = Date.now();
    const novelId = `appeal_novel_${suffix}`;
    const chapterId = `appeal_chapter_${suffix}`;
    let appealId = '';
    let authorToken = '';

    try {
      const author = await prisma.user.findUniqueOrThrow({
        where: { email: 'author@novel.local' },
      });
      const category = await prisma.category.findFirstOrThrow();
      await prisma.novel.create({
        data: {
          id: novelId,
          title: `申诉恢复测试${suffix}`,
          summary: '用于验证内容安全申诉和章节恢复。',
          status: 'SERIALIZING',
          wordCount: 900,
          authorId: author.id,
          categoryId: category.id,
          chapters: {
            create: {
              id: chapterId,
              title: '申诉章节',
              content: '已经完成整改的章节正文。',
              orderIndex: 1,
              status: 'PUBLISHED',
              wordCount: 900,
              publishedAt: new Date('2026-07-20T10:00:00.000Z'),
            },
          },
        },
      });

      const report = await request<{ id: string }>(`/content-reports/CHAPTER/${chapterId}`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'OTHER', detail: '需要复核的章节内容' }),
      });
      assert.equal(report.response.status, 201);
      assert.equal(
        (
          await request(`/admin/content-reports/${report.payload!.data.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ action: 'restrict', note: '申诉流程功能测试' }),
          })
        ).response.status,
        200,
      );

      const authorLogin = await request<{ accessToken: string }>(
        '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({ email: 'author@novel.local', password: 'Admin123456' }),
        },
        '',
      );
      assert.equal(authorLogin.response.status, 201);
      authorToken = authorLogin.payload!.data.accessToken;

      const targets = await request<Array<{ targetId: string }>>(
        '/me/content-appeals/targets',
        {},
        authorToken,
      );
      assert.equal(targets.response.status, 200);
      assert.equal(
        targets.payload?.data.some((item) => item.targetId === chapterId),
        true,
      );

      const appeal = await request<{ id: string; status: string }>(
        `/content-appeals/CHAPTER/${chapterId}`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: '内容已经整改，请恢复章节。' }),
        },
        authorToken,
      );
      assert.equal(appeal.response.status, 201);
      assert.equal(appeal.payload?.data.status, 'PENDING');
      appealId = appeal.payload!.data.id;
      assert.equal(
        (
          await request(
            `/content-appeals/CHAPTER/${chapterId}`,
            { method: 'POST', body: JSON.stringify({ reason: '重复申诉' }) },
            authorToken,
          )
        ).response.status,
        400,
      );

      const adminAppeals = await request<{
        items: Array<{ id: string; targetId: string; status: string }>;
      }>('/admin/content-appeals?status=PENDING');
      assert.equal(adminAppeals.response.status, 200);
      assert.equal(
        adminAppeals.payload?.data.items.some((item) => item.id === appealId),
        true,
      );

      const stats = await request<{
        overview: { created: number; restricted: number };
        targetBreakdown: Array<{ targetType: string; count: number }>;
        trend: Array<{ date: string }>;
      }>('/admin/content-reports/stats?days=7');
      assert.equal(stats.response.status, 200);
      assert.equal((stats.payload?.data.overview.created ?? 0) >= 1, true);
      assert.equal((stats.payload?.data.overview.restricted ?? 0) >= 1, true);
      assert.equal(stats.payload?.data.trend.length, 7);
      assert.equal(
        (stats.payload?.data.targetBreakdown.find((item) => item.targetType === 'CHAPTER')?.count ??
          0) >= 1,
        true,
      );

      const approved = await request<{ status: string }>(`/admin/content-appeals/${appealId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'approve', note: '整改确认通过' }),
      });
      assert.equal(approved.response.status, 200);
      assert.equal(approved.payload?.data.status, 'APPROVED');

      const chapter = await prisma.chapter.findUniqueOrThrow({ where: { id: chapterId } });
      const novel = await prisma.novel.findUniqueOrThrow({ where: { id: novelId } });
      assert.equal(chapter.status, 'PUBLISHED');
      assert.equal(chapter.publishedAt?.toISOString(), '2026-07-20T10:00:00.000Z');
      assert.equal(novel.wordCount, 900);
      assert.equal(
        await prisma.adminAuditLog.count({
          where: { action: 'content_appeal.approve', targetId: chapterId },
        }),
        1,
      );
      assert.equal(
        (
          await request<Array<{ targetId: string }>>('/me/content-appeals/targets', {}, authorToken)
        ).payload?.data.some((item) => item.targetId === chapterId),
        false,
      );
    } finally {
      await prisma.contentAppeal.deleteMany({ where: { targetId: chapterId } });
      await prisma.adminAuditLog.deleteMany({ where: { targetId: chapterId } });
      await prisma.contentReport.deleteMany({ where: { targetId: chapterId } });
      await prisma.notification.deleteMany({
        where: { title: '内容申诉已通过', link: '/author', content: { contains: String(suffix) } },
      });
      await prisma.chapter.deleteMany({ where: { id: chapterId } });
      await prisma.novel.deleteMany({ where: { id: novelId } });
    }
  });
});
