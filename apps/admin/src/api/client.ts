export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export type UserRole = 'READER' | 'AUTHOR' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';
export type AuthorApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type SensitiveWordScope = 'ALL' | 'NOVEL' | 'CHAPTER' | 'COMMENT';

export interface User {
  id: string;
  email: string;
  nickname: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: User;
}

export interface Category {
  id: string;
  name: string;
  channel: string;
  sortOrder?: number;
}

export interface ContentChannel {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  categoryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaxonomyCategory extends Category {
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  _count: { novels: number };
}

export interface TaxonomyTag {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  _count: { novels: number };
}

export interface TaxonomyOverview {
  channels: ContentChannel[];
  categories: TaxonomyCategory[];
  tags: TaxonomyTag[];
}

export interface AuthorSummary {
  id: string;
  nickname: string;
  email?: string;
}

export interface Novel {
  id: string;
  title: string;
  summary: string;
  coverUrl?: string | null;
  status: 'DRAFT' | 'REVIEWING' | 'REJECTED' | 'SERIALIZING' | 'COMPLETED' | 'HIDDEN';
  wordCount: number;
  createdAt: string;
  updatedAt: string;
  author: AuthorSummary;
  category: Category;
  tags: Array<{ id: string; name: string }>;
  _count?: {
    chapters?: number;
    comments?: number;
    bookshelf?: number;
  };
}

export interface AdminUser {
  id: string;
  email: string;
  nickname: string;
  role: UserRole;
  status: UserStatus;
  suspendedAt?: string | null;
  suspensionReason?: string | null;
  createdAt: string;
  _count?: {
    bookshelfItems?: number;
    comments?: number;
    novels?: number;
  };
}

export interface AdminNovelDetail extends Novel {
  author: AuthorSummary & {
    email: string;
    role: UserRole;
    authorProfile?: {
      id: string;
      penName: string;
      bio?: string | null;
      createdAt: string;
      updatedAt: string;
    } | null;
  };
  chapters: Array<{
    id: string;
    title: string;
    status: 'DRAFT' | 'REVIEWING' | 'SCHEDULED' | 'PUBLISHED' | 'REJECTED';
    orderIndex: number;
    wordCount: number;
    scheduledAt?: string | null;
    publishedAt?: string | null;
    updatedAt: string;
  }>;
  comments: Array<{
    id: string;
    content: string;
    createdAt: string;
    user: {
      id: string;
      nickname: string;
      email: string;
      role: UserRole;
    };
  }>;
  reviewLogs: ReviewLog[];
  _count: {
    bookshelf: number;
    chapters: number;
    comments: number;
    histories: number;
  };
}

export interface AdminUserDetail extends AdminUser {
  updatedAt: string;
  authorProfile?: {
    id: string;
    penName: string;
    bio?: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  novels: Novel[];
  bookshelfItems: Array<{
    id: string;
    createdAt: string;
    novel: {
      id: string;
      title: string;
      status: Novel['status'];
      author: AuthorSummary;
    };
  }>;
  readingHistories: Array<{
    id: string;
    progress: number;
    updatedAt: string;
    novel: {
      id: string;
      title: string;
    };
    chapter: {
      id: string;
      title: string;
      orderIndex: number;
    };
  }>;
  comments: Array<{
    id: string;
    content: string;
    createdAt: string;
    novel: {
      id: string;
      title: string;
    };
  }>;
  reviewLogs: Array<{
    id: string;
    targetType: string;
    targetId: string;
    action: string;
    reason?: string | null;
    createdAt: string;
  }>;
  _count: {
    bookshelfItems: number;
    comments: number;
    novels: number;
    readingHistories: number;
    reviewLogs: number;
  };
}

export interface PaginatedNovels {
  items: Novel[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface PaginatedUsers {
  items: AdminUser[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminAuthorApplication {
  id: string;
  userId: string;
  penName: string;
  bio?: string | null;
  statement: string;
  status: AuthorApplicationStatus;
  reviewReason?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  user: AdminUser;
  reviewedBy?: { id: string; nickname: string } | null;
}

export interface PaginatedAuthorApplications {
  items: AdminAuthorApplication[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminAuditLog {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  createdAt: string;
  actor: {
    id: string;
    nickname: string;
    email: string;
    role: UserRole;
  };
}

export interface PaginatedAuditLogs {
  items: AdminAuditLog[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface RecommendSlotItem {
  id: string;
  sortOrder: number;
  novel: Novel;
}

export interface RecommendSlot {
  id: string;
  code: string;
  name: string;
  items: RecommendSlotItem[];
}

export interface ReviewNovel {
  id: string;
  title: string;
  summary: string;
  status: 'REVIEWING' | 'REJECTED' | 'SERIALIZING' | 'COMPLETED' | 'HIDDEN' | 'DRAFT';
  wordCount: number;
  updatedAt: string;
  author: {
    id: string;
    nickname: string;
    email: string;
  };
  category: Category;
  tags: Array<{ id: string; name: string }>;
  _count: {
    chapters: number;
  };
}

export interface ReviewChapter {
  id: string;
  title: string;
  status: 'REVIEWING' | 'SCHEDULED' | 'PUBLISHED' | 'REJECTED' | 'DRAFT';
  wordCount: number;
  orderIndex: number;
  scheduledAt?: string | null;
  updatedAt: string;
  novel: {
    id: string;
    title: string;
    status: Novel['status'];
    author: {
      id: string;
      nickname: string;
      email: string;
    };
  };
}

export interface ReviewLog {
  id: string;
  targetType: string;
  targetId: string;
  action: string;
  reason?: string | null;
  createdAt: string;
  reviewer: {
    id: string;
    nickname: string;
    email: string;
  };
}

export interface ReviewDashboard {
  novels: ReviewNovel[];
  chapters: ReviewChapter[];
  counts: {
    novels: number;
    chapters: number;
  };
  recentLogs: ReviewLog[];
}

interface ReviewQueuePagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedReviewNovels {
  items: ReviewNovel[];
  pagination: ReviewQueuePagination;
}

export interface PaginatedReviewChapters {
  items: ReviewChapter[];
  pagination: ReviewQueuePagination;
}

export interface ReviewNovelDetail extends ReviewNovel {
  coverUrl?: string | null;
  createdAt: string;
  chapters: Array<{
    id: string;
    title: string;
    status: ReviewChapter['status'];
    orderIndex: number;
    wordCount: number;
    scheduledAt?: string | null;
    publishedAt?: string | null;
    updatedAt: string;
  }>;
  reviewLogs: ReviewLog[];
}

export interface ReviewChapterDetail extends Omit<ReviewChapter, 'novel'> {
  content: string;
  createdAt: string;
  publishedAt?: string | null;
  novel: ReviewChapter['novel'] & {
    category: Category;
  };
  reviewLogs: ReviewLog[];
}

export type ReviewTargetType = 'novel' | 'chapter';

export interface BatchActionResult {
  total: number;
  succeeded: number;
  failed: number;
  items: Array<{
    id: string;
    success: boolean;
    error?: string;
  }>;
}

export type BatchReviewResult = BatchActionResult;

export interface AdminComment {
  id: string;
  userId: string;
  novelId: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    nickname: string;
    email: string;
    role: UserRole;
  };
  novel: {
    id: string;
    title: string;
  };
}

export type ParagraphReportStatus = 'PENDING' | 'RESOLVED' | 'DISMISSED';
export type ParagraphReportReason = 'SPAM' | 'ABUSE' | 'SPOILER' | 'OTHER';
export type ParagraphReportStatsPeriod = 7 | 14 | 30;
export type ContentReportTargetType = 'NOVEL' | 'CHAPTER' | 'AUTHOR' | 'USER';
export type ContentAppealTargetType = 'NOVEL' | 'CHAPTER';
export type ContentAppealStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AdminContentReport {
  id: string;
  reporterId: string;
  targetType: ContentReportTargetType;
  targetId: string;
  targetTitle: string;
  targetOwnerId?: string | null;
  targetSnapshot: unknown;
  reason: ParagraphReportReason;
  detail?: string | null;
  status: ParagraphReportStatus;
  reviewerId?: string | null;
  resolution?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  reporter: {
    id: string;
    nickname: string;
    email: string;
  };
  reviewer?: {
    id: string;
    nickname: string;
    email: string;
  } | null;
}

export interface PaginatedContentReports {
  items: AdminContentReport[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ContentReportStats {
  periodDays: ParagraphReportStatsPeriod;
  overview: {
    created: number;
    pending: number;
    restricted: number;
    dismissed: number;
    resolutionRate: number;
    averageResolutionMinutes: number | null;
  };
  targetBreakdown: Array<{ targetType: ContentReportTargetType; count: number }>;
  reasonBreakdown: Array<{ reason: ParagraphReportReason; count: number }>;
  trend: Array<{
    date: string;
    created: number;
    restricted: number;
    dismissed: number;
  }>;
}

export interface AdminContentAppeal {
  id: string;
  appellantId: string;
  reviewerId?: string | null;
  targetType: ContentAppealTargetType;
  targetId: string;
  targetTitle: string;
  reason: string;
  status: ContentAppealStatus;
  resolution?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  appellant: { id: string; nickname: string; email: string };
  reviewer?: { id: string; nickname: string; email: string } | null;
  sourceReport?: {
    id: string;
    reason: ParagraphReportReason;
    resolution?: string | null;
    resolvedAt?: string | null;
    targetSnapshot: unknown;
  } | null;
  sourceAudit: { id: string; before: unknown; after: unknown; createdAt: string };
}

export interface PaginatedContentAppeals {
  items: AdminContentAppeal[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminParagraphCommentReport {
  id: string;
  reporterId: string;
  commentId: string;
  reason: ParagraphReportReason;
  detail?: string | null;
  status: ParagraphReportStatus;
  resolution?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  reporter: {
    id: string;
    nickname: string;
    email: string;
  };
  reviewer?: {
    id: string;
    nickname: string;
    email: string;
  } | null;
  comment: {
    id: string;
    paragraphIndex: number;
    content: string;
    isDeleted: boolean;
    user: {
      id: string;
      nickname: string;
      email: string;
      role: UserRole;
    };
    chapter: {
      id: string;
      title: string;
      novel: {
        id: string;
        title: string;
      };
    };
  };
}

export interface PaginatedParagraphCommentReports {
  items: AdminParagraphCommentReport[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export type CommentReportSource = 'ALL' | 'NOVEL' | 'CHAPTER';

export interface AdminCommentReport {
  id: string;
  reporterId: string;
  commentId?: string | null;
  reason: ParagraphReportReason;
  detail?: string | null;
  status: ParagraphReportStatus;
  reviewerId?: string | null;
  resolution?: string | null;
  resolvedAt?: string | null;
  contentSnapshot: string;
  commentAuthorId: string;
  commentAuthorNickname: string;
  commentAuthorEmail: string;
  novelId: string;
  novelTitle: string;
  chapterId?: string | null;
  chapterTitle?: string | null;
  createdAt: string;
  updatedAt: string;
  reporter: {
    id: string;
    nickname: string;
    email: string;
  };
  reviewer?: {
    id: string;
    nickname: string;
    email: string;
  } | null;
}

export interface PaginatedCommentReports {
  items: AdminCommentReport[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ParagraphReportStats {
  periodDays: ParagraphReportStatsPeriod;
  overview: {
    created: number;
    pending: number;
    resolved: number;
    dismissed: number;
    resolutionRate: number;
    averageResolutionMinutes: number | null;
  };
  reasonBreakdown: Array<{
    reason: ParagraphReportReason;
    count: number;
  }>;
  trend: Array<{
    date: string;
    created: number;
    resolved: number;
    dismissed: number;
  }>;
}

export interface SensitiveWordRule {
  id: string;
  term: string;
  normalizedTerm: string;
  scope: SensitiveWordScope;
  note?: string | null;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    id: string;
    nickname: string;
    email: string;
  } | null;
}

export interface PaginatedSensitiveWordRules {
  items: SensitiveWordRule[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

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
    ...requestInit,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const payload = (await response.json().catch(() => undefined)) as ApiResponse<T> | undefined;

  if (!response.ok) {
    throw new ApiError(payload?.message ?? '请求失败', response.status);
  }

  if (!payload) {
    throw new ApiError('响应格式错误', response.status);
  }

  return payload.data;
}

export const api = {
  login(payload: { email: string; password: string }) {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  me(token: string) {
    return request<User>('/auth/me', { token });
  },

  listReviews(token: string) {
    return request<ReviewDashboard>('/admin/reviews', { token });
  },

  listNovelReviewQueue(
    token: string,
    query: { page?: number; pageSize?: number; keyword?: string } = {},
  ) {
    const params = new URLSearchParams({ targetType: 'novel' });
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.set(key, String(value));
      }
    });
    return request<PaginatedReviewNovels>(`/admin/reviews/queue?${params}`, { token });
  },

  listChapterReviewQueue(
    token: string,
    query: { page?: number; pageSize?: number; keyword?: string } = {},
  ) {
    const params = new URLSearchParams({ targetType: 'chapter' });
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.set(key, String(value));
      }
    });
    return request<PaginatedReviewChapters>(`/admin/reviews/queue?${params}`, { token });
  },

  getNovelReviewDetail(token: string, id: string) {
    return request<ReviewNovelDetail>(`/admin/reviews/novels/${id}`, { token });
  },

  getChapterReviewDetail(token: string, id: string) {
    return request<ReviewChapterDetail>(`/admin/reviews/chapters/${id}`, { token });
  },

  batchReview(
    token: string,
    payload: {
      targetType: ReviewTargetType;
      ids: string[];
      action: 'approve' | 'reject';
      reason?: string;
    },
  ) {
    return request<BatchReviewResult>('/admin/reviews/batch', {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  reviewNovel(
    token: string,
    id: string,
    payload: { action: 'approve' | 'reject'; reason?: string },
  ) {
    return request<ReviewNovel>(`/admin/reviews/novels/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  reviewChapter(
    token: string,
    id: string,
    payload: { action: 'approve' | 'reject'; reason?: string },
  ) {
    return request<ReviewChapter>(`/admin/reviews/chapters/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  listComments(token: string) {
    return request<AdminComment[]>('/admin/comments', { token });
  },

  deleteComment(token: string, id: string) {
    return request<{ deleted: boolean }>(`/admin/comments/${id}`, {
      method: 'DELETE',
      token,
    });
  },

  deleteCommentsBatch(token: string, ids: string[]) {
    return request<BatchActionResult>('/admin/comments', {
      method: 'DELETE',
      token,
      body: JSON.stringify({ ids }),
    });
  },

  listParagraphCommentReports(
    token: string,
    query: { page?: number; pageSize?: number; status?: ParagraphReportStatus } = {},
  ) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined) {
        params.set(key, String(value));
      }
    });
    const search = params.toString();
    return request<PaginatedParagraphCommentReports>(
      `/admin/paragraph-comment-reports${search ? `?${search}` : ''}`,
      { token },
    );
  },

  listCommentReports(
    token: string,
    query: {
      page?: number;
      pageSize?: number;
      status?: ParagraphReportStatus;
      source?: CommentReportSource;
      keyword?: string;
    } = {},
  ) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.set(key, String(value));
      }
    });
    const search = params.toString();
    return request<PaginatedCommentReports>(`/admin/comment-reports${search ? `?${search}` : ''}`, {
      token,
    });
  },

  reviewCommentReport(
    token: string,
    id: string,
    payload: { action: 'dismiss' | 'remove'; note?: string },
  ) {
    return request<AdminCommentReport>(`/admin/comment-reports/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  reviewCommentReportsBatch(
    token: string,
    payload: { ids: string[]; action: 'dismiss' | 'remove'; note?: string },
  ) {
    return request<BatchActionResult>('/admin/comment-reports/batch', {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  getParagraphCommentReportStats(token: string, days: ParagraphReportStatsPeriod = 7) {
    return request<ParagraphReportStats>(`/admin/paragraph-comment-reports/stats?days=${days}`, {
      token,
    });
  },

  reviewParagraphCommentReport(
    token: string,
    id: string,
    payload: { action: 'dismiss' | 'remove'; note?: string },
  ) {
    return request<AdminParagraphCommentReport>(`/admin/paragraph-comment-reports/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  reviewParagraphCommentReportsBatch(
    token: string,
    payload: { ids: string[]; action: 'dismiss' | 'remove'; note?: string },
  ) {
    return request<BatchActionResult>('/admin/paragraph-comment-reports/batch', {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  listSensitiveWordRules(
    token: string,
    query: {
      page?: number;
      pageSize?: number;
      keyword?: string;
      scope?: SensitiveWordScope;
      enabled?: boolean;
    } = {},
  ) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.set(key, String(value));
      }
    });
    const search = params.toString();
    return request<PaginatedSensitiveWordRules>(
      `/admin/sensitive-words${search ? `?${search}` : ''}`,
      { token },
    );
  },

  createSensitiveWordRule(
    token: string,
    payload: {
      term: string;
      scope: SensitiveWordScope;
      note?: string;
      isEnabled?: boolean;
    },
  ) {
    return request<SensitiveWordRule>('/admin/sensitive-words', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },

  updateSensitiveWordRule(
    token: string,
    ruleId: string,
    payload: {
      term?: string;
      scope?: SensitiveWordScope;
      note?: string;
      isEnabled?: boolean;
    },
  ) {
    return request<SensitiveWordRule>(`/admin/sensitive-words/${ruleId}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  deleteSensitiveWordRule(token: string, ruleId: string) {
    return request<{ deletedId: string }>(`/admin/sensitive-words/${ruleId}`, {
      method: 'DELETE',
      token,
    });
  },

  getTaxonomy(token: string) {
    return request<TaxonomyOverview>('/admin/taxonomy', { token });
  },

  createChannel(token: string, payload: { code: string; name: string; sortOrder?: number }) {
    return request<ContentChannel>('/admin/taxonomy/channels', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },

  updateChannel(token: string, id: string, payload: { name?: string; sortOrder?: number }) {
    return request<ContentChannel>(`/admin/taxonomy/channels/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  deleteChannel(token: string, id: string) {
    return request<{ deletedId: string }>(`/admin/taxonomy/channels/${id}`, {
      method: 'DELETE',
      token,
    });
  },

  createCategory(token: string, payload: { name: string; channel: string; sortOrder?: number }) {
    return request<TaxonomyCategory>('/admin/taxonomy/categories', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },

  updateCategory(
    token: string,
    id: string,
    payload: { name?: string; channel?: string; sortOrder?: number },
  ) {
    return request<TaxonomyCategory>(`/admin/taxonomy/categories/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  deleteCategory(token: string, id: string) {
    return request<{ deletedId: string }>(`/admin/taxonomy/categories/${id}`, {
      method: 'DELETE',
      token,
    });
  },

  createTag(token: string, payload: { name: string; sortOrder?: number }) {
    return request<TaxonomyTag>('/admin/taxonomy/tags', {
      method: 'POST',
      token,
      body: JSON.stringify(payload),
    });
  },

  updateTag(token: string, id: string, payload: { name?: string; sortOrder?: number }) {
    return request<TaxonomyTag>(`/admin/taxonomy/tags/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  deleteTag(token: string, id: string) {
    return request<{ deletedId: string }>(`/admin/taxonomy/tags/${id}`, {
      method: 'DELETE',
      token,
    });
  },

  listContentReports(
    token: string,
    query: {
      page?: number;
      pageSize?: number;
      status?: ParagraphReportStatus;
      targetType?: ContentReportTargetType;
      keyword?: string;
    } = {},
  ) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.set(key, String(value));
    });
    const search = params.toString();
    return request<PaginatedContentReports>(`/admin/content-reports${search ? `?${search}` : ''}`, {
      token,
    });
  },

  getContentReportStats(token: string, days: ParagraphReportStatsPeriod = 7) {
    return request<ContentReportStats>(`/admin/content-reports/stats?days=${days}`, { token });
  },

  reviewContentReport(
    token: string,
    id: string,
    payload: { action: 'dismiss' | 'restrict'; note?: string },
  ) {
    return request<AdminContentReport>(`/admin/content-reports/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  reviewContentReportsBatch(
    token: string,
    payload: { ids: string[]; action: 'dismiss' | 'restrict'; note?: string },
  ) {
    return request<BatchActionResult>('/admin/content-reports/batch', {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  listContentAppeals(
    token: string,
    query: {
      page?: number;
      pageSize?: number;
      status?: ContentAppealStatus;
      targetType?: ContentAppealTargetType;
      keyword?: string;
    } = {},
  ) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') params.set(key, String(value));
    });
    const search = params.toString();
    return request<PaginatedContentAppeals>(`/admin/content-appeals${search ? `?${search}` : ''}`, {
      token,
    });
  },

  reviewContentAppeal(
    token: string,
    id: string,
    payload: { action: 'approve' | 'reject'; note?: string },
  ) {
    return request<AdminContentAppeal>(`/admin/content-appeals/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  listNovels(
    query: { page?: number; pageSize?: number; keyword?: string; sort?: 'latest' | 'popular' } = {},
  ) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined) {
        params.set(key, String(value));
      }
    });
    const search = params.toString();
    return request<PaginatedNovels>(`/novels${search ? `?${search}` : ''}`);
  },

  listAdminNovels(
    token: string,
    query: {
      page?: number;
      pageSize?: number;
      keyword?: string;
      status?: Novel['status'];
      sort?: 'latest' | 'popular';
    } = {},
  ) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.set(key, String(value));
      }
    });
    const search = params.toString();
    return request<PaginatedNovels>(`/admin/novels${search ? `?${search}` : ''}`, { token });
  },

  getAdminNovel(token: string, id: string) {
    return request<AdminNovelDetail>(`/admin/novels/${id}`, { token });
  },

  updateNovelStatus(token: string, id: string, status: Novel['status']) {
    return request<Novel>(`/admin/novels/${id}/status`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ status }),
    });
  },

  listAuthorApplications(
    token: string,
    query: { page?: number; pageSize?: number; status?: AuthorApplicationStatus } = {},
  ) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined) {
        params.set(key, String(value));
      }
    });
    const search = params.toString();
    return request<PaginatedAuthorApplications>(
      `/admin/author-applications${search ? `?${search}` : ''}`,
      { token },
    );
  },

  reviewAuthorApplication(
    token: string,
    id: string,
    payload: { action: 'approve' | 'reject'; reason?: string },
  ) {
    return request<AdminAuthorApplication>(`/admin/author-applications/${id}/review`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    });
  },

  listUsers(
    token: string,
    query: {
      page?: number;
      pageSize?: number;
      keyword?: string;
      role?: UserRole;
      status?: UserStatus;
    } = {},
  ) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.set(key, String(value));
      }
    });
    const search = params.toString();
    return request<PaginatedUsers>(`/admin/users${search ? `?${search}` : ''}`, { token });
  },

  getAdminUser(token: string, id: string) {
    return request<AdminUserDetail>(`/admin/users/${id}`, { token });
  },

  updateUserRole(token: string, id: string, role: UserRole) {
    return request<AdminUser>(`/admin/users/${id}/role`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ role }),
    });
  },

  updateUserStatus(token: string, id: string, status: UserStatus, reason?: string) {
    return request<AdminUser>(`/admin/users/${id}/status`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ status, reason }),
    });
  },

  listAuditLogs(
    token: string,
    query: {
      page?: number;
      pageSize?: number;
      keyword?: string;
      action?: string;
      targetType?: string;
      actorId?: string;
    } = {},
  ) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== '') {
        params.set(key, String(value));
      }
    });
    const search = params.toString();
    return request<PaginatedAuditLogs>(`/admin/audit-logs${search ? `?${search}` : ''}`, {
      token,
    });
  },

  getRecommendSlot(token: string, code: string) {
    return request<RecommendSlot>(`/admin/recommend-slots/${code}`, { token });
  },

  updateRecommendSlotItems(token: string, code: string, novelIds: string[]) {
    return request<RecommendSlot>(`/admin/recommend-slots/${code}/items`, {
      method: 'PUT',
      token,
      body: JSON.stringify({ novelIds }),
    });
  },
};
