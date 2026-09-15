import type {
  ApiResponse,
  AccountDeletionRequestResult,
  AccountDeletionStatus,
  AuthorDashboard,
  AuthorCalendar,
  AuthorCalendarEvent,
  AuthorCalendarEventType,
  AuthorApplication,
  AuthorCollectionTaskPreview,
  AuthorCollectionTaskResult,
  AuthorCollectionHtmlAnalysis,
  AuthorCollectionJsonAnalysis,
  AuthorChapterSaveSource,
  AuthorSaveAction,
  FollowedAuthor,
  AuthorOnboarding,
  AuthorProfile,
  AuthorNovel,
  AuthorRagIndexStatus,
  AuthResponse,
  AuthLoginResult,
  AuthSession,
  BookshelfItem,
  BookshelfRecord,
  Category,
  Chapter,
  ChapterBookmark,
  ChapterBookmarkRecord,
  ChapterDeleteResult,
  ChapterSummary,
  ChapterVersion,
  ContentAppeal,
  ContentAppealTarget,
  ContentAppealTargetType,
  ContentReportSubmission,
  ContentReportTargetType,
  DeletedChapter,
  DraftChapter,
  EmailVerificationRequest,
  Novel,
  NovelAnnouncement,
  NovelVolume,
  NovelReadStatus,
  NovelComment,
  NovelRatingSummary,
  NotificationListResponse,
  NotificationType,
  PaginatedNovels,
  PaginatedComments,
  PaginatedContentAppeals,
  PaginatedMyComments,
  PaginatedMyParagraphComments,
  PaginatedParagraphComments,
  ParagraphComment,
  ParagraphCommentSummary,
  ParagraphReportReason,
  PasswordResetRequest,
  PersonalDataExport,
  PersonalizedRecommendationResponse,
  PublicAuthorProfile,
  ReadingHistory,
  ReadingAnnotation,
  ReadingAnnotationWithContext,
  ReadingPreference,
  ReaderAiAssistanceResult,
  ReaderAiAction,
  RecommendSlot,
  RankingResponse,
  RankingPeriod,
  RankingType,
  HotSearchItem,
  PaginatedLoginActivities,
  SearchHistoryItem,
  SearchSuggestion,
  Tag,
  UploadResult,
  User,
  TwoFactorEnableResult,
  TwoFactorRecoveryCodesResult,
  TwoFactorSetup,
  TwoFactorStatus,
} from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit & { token?: string }): Promise<T> {
  const { token, headers, ...requestInit } = init ?? {};
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    ...requestInit,
  });

  let payload: ApiResponse<T> | undefined;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    payload = undefined;
  }

  if (!response.ok) {
    throw new ApiError(payload?.message ?? '请求失败', response.status);
  }

  if (!payload) {
    throw new ApiError('响应格式错误', response.status);
  }

  return payload.data;
}

export interface NovelListQuery {
  page?: number;
  pageSize?: number;
  keyword?: string;
  categoryId?: string;
  channel?: string;
  tagId?: string;
  status?: 'SERIALIZING' | 'COMPLETED';
  sort?: 'latest' | 'popular' | 'comments' | 'bookshelf';
}

function toSearchParams(query: object) {
  const params = new URLSearchParams();

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      params.set(key, String(value));
    }
  });

  return params.toString();
}

export const api = {
  login(payload: { email: string; password: string }) {
    return request<AuthLoginResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  completeTwoFactorLogin(payload: { challengeToken: string; code: string }) {
    return request<AuthResponse>('/auth/two-factor/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  requestRegistrationCode(email: string) {
    return request<EmailVerificationRequest>('/auth/register/code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  register(payload: {
    email: string;
    password: string;
    verificationCode: string;
    nickname?: string;
  }) {
    return request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  requestPasswordReset(email: string) {
    return request<PasswordResetRequest>('/auth/password/forgot', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  resetPassword(payload: { email: string; code: string; newPassword: string }) {
    return request<{ reset: boolean; revokedSessions: number }>('/auth/password/reset', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  requestEmailChangeCode(token: string, email: string) {
    return request<EmailVerificationRequest>('/auth/email/change/code', {
      method: 'POST',
      token,
      body: JSON.stringify({ email }),
    });
  },

  changeEmail(token: string, payload: { email: string; code: string; currentPassword: string }) {
    return request<{ user: User; revokedSessions: number }>('/auth/email', {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  refreshAuth(refreshToken: string) {
    return request<AuthResponse>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  },

  logout(token: string) {
    return request<{ revoked: boolean }>('/auth/logout', {
      method: 'POST',
      token,
    });
  },

  me(token: string) {
    return request<User>('/auth/me', { token });
  },

  updateProfile(token: string, nickname: string) {
    return request<User>('/auth/me', {
      method: 'PATCH',
      token,
      body: JSON.stringify({ nickname }),
    });
  },

  changePassword(token: string, currentPassword: string, newPassword: string) {
    return request<{ changed: boolean; revokedSessions: number }>('/auth/password', {
      method: 'PATCH',
      token,
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  getTwoFactorStatus(token: string) {
    return request<TwoFactorStatus>('/auth/two-factor', { token });
  },

  beginTwoFactorSetup(token: string, currentPassword: string) {
    return request<TwoFactorSetup>('/auth/two-factor/setup', {
      method: 'POST',
      token,
      body: JSON.stringify({ currentPassword }),
    });
  },

  cancelTwoFactorSetup(token: string) {
    return request<{ cancelled: boolean }>('/auth/two-factor/setup', {
      method: 'DELETE',
      token,
    });
  },

  enableTwoFactor(token: string, code: string) {
    return request<TwoFactorEnableResult>('/auth/two-factor/enable', {
      method: 'POST',
      token,
      body: JSON.stringify({ code }),
    });
  },

  regenerateTwoFactorRecoveryCodes(
    token: string,
    payload: { currentPassword: string; code: string },
  ) {
    return request<TwoFactorRecoveryCodesResult>('/auth/two-factor/recovery-codes', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },

  disableTwoFactor(token: string, payload: { currentPassword: string; code: string }) {
    return request<{ disabled: boolean; revokedSessions: number }>('/auth/two-factor', {
      method: 'DELETE',
      token,
      body: JSON.stringify(payload),
    });
  },

  getAccountDeletionStatus(token: string) {
    return request<AccountDeletionStatus>('/auth/account-deletion', { token });
  },

  requestAccountDeletion(
    token: string,
    payload: {
      currentPassword: string;
      code?: string;
      confirmation: string;
      reason?: string;
    },
  ) {
    return request<AccountDeletionRequestResult>('/auth/account-deletion', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },

  cancelAccountDeletion(token: string, payload: { currentPassword: string; code?: string }) {
    return request<AccountDeletionStatus>('/auth/account-deletion', {
      method: 'DELETE',
      token,
      body: JSON.stringify(payload),
    });
  },

  exportPersonalData(token: string, payload: { currentPassword: string; code?: string }) {
    return request<PersonalDataExport>('/auth/data-export', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },

  listAuthSessions(token: string) {
    return request<AuthSession[]>('/auth/sessions', { token });
  },

  listLoginActivities(token: string, query: { page?: number; pageSize?: number } = {}) {
    const search = toSearchParams(query);
    return request<PaginatedLoginActivities>(
      `/auth/login-activities${search ? `?${search}` : ''}`,
      { token },
    );
  },

  revokeAuthSession(token: string, sessionId: string) {
    return request<{ revoked: boolean }>(`/auth/sessions/${sessionId}`, {
      method: 'DELETE',
      token,
    });
  },

  revokeOtherAuthSessions(token: string) {
    return request<{ revokedCount: number }>('/auth/sessions/others', {
      method: 'DELETE',
      token,
    });
  },

  listMyComments(token: string, query: { page?: number; pageSize?: number } = {}) {
    const search = toSearchParams(query);
    return request<PaginatedMyComments>(`/me/comments${search ? `?${search}` : ''}`, {
      token,
    });
  },

  deleteMyComment(token: string, commentId: string) {
    return request<{ deleted: boolean }>(`/me/comments/${commentId}`, {
      method: 'DELETE',
      token,
    });
  },

  listMyParagraphComments(token: string, query: { page?: number; pageSize?: number } = {}) {
    const search = toSearchParams(query);
    return request<PaginatedMyParagraphComments>(
      `/me/paragraph-comments${search ? `?${search}` : ''}`,
      { token },
    );
  },

  listNotifications(
    token: string,
    query: { page?: number; pageSize?: number; unreadOnly?: boolean; type?: NotificationType } = {},
  ) {
    const search = toSearchParams(query);
    return request<NotificationListResponse>(`/notifications${search ? `?${search}` : ''}`, {
      token,
    });
  },

  markNotificationRead(token: string, notificationId: string) {
    return request<{ id: string; isRead: boolean }>(`/notifications/${notificationId}/read`, {
      method: 'PATCH',
      token,
    });
  },

  markAllNotificationsRead(token: string) {
    return request<{ updatedCount: number }>('/notifications/read-all', {
      method: 'PATCH',
      token,
    });
  },

  listAuthorNovels(token: string) {
    return request<AuthorNovel[]>('/author/novels', { token });
  },

  previewAuthorCollectionTask(
    token: string,
    payload: {
      sourceType?: 'wikisource' | 'json' | 'html';
      title: string;
      categoryId: string;
      sourceUrl?: string;
      sourceAuthor?: string;
      titlePath?: string;
      summaryPath?: string;
      chaptersPath?: string;
      chapterTitlePath?: string;
      chapterContentPath?: string;
      chapterUrlPath?: string;
      chapterIdPath?: string;
      titleSelector?: string;
      summarySelector?: string;
      chapterLinkSelector?: string;
      chapterContentSelector?: string;
      maxChapters?: number;
      startChapter?: number;
      endChapter?: number;
      rightsConfirmed: true;
    },
  ) {
    return request<AuthorCollectionTaskPreview>('/author/collection-tasks/preview', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },

  analyzeHtmlCollectionSource(token: string, sourceUrl: string) {
    return request<AuthorCollectionHtmlAnalysis>('/author/collection-tasks/analyze-html', {
      method: 'POST',
      token,
      body: JSON.stringify({ sourceUrl }),
    });
  },

  analyzeJsonCollectionSource(token: string, sourceUrl: string) {
    return request<AuthorCollectionJsonAnalysis>('/author/collection-tasks/analyze-json', {
      method: 'POST',
      token,
      body: JSON.stringify({ sourceUrl }),
    });
  },

  commitAuthorCollectionTask(token: string, taskId: string) {
    return request<AuthorCollectionTaskResult>(`/author/collection-tasks/${taskId}/commit`, {
      method: 'POST',
      token,
      body: JSON.stringify({ rightsConfirmed: true }),
    });
  },

  getAuthorDashboard(token: string, days = 14) {
    return request<AuthorDashboard>(`/author/dashboard?days=${days}`, { token });
  },

  getAuthorCalendar(token: string, month: string, novelId?: string) {
    const search = toSearchParams({ month, novelId });
    return request<AuthorCalendar>(`/author/calendar?${search}`, { token });
  },

  createAuthorCalendarEvent(
    token: string,
    novelId: string,
    payload: {
      title: string;
      note?: string;
      eventAt: string;
      type: Exclude<AuthorCalendarEventType, 'CHAPTER'>;
    },
  ) {
    return request<AuthorCalendarEvent>(`/author/novels/${novelId}/calendar-events`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },

  updateAuthorCalendarEvent(
    token: string,
    eventId: string,
    payload: {
      title?: string;
      note?: string;
      eventAt?: string;
      type?: Exclude<AuthorCalendarEventType, 'CHAPTER'>;
      isCompleted?: boolean;
    },
  ) {
    return request<AuthorCalendarEvent>(`/author/calendar-events/${eventId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  deleteAuthorCalendarEvent(token: string, eventId: string) {
    return request<{ deletedId: string }>(`/author/calendar-events/${eventId}`, {
      method: 'DELETE',
      token,
    });
  },

  getAuthorOnboarding(token: string) {
    return request<AuthorOnboarding>('/author/onboarding', { token });
  },

  submitAuthorApplication(
    token: string,
    payload: { penName: string; bio?: string; statement: string },
  ) {
    return request<AuthorApplication>('/author/onboarding', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },

  updateAuthorProfile(token: string, payload: { penName: string; bio?: string }) {
    return request<AuthorProfile>('/author/profile', {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  createAuthorNovel(
    token: string,
    payload: {
      title: string;
      summary: string;
      categoryId: string;
      coverUrl?: string;
      tagNames?: string[];
      action?: AuthorSaveAction;
    },
  ) {
    return request<AuthorNovel>('/author/novels', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },

  updateAuthorNovel(
    token: string,
    novelId: string,
    payload: {
      title: string;
      summary: string;
      categoryId: string;
      coverUrl?: string;
      tagNames?: string[];
      action?: AuthorSaveAction;
    },
  ) {
    return request<AuthorNovel>(`/author/novels/${novelId}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(payload),
    });
  },

  deleteAuthorNovel(token: string, novelId: string) {
    return request<{ deletedId: string }>(`/author/novels/${novelId}`, {
      method: 'DELETE',
      token,
    });
  },

  updateAuthorNovelLifecycle(token: string, novelId: string, action: 'complete' | 'resume') {
    return request<AuthorNovel>(`/author/novels/${novelId}/lifecycle`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ action }),
    });
  },

  listAuthorAnnouncements(token: string, novelId: string) {
    return request<NovelAnnouncement[]>(`/author/novels/${novelId}/announcements`, { token });
  },

  createAuthorAnnouncement(
    token: string,
    novelId: string,
    payload: {
      title: string;
      content: string;
      isPinned?: boolean;
      action: 'save' | 'publish';
    },
  ) {
    return request<NovelAnnouncement>(`/author/novels/${novelId}/announcements`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },

  updateAuthorAnnouncement(
    token: string,
    announcementId: string,
    payload: {
      title: string;
      content: string;
      isPinned?: boolean;
      action: 'save' | 'publish';
    },
  ) {
    return request<NovelAnnouncement>(`/author/announcements/${announcementId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  deleteAuthorAnnouncement(token: string, announcementId: string) {
    return request<{ deletedId: string }>(`/author/announcements/${announcementId}`, {
      method: 'DELETE',
      token,
    });
  },

  uploadCover(
    token: string,
    payload: {
      fileName: string;
      contentType: 'image/jpeg' | 'image/png' | 'image/webp';
      dataUrl: string;
    },
  ) {
    return request<UploadResult>('/uploads/covers', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },

  createAuthorChapter(
    token: string,
    novelId: string,
    payload: {
      title: string;
      content: string;
      volumeId?: string | null;
      scheduledAt?: string | null;
      action?: AuthorSaveAction;
    },
  ) {
    return request<DraftChapter>(`/author/novels/${novelId}/chapters`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },

  updateAuthorChapter(
    token: string,
    chapterId: string,
    payload: {
      title: string;
      content: string;
      volumeId?: string | null;
      scheduledAt?: string | null;
      action?: AuthorSaveAction;
      saveSource?: AuthorChapterSaveSource;
    },
  ) {
    return request<DraftChapter>(`/author/chapters/${chapterId}`, {
      method: 'PUT',
      token,
      body: JSON.stringify(payload),
    });
  },

  authorAiAssist(
    token: string,
    chapterId: string,
    payload: {
      action: import('./types').AuthorAiAction;
      title: string;
      content: string;
      query?: string;
      novelId?: string;
      beforeChapterOrder?: number;
    },
  ) {
    return request<import('./types').AuthorAiAssistanceResult>(
      `/author/chapters/${chapterId}/ai-assistance`,
      {
        method: 'POST',
        token,
        body: JSON.stringify(payload),
      },
    );
  },

  deleteAuthorChapter(token: string, chapterId: string) {
    return request<{
      deletedId: string;
      deletedCount: number;
      chapters: DraftChapter[];
    }>(`/author/chapters/${chapterId}`, {
      method: 'DELETE',
      token,
    });
  },

  listAuthorChapterVersions(token: string, chapterId: string) {
    return request<ChapterVersion[]>(`/author/chapters/${chapterId}/versions`, { token });
  },

  restoreAuthorChapterVersion(token: string, chapterId: string, versionId: string) {
    return request<DraftChapter>(`/author/chapters/${chapterId}/versions/${versionId}/restore`, {
      method: 'POST',
      token,
    });
  },

  listAuthorChapterTrash(token: string, novelId: string) {
    return request<DeletedChapter[]>(`/author/novels/${novelId}/chapter-trash`, { token });
  },

  restoreAuthorChapter(token: string, chapterId: string) {
    return request<DraftChapter>(`/author/chapters/${chapterId}/restore`, {
      method: 'POST',
      token,
    });
  },

  permanentlyDeleteAuthorChapter(token: string, chapterId: string) {
    return request<{ deletedId: string }>(`/author/chapters/${chapterId}/permanent`, {
      method: 'DELETE',
      token,
    });
  },

  deleteAuthorChapters(token: string, novelId: string, chapterIds: string[]) {
    return request<ChapterDeleteResult>(`/author/novels/${novelId}/chapters/batch-delete`, {
      method: 'POST',
      token,
      body: JSON.stringify({ chapterIds }),
    });
  },

  reorderAuthorChapters(token: string, novelId: string, chapterIds: string[]) {
    return request<DraftChapter[]>(`/author/novels/${novelId}/chapters/order`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ chapterIds }),
    });
  },

  createAuthorVolume(
    token: string,
    novelId: string,
    payload: { title: string; description?: string },
  ) {
    return request<NovelVolume>(`/author/novels/${novelId}/volumes`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },

  authorAiAssistDraft(
    token: string,
    payload: {
      action: import('./types').AuthorAiAction;
      title: string;
      content: string;
      query?: string;
      novelId?: string;
      beforeChapterOrder?: number;
    },
  ) {
    return request<import('./types').AuthorAiAssistanceResult>('/author/ai-assistance', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },

  readerAiAsk(
    token: string,
    novelId: string,
    payload: { action: ReaderAiAction; chapterId: string; question?: string; spoilerMode?: 'safe' },
  ) {
    return request<ReaderAiAssistanceResult>(`/novels/${novelId}/reader-ai/ask`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },

  getAuthorRagStatus(token: string, novelId: string) {
    return request<AuthorRagIndexStatus>(`/author/novels/${novelId}/rag/status`, { token });
  },

  reindexAuthorNovel(token: string, novelId: string) {
    return request<import('./types').AuthorRagReindexResult>(
      `/author/novels/${novelId}/rag/reindex`,
      {
        method: 'POST',
        token,
      },
    );
  },

  evaluateAuthorNovelRag(token: string, novelId: string) {
    return request<import('./types').AuthorRagEvaluationResult>(
      `/author/novels/${novelId}/rag/evaluate`,
      {
        method: 'POST',
        token,
      },
    );
  },

  listAuthorNovelMemories(token: string, novelId: string) {
    return request<import('./types').NovelMemory[]>(`/author/novels/${novelId}/memories`, {
      token,
    });
  },

  extractAuthorNovelMemoryDrafts(
    token: string,
    novelId: string,
    payload: {
      title: string;
      content: string;
      sourceChapterId?: string;
      beforeChapterOrder?: number;
    },
  ) {
    return request<import('./types').AuthorMemoryExtractionResult>(
      `/author/novels/${novelId}/memories/extract`,
      {
        method: 'POST',
        token,
        body: JSON.stringify(payload),
      },
    );
  },

  listAuthorNovelMemoryDrafts(
    token: string,
    novelId: string,
    status?: import('./types').AuthorMemoryDraft['status'],
  ) {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return request<import('./types').AuthorMemoryDraft[]>(
      `/author/novels/${novelId}/memory-drafts${query}`,
      { token },
    );
  },

  reviewAuthorNovelMemoryDraft(
    token: string,
    draftId: string,
    payload: {
      action: 'ACCEPT' | 'REJECT';
      type?: import('./types').NovelMemoryType;
      title?: string;
      content?: string;
    },
  ) {
    return request<import('./types').AuthorMemoryDraft>(`/author/memory-drafts/${draftId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  batchReviewAuthorNovelMemoryDrafts(
    token: string,
    novelId: string,
    payload: { draftIds: string[]; action: 'ACCEPT' | 'REJECT' },
  ) {
    return request<import('./types').AuthorMemoryDraftBatchReviewResult>(
      `/author/novels/${novelId}/memory-drafts/batch`,
      {
        method: 'PATCH',
        token,
        body: JSON.stringify(payload),
      },
    );
  },

  createAuthorNovelMemory(
    token: string,
    novelId: string,
    payload: {
      type: import('./types').NovelMemoryType;
      title: string;
      content: string;
      sourceChapterId?: string | null;
      isConfirmed?: boolean;
      orderIndex?: number;
    },
  ) {
    return request<import('./types').NovelMemory>(`/author/novels/${novelId}/memories`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },

  updateAuthorNovelMemory(
    token: string,
    memoryId: string,
    payload: Partial<{
      type: import('./types').NovelMemoryType;
      title: string;
      content: string;
      sourceChapterId: string | null;
      isConfirmed: boolean;
      orderIndex: number;
    }>,
  ) {
    return request<import('./types').NovelMemory>(`/author/memories/${memoryId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  deleteAuthorNovelMemory(token: string, memoryId: string) {
    return request<{ deletedId: string }>(`/author/memories/${memoryId}`, {
      method: 'DELETE',
      token,
    });
  },

  updateAuthorVolume(
    token: string,
    volumeId: string,
    payload: { title: string; description?: string },
  ) {
    return request<NovelVolume>(`/author/volumes/${volumeId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  deleteAuthorVolume(token: string, volumeId: string) {
    return request<{ deletedId: string }>(`/author/volumes/${volumeId}`, {
      method: 'DELETE',
      token,
    });
  },

  reorderAuthorVolumes(token: string, novelId: string, volumeIds: string[]) {
    return request<NovelVolume[]>(`/author/novels/${novelId}/volumes/order`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ volumeIds }),
    });
  },

  assignAuthorChapterVolume(token: string, chapterId: string, volumeId: string | null) {
    return request<DraftChapter>(`/author/chapters/${chapterId}/volume`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ volumeId }),
    });
  },

  updateAuthorChapterSchedule(token: string, chapterId: string, scheduledAt: string | null) {
    return request<DraftChapter>(`/author/chapters/${chapterId}/schedule`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ scheduledAt }),
    });
  },

  listBookshelf(token: string) {
    return request<BookshelfItem[]>('/me/bookshelf', { token });
  },

  addToBookshelf(token: string, novelId: string) {
    return request<BookshelfRecord>(`/novels/${novelId}/bookshelf`, {
      method: 'POST',
      token,
    });
  },

  removeFromBookshelf(token: string, novelId: string) {
    return request<{ removed: boolean }>(`/novels/${novelId}/bookshelf`, {
      method: 'DELETE',
      token,
    });
  },

  updateBookshelfNotification(token: string, novelId: string, enabled: boolean) {
    return request<{ novelId: string; notifyOnUpdate: boolean }>(
      `/novels/${novelId}/bookshelf/notification`,
      {
        method: 'PATCH',
        token,
        body: JSON.stringify({ enabled }),
      },
    );
  },

  listReadingHistories(token: string) {
    return request<ReadingHistory[]>('/me/reading-histories', { token });
  },

  removeReadingHistory(token: string, novelId: string) {
    return request<{ deleted: boolean }>(`/me/reading-histories/${novelId}`, {
      method: 'DELETE',
      token,
    });
  },

  clearReadingHistories(token: string) {
    return request<{ deletedCount: number }>('/me/reading-histories', {
      method: 'DELETE',
      token,
    });
  },

  getReadingHistory(token: string, novelId: string) {
    return request<ReadingHistory | null>(`/novels/${novelId}/reading-history`, { token });
  },

  getNovelReadStatus(token: string, novelId: string) {
    return request<NovelReadStatus>(`/novels/${novelId}/read-status`, { token });
  },

  saveReadingHistory(
    token: string,
    payload: {
      novelId: string;
      chapterId: string;
      progress: number;
    },
  ) {
    return request<ReadingHistory>('/reading-histories', {
      method: 'PUT',
      token,
      body: JSON.stringify(payload),
    });
  },

  saveReadingSession(
    token: string,
    payload: {
      novelId: string;
      chapterId: string;
      progress: number;
      seconds: number;
    },
    keepalive = false,
  ) {
    return request<ReadingHistory>('/reading-sessions', {
      method: 'POST',
      token,
      keepalive,
      body: JSON.stringify(payload),
    });
  },

  getReadingPreference(token: string) {
    return request<ReadingPreference>('/me/reading-preference', { token });
  },

  updateReadingPreference(token: string, payload: ReadingPreference) {
    return request<ReadingPreference>('/me/reading-preference', {
      method: 'PUT',
      token,
      body: JSON.stringify({
        fontSize: payload.fontSize,
        theme: payload.theme,
        lineHeight: payload.lineHeight,
        contentWidth: payload.contentWidth,
      }),
    });
  },

  listBookmarks(token: string) {
    return request<ChapterBookmark[]>('/me/bookmarks', { token });
  },

  getChapterBookmark(token: string, chapterId: string) {
    return request<ChapterBookmarkRecord | null>(`/chapters/${chapterId}/bookmark`, { token });
  },

  addChapterBookmark(token: string, chapterId: string) {
    return request<ChapterBookmarkRecord>(`/chapters/${chapterId}/bookmark`, {
      method: 'POST',
      token,
    });
  },

  removeChapterBookmark(token: string, chapterId: string) {
    return request<{ removed: boolean }>(`/chapters/${chapterId}/bookmark`, {
      method: 'DELETE',
      token,
    });
  },

  listChapterAnnotations(token: string, chapterId: string) {
    return request<ReadingAnnotation[]>(`/chapters/${chapterId}/annotations`, { token });
  },

  listAnnotations(token: string) {
    return request<ReadingAnnotationWithContext[]>('/me/annotations', { token });
  },

  createAnnotation(
    token: string,
    chapterId: string,
    payload: {
      paragraphIndex: number;
      startOffset: number;
      endOffset: number;
      selectedText: string;
      note?: string;
      color: ReadingAnnotation['color'];
    },
  ) {
    return request<ReadingAnnotation>(`/chapters/${chapterId}/annotations`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },

  updateAnnotation(
    token: string,
    annotationId: string,
    payload: { note?: string; color?: ReadingAnnotation['color'] },
  ) {
    return request<ReadingAnnotation>(`/me/annotations/${annotationId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  removeAnnotation(token: string, annotationId: string) {
    return request<{ deleted: boolean }>(`/me/annotations/${annotationId}`, {
      method: 'DELETE',
      token,
    });
  },

  listCategories(channel?: string) {
    const query = channel ? `?channel=${encodeURIComponent(channel)}` : '';
    return request<Category[]>(`/categories${query}`);
  },

  getPublicAuthor(authorId: string, token?: string) {
    return request<PublicAuthorProfile>(`/authors/${authorId}`, { token });
  },

  listFollowedAuthors(token: string) {
    return request<FollowedAuthor[]>('/me/followed-authors', { token });
  },

  followAuthor(token: string, authorId: string) {
    return request<{ authorId: string; isFollowing: true; followerCount: number }>(
      `/authors/${authorId}/follow`,
      { method: 'POST', token },
    );
  },

  unfollowAuthor(token: string, authorId: string) {
    return request<{ authorId: string; isFollowing: false; followerCount: number }>(
      `/authors/${authorId}/follow`,
      { method: 'DELETE', token },
    );
  },

  listTags() {
    return request<Tag[]>('/meta/tags');
  },

  listNovels(query: NovelListQuery = {}) {
    const search = toSearchParams(query);
    return request<PaginatedNovels>(`/novels${search ? `?${search}` : ''}`);
  },

  getRecommendSlot(code: string) {
    return request<RecommendSlot>(`/recommend-slots/${code}`);
  },

  getPersonalizedRecommendations(token: string, limit = 6) {
    return request<PersonalizedRecommendationResponse>(`/me/recommendations?limit=${limit}`, {
      token,
    });
  },

  listRankings(
    query: { type?: RankingType; period?: RankingPeriod; channel?: string; limit?: number } = {},
  ) {
    const search = toSearchParams(query);
    return request<RankingResponse>(`/rankings${search ? `?${search}` : ''}`);
  },

  recordSearch(keyword: string, token?: string) {
    return request<{
      keyword: string;
      searchCount: number;
      history: SearchHistoryItem | null;
    }>('/searches', {
      method: 'POST',
      token,
      body: JSON.stringify({ keyword }),
    });
  },

  listHotSearches(limit = 10) {
    return request<HotSearchItem[]>(`/searches/hot?limit=${limit}`);
  },

  listSearchSuggestions(keyword: string, limit = 8) {
    return request<SearchSuggestion[]>(
      `/searches/suggestions?keyword=${encodeURIComponent(keyword)}&limit=${limit}`,
    );
  },

  listSearchHistories(token: string, limit = 10) {
    return request<SearchHistoryItem[]>(`/me/search-histories?limit=${limit}`, { token });
  },

  removeSearchHistory(token: string, historyId: string) {
    return request<{ deleted: boolean }>(`/me/search-histories/${historyId}`, {
      method: 'DELETE',
      token,
    });
  },

  clearSearchHistories(token: string) {
    return request<{ deletedCount: number }>('/me/search-histories', {
      method: 'DELETE',
      token,
    });
  },

  getNovel(id: string) {
    return request<Novel>(`/novels/${id}`);
  },

  listNovelAnnouncements(novelId: string) {
    return request<NovelAnnouncement[]>(`/novels/${novelId}/announcements`);
  },

  listChapters(novelId: string) {
    return request<ChapterSummary[]>(`/novels/${novelId}/chapters`);
  },

  getChapter(id: string) {
    return request<Chapter>(`/chapters/${id}`);
  },

  listComments(novelId: string, query: { page?: number; pageSize?: number } = {}, token?: string) {
    const search = toSearchParams(query);
    return request<PaginatedComments>(`/novels/${novelId}/comments${search ? `?${search}` : ''}`, {
      token,
    });
  },

  createComment(token: string, novelId: string, content: string, parentId?: string) {
    return request<NovelComment>(`/novels/${novelId}/comments`, {
      method: 'POST',
      token,
      body: JSON.stringify({ content, parentId }),
    });
  },

  listChapterComments(
    chapterId: string,
    query: { page?: number; pageSize?: number } = {},
    token?: string,
  ) {
    const search = toSearchParams(query);
    return request<PaginatedComments>(
      `/chapters/${chapterId}/comments${search ? `?${search}` : ''}`,
      { token },
    );
  },

  createChapterComment(token: string, chapterId: string, content: string, parentId?: string) {
    return request<NovelComment>(`/chapters/${chapterId}/comments`, {
      method: 'POST',
      token,
      body: JSON.stringify({ content, parentId }),
    });
  },

  likeComment(token: string, commentId: string) {
    return request<{ commentId: string; isLiked: true; likeCount: number }>(
      `/comments/${commentId}/like`,
      { method: 'PUT', token },
    );
  },

  unlikeComment(token: string, commentId: string) {
    return request<{ commentId: string; isLiked: false; likeCount: number }>(
      `/comments/${commentId}/like`,
      { method: 'DELETE', token },
    );
  },

  getNovelRating(novelId: string, token?: string) {
    return request<NovelRatingSummary>(`/novels/${novelId}/rating`, { token });
  },

  saveNovelRating(token: string, novelId: string, score: number) {
    return request<NovelRatingSummary>(`/novels/${novelId}/rating`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ score }),
    });
  },

  removeNovelRating(token: string, novelId: string) {
    return request<NovelRatingSummary>(`/novels/${novelId}/rating`, {
      method: 'DELETE',
      token,
    });
  },

  reportComment(
    token: string,
    commentId: string,
    payload: { reason: ParagraphReportReason; detail?: string },
  ) {
    return request<{ id: string; status: 'PENDING' }>(`/comments/${commentId}/reports`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },

  reportContent(
    token: string,
    targetType: ContentReportTargetType,
    targetId: string,
    payload: { reason: ParagraphReportReason; detail?: string },
  ) {
    return request<ContentReportSubmission>(`/content-reports/${targetType}/${targetId}`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },

  listContentAppealTargets(token: string) {
    return request<ContentAppealTarget[]>('/me/content-appeals/targets', { token });
  },

  listMyContentAppeals(token: string, query: { page?: number; pageSize?: number } = {}) {
    const search = toSearchParams(query);
    return request<PaginatedContentAppeals>(`/me/content-appeals${search ? `?${search}` : ''}`, {
      token,
    });
  },

  createContentAppeal(
    token: string,
    targetType: ContentAppealTargetType,
    targetId: string,
    reason: string,
  ) {
    return request<ContentAppeal>(`/content-appeals/${targetType}/${targetId}`, {
      method: 'POST',
      token,
      body: JSON.stringify({ reason }),
    });
  },

  getParagraphCommentSummary(chapterId: string) {
    return request<ParagraphCommentSummary>(`/chapters/${chapterId}/paragraph-comments/summary`);
  },

  listParagraphComments(
    chapterId: string,
    paragraphIndex: number,
    query: { page?: number; pageSize?: number } = {},
    token?: string,
  ) {
    const search = toSearchParams(query);
    return request<PaginatedParagraphComments>(
      `/chapters/${chapterId}/paragraphs/${paragraphIndex}/comments${search ? `?${search}` : ''}`,
      { token },
    );
  },

  createParagraphComment(
    token: string,
    chapterId: string,
    paragraphIndex: number,
    content: string,
    parentId?: string,
  ) {
    return request<ParagraphComment>(
      `/chapters/${chapterId}/paragraphs/${paragraphIndex}/comments`,
      {
        method: 'POST',
        token,
        body: JSON.stringify({ content, parentId }),
      },
    );
  },

  likeParagraphComment(token: string, commentId: string) {
    return request<{ id: string; liked: boolean; likeCount: number }>(
      `/paragraph-comments/${commentId}/like`,
      { method: 'PUT', token },
    );
  },

  unlikeParagraphComment(token: string, commentId: string) {
    return request<{ id: string; liked: boolean; likeCount: number }>(
      `/paragraph-comments/${commentId}/like`,
      { method: 'DELETE', token },
    );
  },

  removeParagraphComment(token: string, commentId: string) {
    return request<{ id: string; deleted: boolean; softDeleted: boolean }>(
      `/me/paragraph-comments/${commentId}`,
      { method: 'DELETE', token },
    );
  },

  reportParagraphComment(
    token: string,
    commentId: string,
    payload: { reason: ParagraphReportReason; detail?: string },
  ) {
    return request<{ id: string; status: 'PENDING' }>(`/paragraph-comments/${commentId}/reports`, {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },
};
