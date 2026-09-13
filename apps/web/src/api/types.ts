export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export type UserRole = 'READER' | 'AUTHOR' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';
export type AuthorSaveAction = 'save' | 'submit';
export type AuthorChapterSaveSource = 'manual' | 'autosave';
export type AuthorAiAction =
  | 'character'
  | 'naming'
  | 'inspiration'
  | 'research'
  | 'summary'
  | 'outline'
  | 'polish'
  | 'consistency';
export type ReaderAiAction = 'ask' | 'summary' | 'recall' | 'explain';
export type AuthorApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface User {
  id: string;
  email: string;
  nickname: string;
  role: UserRole;
  status: UserStatus;
  emailVerified: boolean;
  createdAt: string;
  deletionRequestedAt?: string | null;
  deletionScheduledAt?: string | null;
}

export interface AccountDeletionStatus {
  pending: boolean;
  requestedAt: string | null;
  scheduledAt: string | null;
  reason: string | null;
  daysRemaining: number;
}

export interface AccountDeletionRequestResult extends AccountDeletionStatus {
  revokedSessions: number;
}

export interface PersonalDataExport {
  format: 'novel-platform-personal-data';
  version: number;
  generatedAt: string;
  account: Record<string, unknown>;
  author: Record<string, unknown>;
  reading: Record<string, unknown>;
  interactions: Record<string, unknown>;
  communication: Record<string, unknown>;
  security: Record<string, unknown>;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  sessionId: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshExpiresIn: number;
  user: User;
  usedRecoveryCode?: boolean;
}

export interface TwoFactorLoginChallenge {
  requiresTwoFactor: true;
  challengeToken: string;
  expiresIn: number;
  recoveryCodesAvailable: number;
}

export type AuthLoginResult = AuthResponse | TwoFactorLoginChallenge;

export interface TwoFactorStatus {
  enabled: boolean;
  enabledAt: string | null;
  pendingSetup: boolean;
  recoveryCodesRemaining: number;
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

export interface TwoFactorEnableResult {
  enabled: true;
  enabledAt: string;
  recoveryCodes: string[];
  recoveryCodesRemaining: number;
  revokedSessions: number;
}

export interface TwoFactorRecoveryCodesResult {
  recoveryCodes: string[];
  recoveryCodesRemaining: number;
}

export interface AuthSession {
  id: string;
  deviceName: string;
  ipAddress?: string | null;
  lastUsedAt: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export type LoginActivityStatus = 'SUCCESS' | 'FAILURE';
export type LoginRiskLevel = 'NORMAL' | 'NOTICE' | 'HIGH';

export interface LoginActivity {
  id: string;
  status: LoginActivityStatus;
  riskLevel: LoginRiskLevel;
  failureReason?: string | null;
  sessionId?: string | null;
  deviceName: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  occurredAt: string;
}

export interface PaginatedLoginActivities {
  items: LoginActivity[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface PasswordResetRequest {
  accepted: boolean;
  retryAfterSeconds: number;
  developmentCode?: string;
}

export interface EmailVerificationRequest {
  accepted: boolean;
  retryAfterSeconds: number;
  developmentCode?: string;
}

export interface Category {
  id: string;
  name: string;
  channel: string;
  sortOrder: number;
}

export interface AuthorSummary {
  id: string;
  nickname: string;
  email?: string;
  authorProfile?: {
    penName: string;
  } | null;
}

export interface PublicAuthorProfile {
  id: string;
  nickname: string;
  penName: string;
  bio?: string | null;
  authorSince: string;
  isSelf: boolean;
  isFollowing: boolean;
  stats: {
    followers: number;
    works: number;
    words: number;
    chapters: number;
    bookshelf: number;
  };
  novels: Novel[];
}

export interface FollowedAuthor {
  followedAt: string;
  author: {
    id: string;
    nickname: string;
    penName: string;
    bio?: string | null;
    followers: number;
    works: number;
  };
  latestNovels: Novel[];
}

export interface Tag {
  id: string;
  name: string;
}

export interface Novel {
  id: string;
  title: string;
  summary: string;
  coverUrl?: string | null;
  status: 'DRAFT' | 'REVIEWING' | 'REJECTED' | 'SERIALIZING' | 'COMPLETED' | 'HIDDEN';
  wordCount: number;
  authorId?: string;
  categoryId?: string;
  sourceName?: string | null;
  sourceUrl?: string | null;
  sourceAuthor?: string | null;
  sourceLicense?: string | null;
  createdAt: string;
  updatedAt: string;
  author: AuthorSummary;
  category: Category;
  tags: Tag[];
  _count?: {
    chapters?: number;
    comments?: number;
    bookshelf?: number;
  };
}

export interface ChapterSummary {
  id: string;
  title: string;
  orderIndex: number;
  wordCount: number;
  publishedAt?: string | null;
  volumeId?: string | null;
  volume?: Pick<NovelVolume, 'id' | 'title' | 'orderIndex'> | null;
}

export interface Chapter extends ChapterSummary {
  content: string;
  novel: {
    id: string;
    title: string;
    sourceAuthor?: string | null;
    author: AuthorSummary;
  };
}

export interface AuthorNovel extends Novel {
  _count: {
    chapters: number;
  };
  chapters?: DraftChapter[];
  volumes: NovelVolume[];
  announcements: NovelAnnouncement[];
  latestRejection?: ReviewBrief | null;
}

export interface NovelAnnouncement {
  id: string;
  novelId: string;
  title: string;
  content: string;
  isPinned: boolean;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NovelVolume {
  id: string;
  novelId: string;
  title: string;
  description?: string | null;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
  _count?: {
    chapters: number;
  };
}

export interface DraftChapter {
  id: string;
  novelId: string;
  volumeId?: string | null;
  volume?: Pick<NovelVolume, 'id' | 'title' | 'orderIndex'> | null;
  title: string;
  content: string;
  orderIndex: number;
  status: 'DRAFT' | 'REVIEWING' | 'SCHEDULED' | 'PUBLISHED' | 'REJECTED';
  wordCount: number;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  latestRejection?: ReviewBrief | null;
}

export interface AuthorAiAssistanceResult {
  action: AuthorAiAction;
  content: string;
  model: string;
  sources?: Array<{
    chapterId: string;
    chapterOrder: number;
    chunkIndex: number;
    score: number;
    vectorScore?: number;
    lexicalScore?: number;
    title?: string;
    excerpt?: string;
  }>;
}

export interface ReaderAiAssistanceResult {
  action: ReaderAiAction;
  answer: string;
  model: string;
  currentChapter: {
    id: string;
    orderIndex: number;
    title: string;
  };
  sources: Array<{
    chapterId: string;
    chapterOrder: number;
    title?: string;
    excerpt?: string;
    score?: number;
  }>;
}

export interface AuthorRagIndexStatus {
  enabled: boolean;
  novelId: string;
  chapterCount: number;
  indexedChapterCount: number;
  pendingChapterCount: number;
  chunkCount: number;
  indexedCharacterCount: number;
  lastIndexedAt: string | null;
  embeddingMode: string;
  embeddingModel: string;
}

export interface AuthorRagEvaluationResult {
  generatedAt: string;
  sampleSize: number;
  evaluatedCases: number;
  hitAt1: number;
  hitAt3: number;
  hitAt5: number;
  averageRank: number | null;
  cases: Array<{
    chapterId: string;
    chapterOrder: number;
    title: string;
    rank: number | null;
  }>;
  status: AuthorRagIndexStatus;
}

export interface AuthorRagReindexResult {
  novelId: string;
  indexedChapters: number;
  indexedChunks: number;
  changedChapters: number;
  skippedChapters: number;
  clearedChapters?: number;
  durationMs: number;
  embeddingMode: string;
  embeddingModel: string;
  status: AuthorRagIndexStatus;
}

export type NovelMemoryType =
  | 'CHARACTER'
  | 'RELATIONSHIP'
  | 'WORLDVIEW'
  | 'TIMELINE'
  | 'FORESHADOWING';

export interface NovelMemory {
  id: string;
  novelId: string;
  type: NovelMemoryType;
  title: string;
  content: string;
  sourceChapterId?: string | null;
  sourceChapter?: {
    id: string;
    title: string;
    orderIndex: number;
  } | null;
  isConfirmed: boolean;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface AuthorCollectionTaskPreview {
  taskId: string;
  createdAt: string;
  expiresAt: string;
  title: string;
  summary: string;
  coverUrl?: string | null;
  category: Pick<Category, 'id' | 'name'>;
  sourceName: string;
  sourceUrl: string;
  sourceAuthor?: string | null;
  sourceLicense: string;
  chapterCount: number;
  discoveredChapterCount: number;
  wordCount: number;
  isComplete: boolean;
  chapters: Array<{
    externalId: string;
    title: string;
    wordCount: number;
    sourceUrl: string;
    orderIndex?: number;
  }>;
}

export interface AuthorCollectionHtmlAnalysis {
  url: string;
  rootType: 'html';
  title: string;
  candidates: {
    titleSelectors: string[];
    summarySelectors: string[];
    chapterLinkSelectors: string[];
    contentSelectors: string[];
  };
  counts: {
    links: number;
    chapterLinks: number;
  };
}

export interface AuthorCollectionJsonAnalysis {
  url: string;
  rootType: string;
  fields: Array<{ path: string; type: string; sample: unknown }>;
  arrays: Array<{ path: string; length: number; itemFields: string[] }>;
  candidates: {
    titlePaths: string[];
    summaryPaths: string[];
    chapterArrayPaths: string[];
    contentPaths: string[];
    urlPaths: string[];
  };
}

export interface AuthorCollectionTaskResult {
  mode: 'committed';
  novelId: string;
  title: string;
  categoryName: string;
  chapterCount: number;
  wordCount: number;
  isComplete: boolean;
  sourceName: string;
  sourceUrl: string;
}

export type ChapterVersionSource = 'MANUAL' | 'AUTOSAVE' | 'SUBMIT' | 'RESTORE';

export interface ChapterVersion {
  id: string;
  chapterId: string;
  title: string;
  content: string;
  volumeId?: string | null;
  scheduledAt?: string | null;
  wordCount: number;
  source: ChapterVersionSource;
  createdAt: string;
}

export interface DeletedChapter extends DraftChapter {
  deletedAt: string;
  _count: {
    versions: number;
  };
}

export interface ChapterDeleteResult {
  deletedIds: string[];
  deletedCount: number;
  chapters: DraftChapter[];
}

export interface AuthorDashboardTrendPoint {
  date: string;
  bookshelfAdds: number;
  comments: number;
  publishedChapters: number;
  publishedWords: number;
}

export interface AuthorDashboardNovel {
  id: string;
  title: string;
  status: Novel['status'];
  chapters: number;
  publishedChapters: number;
  publishedWords: number;
  bookshelf: number;
  comments: number;
  updatedAt: string;
}

export interface AuthorDashboard {
  periodDays: number;
  overview: {
    novels: number;
    chapters: number;
    publishedChapters: number;
    publishedWords: number;
    bookshelf: number;
    comments: number;
  };
  statusBreakdown: Array<{ status: Novel['status']; count: number }>;
  trend: AuthorDashboardTrendPoint[];
  novels: AuthorDashboardNovel[];
}

export type AuthorCalendarEventType = 'WRITING' | 'REVISION' | 'REMINDER' | 'CHAPTER';
export type AuthorCalendarEventSource = 'PLAN' | 'CHAPTER_SCHEDULED' | 'CHAPTER_PUBLISHED';

export interface AuthorCalendarEvent {
  id: string;
  source: AuthorCalendarEventSource;
  type: AuthorCalendarEventType;
  title: string;
  note?: string | null;
  eventAt: string;
  isCompleted: boolean;
  editable: boolean;
  chapterId?: string;
  novel: Pick<Novel, 'id' | 'title'>;
}

export interface AuthorCalendar {
  month: string;
  summary: {
    plans: number;
    completedPlans: number;
    scheduledChapters: number;
    publishedChapters: number;
  };
  events: AuthorCalendarEvent[];
}

export interface AuthorProfile {
  id: string;
  userId: string;
  penName: string;
  bio?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthorApplication {
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
  reviewedBy?: { id: string; nickname: string } | null;
}

export interface AuthorOnboarding {
  canWrite: boolean;
  emailVerified: boolean;
  profile?: AuthorProfile | null;
  application?: AuthorApplication | null;
}

export interface ReviewBrief {
  id: string;
  targetType: string;
  targetId: string;
  action: string;
  reason?: string | null;
  createdAt: string;
  reviewer: {
    id: string;
    nickname: string;
  };
}

export interface BookshelfRecord {
  id: string;
  userId: string;
  novelId: string;
  notifyOnUpdate: boolean;
  createdAt: string;
  novel: Novel;
}

export interface BookshelfItem extends BookshelfRecord {
  latestChapter: ChapterSummary | null;
  continueChapter: ChapterSummary | null;
  readingProgress: number;
  readingSeconds: number;
  unreadCount: number;
  hasUpdate: boolean;
  lastUpdatedAt?: string | null;
  lastReadAt?: string | null;
}

export interface ReadingHistory {
  id: string;
  userId: string;
  novelId: string;
  chapterId: string;
  progress: number;
  readingSeconds: number;
  updatedAt: string;
  novel: Novel;
  chapter: ChapterSummary;
  isChapterCompleted?: boolean;
}

export interface NovelReadStatus {
  currentChapterId: string | null;
  currentProgress: number;
  completedChapterIds: string[];
  completedCount: number;
  totalChapters: number;
  isCaughtUp: boolean;
  lastCompletedAt?: string | null;
}

export type ReadingTheme = 'LIGHT' | 'SEPIA' | 'DARK';

export interface ReadingPreference {
  id?: string;
  userId?: string;
  fontSize: number;
  theme: ReadingTheme;
  lineHeight: number;
  contentWidth: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface ChapterBookmarkRecord {
  id: string;
  userId: string;
  chapterId: string;
  createdAt: string;
}

export interface ChapterBookmark extends ChapterBookmarkRecord {
  chapter: ChapterSummary & {
    novel: {
      id: string;
      title: string;
      author: AuthorSummary;
    };
  };
}

export type AnnotationColor = 'YELLOW' | 'GREEN' | 'BLUE' | 'PINK';

export interface ReadingAnnotation {
  id: string;
  userId: string;
  chapterId: string;
  paragraphIndex: number;
  startOffset: number;
  endOffset: number;
  selectedText: string;
  note?: string | null;
  color: AnnotationColor;
  createdAt: string;
  updatedAt: string;
}

export interface ReadingAnnotationWithContext extends ReadingAnnotation {
  chapter: {
    id: string;
    title: string;
    orderIndex: number;
    novel: {
      id: string;
      title: string;
    };
  };
}

export interface NovelComment {
  id: string;
  userId: string;
  novelId: string;
  chapterId?: string | null;
  parentId?: string | null;
  content: string | null;
  isDeleted: boolean;
  createdAt: string;
  user: {
    id: string;
    nickname: string;
    role: UserRole;
  };
  isAuthor: boolean;
  isLiked: boolean;
  likeCount: number;
  replies: NovelComment[];
}

export interface NovelRatingSummary {
  average: number;
  count: number;
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
  myScore: number | null;
}

export interface PaginatedComments {
  items: NovelComment[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ParagraphCommentSummary {
  items: Array<{
    paragraphIndex: number;
    count: number;
  }>;
  total: number;
}

export interface ParagraphComment {
  id: string;
  userId: string;
  chapterId: string;
  paragraphIndex: number;
  parentId?: string | null;
  content?: string | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    nickname: string;
    role: UserRole;
  };
  isAuthor: boolean;
  isLiked: boolean;
  likeCount: number;
  replies: ParagraphComment[];
}

export interface PaginatedParagraphComments {
  paragraphIndex: number;
  paragraph: string;
  items: ParagraphComment[];
  totalComments: number;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export type ParagraphReportReason = 'SPAM' | 'ABUSE' | 'SPOILER' | 'OTHER';

export type ContentReportTargetType = 'NOVEL' | 'CHAPTER' | 'AUTHOR' | 'USER';

export interface ContentReportSubmission {
  id: string;
  targetType: ContentReportTargetType;
  targetId: string;
  targetTitle: string;
  reason: ParagraphReportReason;
  detail?: string | null;
  status: 'PENDING' | 'RESOLVED' | 'DISMISSED';
  createdAt: string;
  updatedAt: string;
}

export type ContentAppealTargetType = 'NOVEL' | 'CHAPTER';
export type ContentAppealStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ContentAppealTarget {
  targetType: ContentAppealTargetType;
  targetId: string;
  targetTitle: string;
  restrictionReason?: string | null;
  restrictedAt: string;
  sourceReportId?: string | null;
  sourceAuditId: string;
}

export interface ContentAppeal {
  id: string;
  targetType: ContentAppealTargetType;
  targetId: string;
  targetTitle: string;
  reason: string;
  status: ContentAppealStatus;
  resolution?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  reviewer?: { id: string; nickname: string; email: string } | null;
  sourceReport?: {
    id: string;
    reason: ParagraphReportReason;
    resolution?: string | null;
    resolvedAt?: string | null;
    targetSnapshot: unknown;
  } | null;
}

export interface PaginatedContentAppeals {
  items: ContentAppeal[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface MyParagraphComment {
  id: string;
  userId: string;
  chapterId: string;
  paragraphIndex: number;
  parentId?: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
  chapter: {
    id: string;
    title: string;
    novel: {
      id: string;
      title: string;
    };
  };
  parent?: {
    id: string;
    user: {
      id: string;
      nickname: string;
    };
  } | null;
}

export interface PaginatedMyParagraphComments {
  items: MyParagraphComment[];
  pagination: PaginatedComments['pagination'];
}

export interface MyComment extends Omit<NovelComment, 'user'> {
  novel: {
    id: string;
    title: string;
    status: Novel['status'];
  };
  chapter?: {
    id: string;
    title: string;
  } | null;
}

export interface PaginatedMyComments {
  items: MyComment[];
  pagination: PaginatedComments['pagination'];
}

export type NotificationType = 'REVIEW' | 'COMMENT' | 'UPDATE' | 'SYSTEM';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  content: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationListResponse {
  items: Notification[];
  unreadCount: number;
  pagination: PaginatedComments['pagination'];
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

export interface PersonalizedRecommendationItem {
  novel: Novel;
  score: number;
  reason: string;
  matchedTags: string[];
}

export interface PersonalizedRecommendationResponse {
  source: 'personalized' | 'fallback';
  basis: {
    historyCount: number;
    bookshelfCount: number;
    categories: string[];
    tags: string[];
  };
  items: PersonalizedRecommendationItem[];
}

export type RankingType = 'popular' | 'bookshelf' | 'comments' | 'new';
export type RankingPeriod = 'day' | 'week' | 'month' | 'all';

export interface RankingItem {
  rank: number;
  score: number | string;
  novel: Novel;
}

export interface RankingResponse {
  type: RankingType;
  period: RankingPeriod;
  periodLabel: string;
  startedAt: string | null;
  generatedAt: string;
  title: string;
  scoreLabel: string;
  items: RankingItem[];
}

export interface SearchHistoryItem {
  id: string;
  keyword: string;
  searchCount: number;
  lastSearchedAt: string;
}

export interface HotSearchItem {
  id: string;
  keyword: string;
  searchCount: number;
  lastSearchedAt: string;
}

export interface SearchSuggestion {
  type: 'novel' | 'author' | 'tag';
  keyword: string;
  label: string;
  description: string;
  novelId?: string;
  authorId?: string;
}

export interface UploadResult {
  fileName: string;
  url: string;
  contentType: string;
  size: number;
}
