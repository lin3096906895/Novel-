import { PrismaClient } from '@prisma/client';
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
let authorToken = '';
let userId = '';
let chapterId = '';
let chapterCommentId = '';
let reportedChapterCommentId = '';
let reportedNovelCommentId = '';
const commentReportIds: string[] = [];
let annotationId = '';
let paragraphCommentId = '';
let paragraphReplyId = '';
let reportedParagraphCommentId = '';
let paragraphReportId = '';
let updateChapterId = '';
const chapterCommentContent = `章节评论回归${Date.now()}`;
const reportedChapterCommentContent = `Chapter report regression ${Date.now()}`;
const reportedNovelCommentContent = `Novel report regression ${Date.now()}`;
const paragraphCommentContent = `Paragraph comment regression ${Date.now()}`;
const paragraphReplyContent = `Paragraph reply regression ${Date.now()}`;
const reportedParagraphCommentContent = `Reported paragraph comment ${Date.now()}`;
const updateChapterTitle = `追更回归章节${Date.now()}`;
let originalPreference: Awaited<ReturnType<typeof prisma.readingPreference.findUnique>>;
let originalHistory: Awaited<ReturnType<typeof prisma.readingHistory.findUnique>>;
let originalBookshelf: Awaited<ReturnType<typeof prisma.bookshelfItem.findUnique>>;
let originalChapterReads: Awaited<ReturnType<typeof prisma.chapterRead.findMany>>;

async function request<T>(path: string, init: RequestInit = {}, activeToken = token) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${activeToken}`,
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => undefined)) as ApiResponse<T> | undefined;
  return { response, payload };
}

describe('reading experience HTTP flow', () => {
  before(async () => {
    const health = await fetch(`${API_BASE}/health`);
    assert.equal(health.ok, true, 'server must be running before functional tests');

    const login = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@novel.local', password: 'Admin123456' }),
    });
    const loginPayload = (await login.json()) as ApiResponse<{
      accessToken: string;
      user: { id: string };
    }>;
    assert.equal(login.status, 201);
    token = loginPayload.data.accessToken;
    userId = loginPayload.data.user.id;

    const authorLogin = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'author@novel.local', password: 'Admin123456' }),
    });
    const authorLoginPayload = (await authorLogin.json()) as ApiResponse<{
      accessToken: string;
    }>;
    assert.equal(authorLogin.status, 201);
    authorToken = authorLoginPayload.data.accessToken;

    const chapters = await request<Array<{ id: string }>>('/novels/seed_novel_star_pact/chapters');
    chapterId = chapters.payload?.data[0]?.id ?? '';
    assert.ok(chapterId);

    originalPreference = await prisma.readingPreference.findUnique({ where: { userId } });
    originalHistory = await prisma.readingHistory.findUnique({
      where: { userId_novelId: { userId, novelId: 'seed_novel_star_pact' } },
    });
    originalBookshelf = await prisma.bookshelfItem.findUnique({
      where: { userId_novelId: { userId, novelId: 'seed_novel_star_pact' } },
    });
    originalChapterReads = await prisma.chapterRead.findMany({
      where: {
        userId,
        chapter: { novelId: 'seed_novel_star_pact' },
      },
    });
  });

  after(async () => {
    if (updateChapterId) {
      const updateChapter = await prisma.chapter.findUnique({
        where: { id: updateChapterId },
        select: { wordCount: true },
      });
      await prisma.notification.deleteMany({
        where: {
          OR: [
            { link: `/chapters/${updateChapterId}` },
            { content: { contains: updateChapterTitle } },
          ],
        },
      });
      await prisma.reviewLog.deleteMany({
        where: { targetType: 'chapter', targetId: updateChapterId },
      });
      await prisma.adminAuditLog.deleteMany({
        where: { targetType: 'chapter', targetId: updateChapterId },
      });
      await prisma.chapter.deleteMany({ where: { id: updateChapterId } });
      if (updateChapter) {
        await prisma.novel.update({
          where: { id: 'seed_novel_star_pact' },
          data: { wordCount: { decrement: updateChapter.wordCount } },
        });
      }
    }
    if (annotationId) {
      await prisma.readingAnnotation.deleteMany({ where: { id: annotationId } });
    }
    if (chapterCommentId) {
      await prisma.comment.deleteMany({ where: { id: chapterCommentId } });
    }
    if (reportedChapterCommentId) {
      await prisma.comment.deleteMany({ where: { id: reportedChapterCommentId } });
    }
    if (reportedNovelCommentId) {
      await prisma.comment.deleteMany({ where: { id: reportedNovelCommentId } });
    }
    if (commentReportIds.length > 0) {
      await prisma.adminAuditLog.deleteMany({ where: { targetId: { in: commentReportIds } } });
      await prisma.commentReport.deleteMany({ where: { id: { in: commentReportIds } } });
    }
    if (paragraphCommentId) {
      await prisma.paragraphComment.deleteMany({ where: { id: paragraphCommentId } });
    }
    if (reportedParagraphCommentId) {
      await prisma.paragraphComment.deleteMany({ where: { id: reportedParagraphCommentId } });
    }
    if (paragraphReportId) {
      await prisma.adminAuditLog.deleteMany({ where: { targetId: paragraphReportId } });
    }
    await prisma.notification.deleteMany({
      where: {
        link: `/chapters/${chapterId}`,
        content: { contains: chapterCommentContent },
      },
    });
    await prisma.notification.deleteMany({
      where: { content: { contains: reportedNovelCommentContent } },
    });
    await prisma.notification.deleteMany({
      where: { content: { contains: reportedChapterCommentContent } },
    });
    await prisma.notification.deleteMany({
      where: {
        link: `/chapters/${chapterId}?paragraph=0`,
        content: { contains: paragraphCommentContent },
      },
    });
    await prisma.notification.deleteMany({
      where: {
        link: `/chapters/${chapterId}?paragraph=0`,
        content: { contains: reportedParagraphCommentContent },
      },
    });
    await prisma.chapterBookmark.deleteMany({ where: { userId, chapterId } });
    if (originalPreference) {
      await prisma.readingPreference.upsert({
        where: { userId },
        update: {
          fontSize: originalPreference.fontSize,
          theme: originalPreference.theme,
          lineHeight: originalPreference.lineHeight,
          contentWidth: originalPreference.contentWidth,
        },
        create: originalPreference,
      });
    } else {
      await prisma.readingPreference.deleteMany({ where: { userId } });
    }
    if (originalHistory) {
      await prisma.readingHistory.upsert({
        where: { userId_novelId: { userId, novelId: originalHistory.novelId } },
        update: {
          chapterId: originalHistory.chapterId,
          progress: originalHistory.progress,
          readingSeconds: originalHistory.readingSeconds,
        },
        create: originalHistory,
      });
    } else {
      await prisma.readingHistory.deleteMany({
        where: { userId, novelId: 'seed_novel_star_pact' },
      });
    }
    if (originalBookshelf) {
      await prisma.bookshelfItem.update({
        where: { id: originalBookshelf.id },
        data: { notifyOnUpdate: originalBookshelf.notifyOnUpdate },
      });
    } else {
      await prisma.bookshelfItem.deleteMany({
        where: { userId, novelId: 'seed_novel_star_pact' },
      });
    }
    await prisma.chapterRead.deleteMany({
      where: {
        userId,
        chapter: { novelId: 'seed_novel_star_pact' },
      },
    });
    if (originalChapterReads.length > 0) {
      await prisma.chapterRead.createMany({ data: originalChapterReads });
    }
    await prisma.$disconnect();
  });

  it('saves and reloads account reading preferences', async () => {
    const saved = await request<{ fontSize: number; theme: string }>('/me/reading-preference', {
      method: 'PUT',
      body: JSON.stringify({
        fontSize: 21,
        theme: 'SEPIA',
        lineHeight: 2.2,
        contentWidth: 880,
      }),
    });
    assert.equal(saved.response.status, 200);
    assert.equal(saved.payload?.data.fontSize, 21);
    assert.equal(saved.payload?.data.theme, 'SEPIA');

    const loaded = await request<{ lineHeight: number; contentWidth: number }>(
      '/me/reading-preference',
    );
    assert.equal(loaded.response.status, 200);
    assert.equal(loaded.payload?.data.lineHeight, 2.2);
    assert.equal(loaded.payload?.data.contentWidth, 880);
  });

  it('adds, lists, checks, and removes a chapter bookmark', async () => {
    const added = await request<{ chapterId: string }>(`/chapters/${chapterId}/bookmark`, {
      method: 'POST',
    });
    assert.equal(added.response.status, 201);
    assert.equal(added.payload?.data.chapterId, chapterId);

    const checked = await request<{ chapterId: string } | null>(`/chapters/${chapterId}/bookmark`);
    assert.equal(checked.response.status, 200);
    assert.equal(checked.payload?.data?.chapterId, chapterId);

    const listed = await request<Array<{ chapterId: string }>>('/me/bookmarks');
    assert.equal(listed.response.status, 200);
    assert.equal(
      listed.payload?.data.some((bookmark) => bookmark.chapterId === chapterId),
      true,
    );

    const removed = await request<{ removed: boolean }>(`/chapters/${chapterId}/bookmark`, {
      method: 'DELETE',
    });
    assert.equal(removed.response.status, 200);
    assert.equal(removed.payload?.data.removed, true);
  });

  it('saves reading progress and reloads it for another device', async () => {
    const saved = await request<{ progress: number }>('/reading-histories', {
      method: 'PUT',
      body: JSON.stringify({
        novelId: 'seed_novel_star_pact',
        chapterId,
        progress: 37,
      }),
    });
    assert.equal(saved.response.status, 200);
    assert.equal(saved.payload?.data.progress, 37);

    const loaded = await request<{ chapterId: string; progress: number }>(
      '/novels/seed_novel_star_pact/reading-history',
    );
    assert.equal(loaded.response.status, 200);
    assert.equal(loaded.payload?.data.chapterId, chapterId);
    assert.equal(loaded.payload?.data.progress, 37);
  });

  it('increments active reading time without losing the current position', async () => {
    const beforeSeconds = originalHistory?.readingSeconds ?? 0;
    const saved = await request<{ progress: number; readingSeconds: number }>('/reading-sessions', {
      method: 'POST',
      body: JSON.stringify({
        novelId: 'seed_novel_star_pact',
        chapterId,
        progress: 37,
        seconds: 12,
      }),
    });
    assert.equal(saved.response.status, 201);
    assert.equal(saved.payload?.data.progress, 37);
    assert.equal(saved.payload?.data.readingSeconds, beforeSeconds + 12);
  });

  it('marks completed chapters and reports when the reader has caught up', async () => {
    const chapters = await request<Array<{ id: string }>>('/novels/seed_novel_star_pact/chapters');
    assert.equal(chapters.response.status, 200);
    assert.equal(chapters.payload?.data.length, 2);
    const [firstChapter, secondChapter] = chapters.payload?.data ?? [];
    assert.ok(firstChapter?.id);
    assert.ok(secondChapter?.id);

    const firstCompleted = await request<{ isChapterCompleted: boolean }>('/reading-histories', {
      method: 'PUT',
      body: JSON.stringify({
        novelId: 'seed_novel_star_pact',
        chapterId: firstChapter.id,
        progress: 100,
      }),
    });
    assert.equal(firstCompleted.response.status, 200);
    assert.equal(firstCompleted.payload?.data.isChapterCompleted, true);

    const inProgress = await request<{
      completedChapterIds: string[];
      completedCount: number;
      totalChapters: number;
      isCaughtUp: boolean;
    }>('/novels/seed_novel_star_pact/read-status');
    assert.equal(inProgress.response.status, 200);
    assert.equal(inProgress.payload?.data.completedChapterIds.includes(firstChapter.id), true);
    assert.equal(inProgress.payload?.data.completedCount, 1);
    assert.equal(inProgress.payload?.data.totalChapters, 2);
    assert.equal(inProgress.payload?.data.isCaughtUp, false);

    const secondCompleted = await request<{ isChapterCompleted: boolean }>('/reading-histories', {
      method: 'PUT',
      body: JSON.stringify({
        novelId: 'seed_novel_star_pact',
        chapterId: secondChapter.id,
        progress: 100,
      }),
    });
    assert.equal(secondCompleted.response.status, 200);
    assert.equal(secondCompleted.payload?.data.isChapterCompleted, true);

    const caughtUp = await request<{
      currentChapterId: string;
      currentProgress: number;
      completedCount: number;
      totalChapters: number;
      isCaughtUp: boolean;
    }>('/novels/seed_novel_star_pact/read-status');
    assert.equal(caughtUp.response.status, 200);
    assert.equal(caughtUp.payload?.data.currentChapterId, secondChapter.id);
    assert.equal(caughtUp.payload?.data.currentProgress, 100);
    assert.equal(caughtUp.payload?.data.completedCount, 2);
    assert.equal(caughtUp.payload?.data.totalChapters, 2);
    assert.equal(caughtUp.payload?.data.isCaughtUp, true);
  });

  it('uses completed chapter reads in the weekly popular ranking', async () => {
    await prisma.chapterRead.upsert({
      where: { userId_chapterId: { userId, chapterId } },
      update: { completedAt: new Date() },
      create: { userId, chapterId, completedAt: new Date() },
    });

    const ranking = await request<{
      type: string;
      period: string;
      periodLabel: string;
      startedAt: string | null;
      items: Array<{ score: number; novel: { id: string } }>;
    }>('/rankings?type=popular&period=week&limit=20');

    assert.equal(ranking.response.status, 200);
    assert.equal(ranking.payload?.data.type, 'popular');
    assert.equal(ranking.payload?.data.period, 'week');
    assert.equal(ranking.payload?.data.periodLabel, '周榜');
    assert.ok(ranking.payload?.data.startedAt);
    const seedNovel = ranking.payload?.data.items.find(
      (item) => item.novel.id === 'seed_novel_star_pact',
    );
    assert.ok(seedNovel);
    assert.ok(seedNovel.score >= 1);
  });

  it('shows new bookshelf chapters and sends one update notification after publishing', async () => {
    const added = await request<{ novelId: string }>('/novels/seed_novel_star_pact/bookshelf', {
      method: 'POST',
    });
    assert.equal(added.response.status, 201);
    assert.equal(added.payload?.data.novelId, 'seed_novel_star_pact');

    const muted = await request<{ novelId: string; notifyOnUpdate: boolean }>(
      '/novels/seed_novel_star_pact/bookshelf/notification',
      {
        method: 'PATCH',
        body: JSON.stringify({ enabled: false }),
      },
    );
    assert.equal(muted.response.status, 200);
    assert.equal(muted.payload?.data.notifyOnUpdate, false);

    const mutedBookshelf =
      await request<Array<{ novelId: string; notifyOnUpdate: boolean }>>('/me/bookshelf');
    assert.equal(
      mutedBookshelf.payload?.data.find((entry) => entry.novelId === 'seed_novel_star_pact')
        ?.notifyOnUpdate,
      false,
    );

    const enabled = await request<{ notifyOnUpdate: boolean }>(
      '/novels/seed_novel_star_pact/bookshelf/notification',
      {
        method: 'PATCH',
        body: JSON.stringify({ enabled: true }),
      },
    );
    assert.equal(enabled.response.status, 200);
    assert.equal(enabled.payload?.data.notifyOnUpdate, true);

    const history = await request('/reading-histories', {
      method: 'PUT',
      body: JSON.stringify({
        novelId: 'seed_novel_star_pact',
        chapterId,
        progress: 42,
      }),
    });
    assert.equal(history.response.status, 200);

    const created = await request<{ id: string; status: string }>(
      '/author/novels/seed_novel_star_pact/chapters',
      {
        method: 'POST',
        body: JSON.stringify({
          title: updateChapterTitle,
          content: '这是一段用于验证书架追更通知闭环的新章节正文，长度满足提交审核要求。',
          action: 'submit',
        }),
      },
      authorToken,
    );
    assert.equal(created.response.status, 201);
    assert.equal(created.payload?.data.status, 'REVIEWING');
    updateChapterId = created.payload?.data.id ?? '';
    assert.ok(updateChapterId);

    const approved = await request<{ status: string }>(
      `/admin/reviews/chapters/${updateChapterId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ action: 'approve' }),
      },
    );
    assert.equal(approved.response.status, 200);
    assert.equal(approved.payload?.data.status, 'PUBLISHED');

    const bookshelf = await request<
      Array<{
        novelId: string;
        latestChapter: { id: string } | null;
        continueChapter: { id: string } | null;
        readingProgress: number;
        unreadCount: number;
        hasUpdate: boolean;
        notifyOnUpdate: boolean;
      }>
    >('/me/bookshelf');
    assert.equal(bookshelf.response.status, 200);
    const item = bookshelf.payload?.data.find((entry) => entry.novelId === 'seed_novel_star_pact');
    assert.equal(item?.latestChapter?.id, updateChapterId);
    assert.equal(item?.continueChapter?.id, chapterId);
    assert.equal(item?.readingProgress, 42);
    assert.equal(item?.hasUpdate, true);
    assert.equal(item?.notifyOnUpdate, true);
    assert.ok((item?.unreadCount ?? 0) >= 1);

    const notifications = await request<{
      items: Array<{ id: string; type: string; link: string | null }>;
    }>('/notifications?pageSize=50');
    assert.equal(notifications.response.status, 200);
    const updates =
      notifications.payload?.data.items.filter(
        (item) => item.type === 'UPDATE' && item.link === `/chapters/${updateChapterId}`,
      ) ?? [];
    assert.equal(updates.length, 1);

    const filteredNotifications = await request<{
      items: Array<{ type: string; link: string | null }>;
    }>('/notifications?type=UPDATE&pageSize=50');
    assert.equal(filteredNotifications.response.status, 200);
    assert.equal(
      filteredNotifications.payload?.data.items.every((item) => item.type === 'UPDATE'),
      true,
    );
    assert.equal(
      filteredNotifications.payload?.data.items.some(
        (item) => item.link === `/chapters/${updateChapterId}`,
      ),
      true,
    );

    const invalidFilter = await request('/notifications?type=UNKNOWN');
    assert.equal(invalidFilter.response.status, 400);

    const repeated = await request(`/admin/reviews/chapters/${updateChapterId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'approve' }),
    });
    assert.equal(repeated.response.status, 400);

    const notificationCount = await prisma.notification.count({
      where: { userId, type: 'UPDATE', link: `/chapters/${updateChapterId}` },
    });
    assert.equal(notificationCount, 1);
  });

  it('creates chapter discussion without mixing it into novel reviews', async () => {
    const created = await request<{ id: string; chapterId: string }>(
      `/chapters/${chapterId}/comments`,
      {
        method: 'POST',
        body: JSON.stringify({ content: chapterCommentContent }),
      },
    );
    assert.equal(created.response.status, 201);
    chapterCommentId = created.payload?.data.id ?? '';
    assert.ok(chapterCommentId);
    assert.equal(created.payload?.data.chapterId, chapterId);

    const chapterComments = await request<{ items: Array<{ id: string }> }>(
      `/chapters/${chapterId}/comments?pageSize=20`,
    );
    assert.equal(chapterComments.response.status, 200);
    assert.equal(
      chapterComments.payload?.data.items.some((comment) => comment.id === chapterCommentId),
      true,
    );

    const novelReviews = await request<{ items: Array<{ id: string }> }>(
      '/novels/seed_novel_star_pact/comments?pageSize=20',
    );
    assert.equal(novelReviews.response.status, 200);
    assert.equal(
      novelReviews.payload?.data.items.some((comment) => comment.id === chapterCommentId),
      false,
    );

    const mine = await request<{
      items: Array<{ id: string; chapter?: { id: string } | null }>;
    }>('/me/comments?pageSize=20');
    const mineComment = mine.payload?.data.items.find((comment) => comment.id === chapterCommentId);
    assert.equal(mine.response.status, 200);
    assert.equal(mineComment?.chapter?.id, chapterId);

    const removed = await request<{ deleted: boolean }>(`/me/comments/${chapterCommentId}`, {
      method: 'DELETE',
    });
    assert.equal(removed.response.status, 200);
    assert.equal(removed.payload?.data.deleted, true);
    chapterCommentId = '';
  });

  it('reports novel and chapter comments and preserves moderation history', async () => {
    const chapterComment = await request<{ id: string }>(`/chapters/${chapterId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content: reportedChapterCommentContent }),
    });
    assert.equal(chapterComment.response.status, 201);
    reportedChapterCommentId = chapterComment.payload?.data.id ?? '';
    assert.ok(reportedChapterCommentId);

    const novelComment = await request<{ id: string }>('/novels/seed_novel_star_pact/comments', {
      method: 'POST',
      body: JSON.stringify({ content: reportedNovelCommentContent }),
    });
    assert.equal(novelComment.response.status, 201);
    reportedNovelCommentId = novelComment.payload?.data.id ?? '';
    assert.ok(reportedNovelCommentId);

    const chapterReport = await request<{ id: string }>(
      `/comments/${reportedChapterCommentId}/reports`,
      {
        method: 'POST',
        body: JSON.stringify({ reason: 'ABUSE', detail: 'Chapter comment report regression' }),
      },
      authorToken,
    );
    const novelReport = await request<{ id: string }>(
      `/comments/${reportedNovelCommentId}/reports`,
      {
        method: 'POST',
        body: JSON.stringify({ reason: 'SPAM', detail: 'Novel comment report regression' }),
      },
      authorToken,
    );
    assert.equal(chapterReport.response.status, 201);
    assert.equal(novelReport.response.status, 201);
    const chapterReportId = chapterReport.payload?.data.id ?? '';
    const novelReportId = novelReport.payload?.data.id ?? '';
    assert.ok(chapterReportId);
    assert.ok(novelReportId);
    commentReportIds.push(chapterReportId, novelReportId);

    const chapterQueue = await request<{
      items: Array<{ id: string; chapterId?: string | null }>;
      pagination: { total: number };
    }>('/admin/comment-reports?status=PENDING&source=CHAPTER&keyword=Chapter%20comment');
    assert.equal(chapterQueue.response.status, 200);
    assert.equal(chapterQueue.payload?.data.items.some((item) => item.id === chapterReportId), true);

    const removed = await request<{ succeeded: number; failed: number }>(
      '/admin/comment-reports/batch',
      {
        method: 'PATCH',
        body: JSON.stringify({
          ids: [chapterReportId, 'functional_comment_report_missing'],
          action: 'remove',
        }),
      },
    );
    assert.equal(removed.response.status, 200);
    assert.equal(removed.payload?.data.succeeded, 1);
    assert.equal(removed.payload?.data.failed, 1);

    const dismissed = await request<{ status: string }>(`/admin/comment-reports/${novelReportId}`, {
      method: 'PATCH',
      body: JSON.stringify({ action: 'dismiss' }),
    });
    assert.equal(dismissed.response.status, 200);
    assert.equal(dismissed.payload?.data.status, 'DISMISSED');

    const chapterCommentsAfter = await request<{ items: Array<{ id: string }> }>(
      `/chapters/${chapterId}/comments?pageSize=20`,
    );
    assert.equal(
      chapterCommentsAfter.payload?.data.items.some(
        (comment) => comment.id === reportedChapterCommentId,
      ),
      false,
    );
    const novelCommentsAfter = await request<{ items: Array<{ id: string }> }>(
      '/novels/seed_novel_star_pact/comments?pageSize=20',
    );
    assert.equal(
      novelCommentsAfter.payload?.data.items.some(
        (comment) => comment.id === reportedNovelCommentId,
      ),
      true,
    );

    const resolvedQueue = await request<{
      items: Array<{ id: string; commentId?: string | null; contentSnapshot: string }>;
    }>('/admin/comment-reports?status=RESOLVED&pageSize=50');
    const resolvedReport = resolvedQueue.payload?.data.items.find(
      (item) => item.id === chapterReportId,
    );
    assert.equal(resolvedReport?.commentId, null);
    assert.equal(resolvedReport?.contentSnapshot, reportedChapterCommentContent);

    const auditLogs = await request<{ items: Array<{ targetId: string; action: string }> }>(
      '/admin/audit-logs?targetType=comment-report&pageSize=50',
    );
    assert.equal(
      auditLogs.payload?.data.items.some(
        (item) => item.targetId === chapterReportId && item.action === 'comment.report.remove',
      ),
      true,
    );
  });

  it('creates, replies to, likes, and safely deletes paragraph comments', async () => {
    const created = await request<{ id: string }>(`/chapters/${chapterId}/paragraphs/0/comments`, {
      method: 'POST',
      body: JSON.stringify({ content: paragraphCommentContent }),
    });
    assert.equal(created.response.status, 201);
    paragraphCommentId = created.payload?.data.id ?? '';
    assert.ok(paragraphCommentId);

    const replied = await request<{ id: string; parentId: string }>(
      `/chapters/${chapterId}/paragraphs/0/comments`,
      {
        method: 'POST',
        body: JSON.stringify({
          content: paragraphReplyContent,
          parentId: paragraphCommentId,
        }),
      },
    );
    assert.equal(replied.response.status, 201);
    paragraphReplyId = replied.payload?.data.id ?? '';
    assert.ok(paragraphReplyId);
    assert.equal(replied.payload?.data.parentId, paragraphCommentId);

    const liked = await request<{ liked: boolean; likeCount: number }>(
      `/paragraph-comments/${paragraphCommentId}/like`,
      { method: 'PUT' },
    );
    assert.equal(liked.response.status, 200);
    assert.equal(liked.payload?.data.liked, true);
    assert.equal(liked.payload?.data.likeCount, 1);

    const listed = await request<{
      totalComments: number;
      items: Array<{
        id: string;
        isLiked: boolean;
        replies: Array<{ id: string }>;
      }>;
    }>(`/chapters/${chapterId}/paragraphs/0/comments?pageSize=20`);
    const root = listed.payload?.data.items.find((item) => item.id === paragraphCommentId);
    assert.equal(listed.response.status, 200);
    assert.equal(listed.payload?.data.totalComments, 2);
    assert.equal(root?.isLiked, true);
    assert.equal(
      root?.replies.some((reply) => reply.id === paragraphReplyId),
      true,
    );

    const summary = await request<{
      items: Array<{ paragraphIndex: number; count: number }>;
    }>(`/chapters/${chapterId}/paragraph-comments/summary`);
    assert.equal(summary.response.status, 200);
    assert.equal(
      summary.payload?.data.items.some((item) => item.paragraphIndex === 0 && item.count >= 2),
      true,
    );

    const removedRoot = await request<{ softDeleted: boolean }>(
      `/me/paragraph-comments/${paragraphCommentId}`,
      { method: 'DELETE' },
    );
    assert.equal(removedRoot.response.status, 200);
    assert.equal(removedRoot.payload?.data.softDeleted, true);

    const afterRootDelete = await request<{
      items: Array<{ id: string; isDeleted: boolean; content: string | null }>;
    }>(`/chapters/${chapterId}/paragraphs/0/comments?pageSize=20`);
    const deletedRoot = afterRootDelete.payload?.data.items.find(
      (item) => item.id === paragraphCommentId,
    );
    assert.equal(deletedRoot?.isDeleted, true);
    assert.equal(deletedRoot?.content, null);

    const removedReply = await request<{ softDeleted: boolean }>(
      `/me/paragraph-comments/${paragraphReplyId}`,
      { method: 'DELETE' },
    );
    assert.equal(removedReply.response.status, 200);
    assert.equal(removedReply.payload?.data.softDeleted, false);
    paragraphReplyId = '';
  });

  it('reports paragraph comments and lets an admin resolve the report', async () => {
    const created = await request<{ id: string }>(`/chapters/${chapterId}/paragraphs/0/comments`, {
      method: 'POST',
      body: JSON.stringify({ content: reportedParagraphCommentContent }),
    });
    assert.equal(created.response.status, 201);
    reportedParagraphCommentId = created.payload?.data.id ?? '';
    assert.ok(reportedParagraphCommentId);

    const mineBefore = await request<{ items: Array<{ id: string }> }>(
      '/me/paragraph-comments?pageSize=20',
    );
    assert.equal(
      mineBefore.payload?.data.items.some((item) => item.id === reportedParagraphCommentId),
      true,
    );

    const reported = await request<{ id: string; status: string }>(
      `/paragraph-comments/${reportedParagraphCommentId}/reports`,
      {
        method: 'POST',
        body: JSON.stringify({ reason: 'ABUSE', detail: 'Functional report regression' }),
      },
      authorToken,
    );
    assert.equal(reported.response.status, 201);
    paragraphReportId = reported.payload?.data.id ?? '';
    assert.ok(paragraphReportId);
    assert.equal(reported.payload?.data.status, 'PENDING');

    const pendingStats = await request<{
      periodDays: number;
      overview: { created: number; pending: number };
      reasonBreakdown: Array<{ reason: string; count: number }>;
    }>('/admin/paragraph-comment-reports/stats?days=7');
    assert.equal(pendingStats.response.status, 200);
    assert.equal(pendingStats.payload?.data.periodDays, 7);
    assert.ok((pendingStats.payload?.data.overview.created ?? 0) >= 1);
    assert.ok((pendingStats.payload?.data.overview.pending ?? 0) >= 1);
    assert.ok(
      (pendingStats.payload?.data.reasonBreakdown.find((item) => item.reason === 'ABUSE')?.count ??
        0) >= 1,
    );

    const reportList = await request<{
      items: Array<{ id: string; commentId: string }>;
    }>('/admin/paragraph-comment-reports?status=PENDING&pageSize=50');
    assert.equal(
      reportList.payload?.data.items.some(
        (item) => item.id === paragraphReportId && item.commentId === reportedParagraphCommentId,
      ),
      true,
    );

    const resolved = await request<{
      succeeded: number;
      failed: number;
      items: Array<{ id: string; success: boolean; error?: string }>;
    }>(
      '/admin/paragraph-comment-reports/batch',
      {
        method: 'PATCH',
        body: JSON.stringify({
          ids: [paragraphReportId, 'functional_paragraph_report_missing'],
          action: 'remove',
        }),
      },
    );
    assert.equal(resolved.response.status, 200);
    assert.equal(resolved.payload?.data.succeeded, 1);
    assert.equal(resolved.payload?.data.failed, 1);

    const resolvedReportList = await request<{
      items: Array<{ id: string; status: string; comment: { isDeleted: boolean } }>;
    }>('/admin/paragraph-comment-reports?status=RESOLVED&pageSize=50');
    const resolvedReport = resolvedReportList.payload?.data.items.find(
      (item) => item.id === paragraphReportId,
    );
    assert.equal(resolvedReport?.status, 'RESOLVED');
    assert.equal(resolvedReport?.comment.isDeleted, true);

    const resolvedStats = await request<{
      overview: {
        resolved: number;
        resolutionRate: number;
        averageResolutionMinutes: number | null;
      };
      trend: Array<{ resolved: number }>;
    }>('/admin/paragraph-comment-reports/stats?days=7');
    assert.equal(resolvedStats.response.status, 200);
    assert.ok((resolvedStats.payload?.data.overview.resolved ?? 0) >= 1);
    assert.ok((resolvedStats.payload?.data.overview.resolutionRate ?? 0) > 0);
    assert.notEqual(resolvedStats.payload?.data.overview.averageResolutionMinutes, null);
    assert.ok(
      resolvedStats.payload?.data.trend.some((item) => item.resolved >= 1),
    );

    const mineAfter = await request<{ items: Array<{ id: string }> }>(
      '/me/paragraph-comments?pageSize=20',
    );
    assert.equal(
      mineAfter.payload?.data.items.some((item) => item.id === reportedParagraphCommentId),
      false,
    );

    const auditLogs = await request<{
      items: Array<{ targetId: string; action: string }>;
    }>('/admin/audit-logs?action=paragraph-comment.report.remove&pageSize=50');
    assert.equal(
      auditLogs.payload?.data.items.some(
        (item) =>
          item.targetId === paragraphReportId && item.action === 'paragraph-comment.report.remove',
      ),
      true,
    );
  });

  it('creates, updates, lists, and removes a verified reading annotation', async () => {
    const created = await request<{
      id: string;
      selectedText: string;
      color: string;
    }>(`/chapters/${chapterId}/annotations`, {
      method: 'POST',
      body: JSON.stringify({
        paragraphIndex: 0,
        startOffset: 0,
        endOffset: 4,
        selectedText: '凌晨三点',
        note: '时间线索',
        color: 'YELLOW',
      }),
    });
    assert.equal(created.response.status, 201);
    annotationId = created.payload?.data.id ?? '';
    assert.ok(annotationId);
    assert.equal(created.payload?.data.selectedText, '凌晨三点');

    const chapterAnnotations = await request<Array<{ id: string }>>(
      `/chapters/${chapterId}/annotations`,
    );
    assert.equal(chapterAnnotations.response.status, 200);
    assert.equal(
      chapterAnnotations.payload?.data.some((annotation) => annotation.id === annotationId),
      true,
    );

    const mine = await request<Array<{ id: string; chapter: { id: string } }>>('/me/annotations');
    assert.equal(mine.response.status, 200);
    assert.equal(
      mine.payload?.data.some(
        (annotation) => annotation.id === annotationId && annotation.chapter.id === chapterId,
      ),
      true,
    );

    const updated = await request<{ note: string; color: string }>(
      `/me/annotations/${annotationId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ note: '更新后的线索', color: 'BLUE' }),
      },
    );
    assert.equal(updated.response.status, 200);
    assert.equal(updated.payload?.data.note, '更新后的线索');
    assert.equal(updated.payload?.data.color, 'BLUE');

    const removed = await request<{ deleted: boolean }>(`/me/annotations/${annotationId}`, {
      method: 'DELETE',
    });
    assert.equal(removed.response.status, 200);
    assert.equal(removed.payload?.data.deleted, true);
    annotationId = '';
  });

  it('removes a single reading history from history management', async () => {
    const removed = await request<{ deleted: boolean }>(
      '/me/reading-histories/seed_novel_star_pact',
      { method: 'DELETE' },
    );
    assert.equal(removed.response.status, 200);
    assert.equal(removed.payload?.data.deleted, true);

    const loaded = await request('/novels/seed_novel_star_pact/reading-history');
    assert.equal(loaded.response.status, 200);
    assert.equal(loaded.payload?.data, null);
  });
});
