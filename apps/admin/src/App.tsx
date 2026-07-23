import { useEffect, useMemo, useState } from 'react';
import {
  AuditOutlined,
  BarChartOutlined,
  BookOutlined,
  CheckCircleOutlined,
  DashboardOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  EyeOutlined,
  FlagOutlined,
  HistoryOutlined,
  IdcardOutlined,
  LogoutOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SecurityScanOutlined,
  StopOutlined,
  TagsOutlined,
  TeamOutlined,
  UpOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Layout,
  Menu,
  Modal,
  Segmented,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tabs,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  AdminAuthorApplication,
  AdminCommentReport,
  AdminNovelDetail,
  AdminParagraphCommentReport,
  AdminAuditLog,
  AdminUser,
  AdminUserDetail,
  AdminComment,
  api,
  ApiError,
  AuthorApplicationStatus,
  BatchActionResult,
  BatchReviewResult,
  CommentReportSource,
  Novel,
  PaginatedNovels,
  PaginatedCommentReports,
  PaginatedParagraphCommentReports,
  PaginatedReviewChapters,
  PaginatedReviewNovels,
  ParagraphReportStats,
  ParagraphReportStatsPeriod,
  PaginatedSensitiveWordRules,
  PaginatedAuditLogs,
  PaginatedAuthorApplications,
  PaginatedUsers,
  RecommendSlot,
  SensitiveWordRule,
  SensitiveWordScope,
  ParagraphReportStatus,
  ReviewChapter,
  ReviewChapterDetail,
  ReviewDashboard,
  ReviewNovel,
  ReviewNovelDetail,
  User,
  UserStatus,
} from './api/client';
import { ContentSafety } from './ContentSafety';
import { TaxonomyManagement } from './TaxonomyManagement';

const { Header, Sider, Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const TOKEN_KEY = 'novel_admin_access_token';
const HOME_FEATURED_CODE = 'home_featured';

type SectionKey =
  | 'dashboard'
  | 'review'
  | 'reports'
  | 'safety'
  | 'moderation'
  | 'taxonomy'
  | 'authors'
  | 'books'
  | 'users'
  | 'recommend'
  | 'audit';
type AdminNovelStatus = Novel['status'];
type AdminNovelSort = 'latest' | 'popular';
type ReviewHandler = (
  type: 'novel' | 'chapter',
  id: string,
  action: 'approve' | 'reject',
  reason?: string,
) => Promise<void>;
type BatchReviewHandler = (
  type: 'novel' | 'chapter',
  ids: string[],
  action: 'approve' | 'reject',
  reason?: string,
) => Promise<BatchReviewResult>;
type BatchCommentDeleteHandler = (ids: string[]) => Promise<BatchActionResult>;
type BatchParagraphReportHandler = (
  ids: string[],
  action: 'dismiss' | 'remove',
) => Promise<BatchActionResult>;
type ReviewDetailState =
  { type: 'novel'; data: ReviewNovelDetail } | { type: 'chapter'; data: ReviewChapterDetail };

function App() {
  const [token, setToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) ?? '');
  const [user, setUser] = useState<User>();
  const [section, setSection] = useState<SectionKey>('dashboard');
  const [dashboard, setDashboard] = useState<ReviewDashboard>({
    novels: [],
    chapters: [],
    counts: { novels: 0, chapters: 0 },
    recentLogs: [],
  });
  const [reviewNovels, setReviewNovels] = useState<PaginatedReviewNovels>({
    items: [],
    pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
  });
  const [reviewChapters, setReviewChapters] = useState<PaginatedReviewChapters>({
    items: [],
    pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
  });
  const [reviewKeyword, setReviewKeyword] = useState('');
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [paragraphReports, setParagraphReports] = useState<PaginatedParagraphCommentReports>({
    items: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  });
  const [paragraphReportStatus, setParagraphReportStatus] =
    useState<ParagraphReportStatus>('PENDING');
  const [commentReports, setCommentReports] = useState<PaginatedCommentReports>({
    items: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  });
  const [commentReportStatus, setCommentReportStatus] = useState<ParagraphReportStatus>('PENDING');
  const [commentReportSource, setCommentReportSource] = useState<CommentReportSource>('ALL');
  const [commentReportKeyword, setCommentReportKeyword] = useState('');
  const [paragraphReportStats, setParagraphReportStats] = useState<ParagraphReportStats>();
  const [paragraphReportDays, setParagraphReportDays] = useState<ParagraphReportStatsPeriod>(7);
  const [managedNovels, setManagedNovels] = useState<PaginatedNovels>({
    items: [],
    pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
  });
  const [managedUsers, setManagedUsers] = useState<PaginatedUsers>({
    items: [],
    pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
  });
  const [authorApplications, setAuthorApplications] = useState<PaginatedAuthorApplications>({
    items: [],
    pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
  });
  const [authorApplicationStatus, setAuthorApplicationStatus] =
    useState<AuthorApplicationStatus>('PENDING');
  const [platformTotals, setPlatformTotals] = useState({ novels: 0, users: 0 });
  const [auditLogs, setAuditLogs] = useState<PaginatedAuditLogs>({
    items: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  });
  const [novelKeyword, setNovelKeyword] = useState('');
  const [novelStatus, setNovelStatus] = useState<AdminNovelStatus | undefined>();
  const [novelSort, setNovelSort] = useState<AdminNovelSort>('latest');
  const [userKeyword, setUserKeyword] = useState('');
  const [userRole, setUserRole] = useState<User['role'] | undefined>();
  const [userStatus, setUserStatus] = useState<UserStatus | undefined>();
  const [auditKeyword, setAuditKeyword] = useState('');
  const [auditAction, setAuditAction] = useState<string>();
  const [auditTargetType, setAuditTargetType] = useState<string>();
  const [recommendSlot, setRecommendSlot] = useState<RecommendSlot>();
  const [candidateNovels, setCandidateNovels] = useState<Novel[]>([]);
  const [selectedNovelDetail, setSelectedNovelDetail] = useState<AdminNovelDetail>();
  const [selectedUserDetail, setSelectedUserDetail] = useState<AdminUserDetail>();
  const [selectedAuditLog, setSelectedAuditLog] = useState<AdminAuditLog>();
  const [selectedReviewDetail, setSelectedReviewDetail] = useState<ReviewDetailState>();
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isReviewLoading, setIsReviewLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

  const recommendedNovels = recommendSlot?.items.map((item) => item.novel) ?? [];

  const metrics = useMemo(
    () => [
      { label: '待审作品', value: dashboard.counts.novels },
      { label: '待审章节', value: dashboard.counts.chapters },
      { label: '作品总数', value: platformTotals.novels },
      { label: '用户总数', value: platformTotals.users },
    ],
    [
      dashboard.counts.chapters,
      dashboard.counts.novels,
      platformTotals.novels,
      platformTotals.users,
    ],
  );

  async function loadAll(activeToken = token) {
    if (!activeToken) {
      return;
    }

    setIsLoading(true);
    setError(undefined);
    try {
      const [reviewData, commentList, slot, novelPage, novelTotals, userTotals] = await Promise.all(
        [
          api.listReviews(activeToken),
          api.listComments(activeToken),
          api.getRecommendSlot(activeToken, HOME_FEATURED_CODE),
          api.listNovels({ pageSize: 50 }),
          api.listAdminNovels(activeToken, { page: 1, pageSize: 1 }),
          api.listUsers(activeToken, { page: 1, pageSize: 1 }),
        ],
      );
      setDashboard(reviewData);
      setComments(commentList);
      setRecommendSlot(slot);
      setCandidateNovels(novelPage.items);
      setPlatformTotals({
        novels: novelTotals.pagination.total,
        users: userTotals.pagination.total,
      });
      await Promise.all([
        loadManagedNovels(activeToken),
        loadManagedUsers(activeToken),
        loadAuthorApplications(activeToken, { page: 1, status: 'PENDING' }),
        loadAuditLogs(activeToken),
        loadReviewQueues(activeToken),
        loadCommentReports(activeToken, { page: 1, status: 'PENDING' }),
        loadParagraphReports(activeToken, { page: 1, status: 'PENDING' }),
        loadParagraphReportStats(activeToken),
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function restore() {
      if (!token) {
        setIsReady(true);
        return;
      }

      try {
        const profile = await api.me(token);
        if (profile.role !== 'ADMIN') {
          throw new ApiError('当前账号不是管理员');
        }
        if (isMounted) {
          setUser(profile);
          await loadAll(token);
        }
      } catch (err) {
        localStorage.removeItem(TOKEN_KEY);
        if (isMounted) {
          setToken('');
          setUser(undefined);
          setError(err instanceof Error ? err.message : '登录状态已失效');
        }
      } finally {
        if (isMounted) {
          setIsReady(true);
        }
      }
    }

    void restore();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleLogin(values: { email: string; password: string }) {
    setIsLoading(true);
    setError(undefined);
    try {
      const response = await api.login(values);
      if (response.user.role !== 'ADMIN') {
        throw new ApiError('当前账号不是管理员');
      }
      localStorage.setItem(TOKEN_KEY, response.accessToken);
      setToken(response.accessToken);
      setUser(response.user);
      await loadAll(response.accessToken);
      message.success('登录成功');
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setIsLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setUser(undefined);
    setDashboard({
      novels: [],
      chapters: [],
      counts: { novels: 0, chapters: 0 },
      recentLogs: [],
    });
    setReviewNovels({
      items: [],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
    });
    setReviewChapters({
      items: [],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
    });
    setComments([]);
    setRecommendSlot(undefined);
    setCandidateNovels([]);
    setManagedNovels({ items: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 } });
    setManagedUsers({ items: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 } });
    setAuthorApplications({
      items: [],
      pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
    });
    setPlatformTotals({ novels: 0, users: 0 });
    setAuditLogs({ items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
    setParagraphReports({
      items: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
    setCommentReports({
      items: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
    setParagraphReportStats(undefined);
    setNovelKeyword('');
    setNovelStatus(undefined);
    setNovelSort('latest');
    setUserKeyword('');
    setUserRole(undefined);
    setUserStatus(undefined);
    setAuthorApplicationStatus('PENDING');
    setAuditKeyword('');
    setAuditAction(undefined);
    setAuditTargetType(undefined);
    setParagraphReportStatus('PENDING');
    setCommentReportStatus('PENDING');
    setCommentReportSource('ALL');
    setCommentReportKeyword('');
    setParagraphReportDays(7);
    setReviewKeyword('');
    setSelectedNovelDetail(undefined);
    setSelectedUserDetail(undefined);
    setSelectedAuditLog(undefined);
    setSelectedReviewDetail(undefined);
  }

  async function loadManagedNovels(
    activeToken = token,
    options: {
      page?: number;
      pageSize?: number;
      keyword?: string;
      status?: AdminNovelStatus | null;
      sort?: AdminNovelSort;
    } = {},
  ) {
    if (!activeToken) {
      return;
    }

    const hasKeyword = Object.prototype.hasOwnProperty.call(options, 'keyword');
    const hasStatus = Object.prototype.hasOwnProperty.call(options, 'status');
    const nextKeyword = hasKeyword ? options.keyword : novelKeyword;
    const nextStatus = hasStatus ? (options.status ?? undefined) : novelStatus;

    const data = await api.listAdminNovels(activeToken, {
      page: options.page ?? managedNovels.pagination.page,
      pageSize: options.pageSize ?? managedNovels.pagination.pageSize,
      keyword: nextKeyword,
      status: nextStatus,
      sort: options.sort ?? novelSort,
    });
    setManagedNovels(data);
  }

  async function loadManagedUsers(
    activeToken = token,
    options: {
      page?: number;
      pageSize?: number;
      keyword?: string;
      role?: User['role'] | null;
      status?: UserStatus | null;
    } = {},
  ) {
    if (!activeToken) {
      return;
    }

    const hasKeyword = Object.prototype.hasOwnProperty.call(options, 'keyword');
    const hasRole = Object.prototype.hasOwnProperty.call(options, 'role');
    const hasStatus = Object.prototype.hasOwnProperty.call(options, 'status');
    const nextKeyword = hasKeyword ? options.keyword : userKeyword;
    const nextRole = hasRole ? (options.role ?? undefined) : userRole;
    const nextStatus = hasStatus ? (options.status ?? undefined) : userStatus;

    const data = await api.listUsers(activeToken, {
      page: options.page ?? managedUsers.pagination.page,
      pageSize: options.pageSize ?? managedUsers.pagination.pageSize,
      keyword: nextKeyword,
      role: nextRole,
      status: nextStatus,
    });
    setManagedUsers(data);
  }

  async function loadAuthorApplications(
    activeToken = token,
    options: { page?: number; pageSize?: number; status?: AuthorApplicationStatus } = {},
  ) {
    if (!activeToken) {
      return;
    }
    const data = await api.listAuthorApplications(activeToken, {
      page: options.page ?? authorApplications.pagination.page,
      pageSize: options.pageSize ?? authorApplications.pagination.pageSize,
      status: options.status ?? authorApplicationStatus,
    });
    setAuthorApplications(data);
  }

  async function reviewAuthorApplication(
    id: string,
    action: 'approve' | 'reject',
    reason?: string,
  ) {
    if (!token) {
      return;
    }
    setIsLoading(true);
    try {
      await api.reviewAuthorApplication(token, id, { action, reason });
      message.success(action === 'approve' ? '作者申请已通过' : '作者申请已驳回');
      await Promise.all([
        loadAuthorApplications(token),
        loadManagedUsers(token),
        loadAuditLogs(token),
      ]);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '审核失败');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }

  async function loadAuditLogs(
    activeToken = token,
    options: {
      page?: number;
      pageSize?: number;
      keyword?: string;
      action?: string | null;
      targetType?: string | null;
    } = {},
  ) {
    if (!activeToken) {
      return;
    }

    const hasKeyword = Object.prototype.hasOwnProperty.call(options, 'keyword');
    const hasAction = Object.prototype.hasOwnProperty.call(options, 'action');
    const hasTargetType = Object.prototype.hasOwnProperty.call(options, 'targetType');
    const nextKeyword = hasKeyword ? options.keyword : auditKeyword;
    const nextAction = hasAction ? (options.action ?? undefined) : auditAction;
    const nextTargetType = hasTargetType ? (options.targetType ?? undefined) : auditTargetType;

    const data = await api.listAuditLogs(activeToken, {
      page: options.page ?? auditLogs.pagination.page,
      pageSize: options.pageSize ?? auditLogs.pagination.pageSize,
      keyword: nextKeyword,
      action: nextAction,
      targetType: nextTargetType,
    });
    setAuditLogs(data);
  }

  async function loadParagraphReports(
    activeToken = token,
    options: {
      page?: number;
      pageSize?: number;
      status?: ParagraphReportStatus;
    } = {},
  ) {
    if (!activeToken) {
      return;
    }

    const data = await api.listParagraphCommentReports(activeToken, {
      page: options.page ?? paragraphReports.pagination.page,
      pageSize: options.pageSize ?? paragraphReports.pagination.pageSize,
      status: options.status ?? paragraphReportStatus,
    });
    setParagraphReports(data);
  }

  async function loadCommentReports(
    activeToken = token,
    options: {
      page?: number;
      pageSize?: number;
      status?: ParagraphReportStatus;
      source?: CommentReportSource;
      keyword?: string;
    } = {},
  ) {
    if (!activeToken) {
      return;
    }

    const keyword = Object.prototype.hasOwnProperty.call(options, 'keyword')
      ? (options.keyword ?? '')
      : commentReportKeyword;
    const data = await api.listCommentReports(activeToken, {
      page: options.page ?? commentReports.pagination.page,
      pageSize: options.pageSize ?? commentReports.pagination.pageSize,
      status: options.status ?? commentReportStatus,
      source: options.source ?? commentReportSource,
      keyword: keyword || undefined,
    });
    setCommentReports(data);
  }

  async function loadParagraphReportStats(
    activeToken = token,
    days: ParagraphReportStatsPeriod = paragraphReportDays,
  ) {
    if (!activeToken) {
      return;
    }

    setParagraphReportStats(await api.getParagraphCommentReportStats(activeToken, days));
  }

  async function loadReviewQueues(
    activeToken = token,
    options: {
      novelPage?: number;
      novelPageSize?: number;
      chapterPage?: number;
      chapterPageSize?: number;
      keyword?: string;
    } = {},
  ) {
    if (!activeToken) {
      return;
    }

    const keyword = Object.prototype.hasOwnProperty.call(options, 'keyword')
      ? (options.keyword ?? '')
      : reviewKeyword;
    const [novels, chapters] = await Promise.all([
      api.listNovelReviewQueue(activeToken, {
        page: options.novelPage ?? reviewNovels.pagination.page,
        pageSize: options.novelPageSize ?? reviewNovels.pagination.pageSize,
        keyword: keyword || undefined,
      }),
      api.listChapterReviewQueue(activeToken, {
        page: options.chapterPage ?? reviewChapters.pagination.page,
        pageSize: options.chapterPageSize ?? reviewChapters.pagination.pageSize,
        keyword: keyword || undefined,
      }),
    ]);
    setReviewNovels(novels);
    setReviewChapters(chapters);
  }

  async function searchReviewQueues(keyword: string) {
    const normalized = keyword.trim();
    setReviewKeyword(normalized);
    setIsReviewLoading(true);
    try {
      await loadReviewQueues(token, {
        novelPage: 1,
        chapterPage: 1,
        keyword: normalized,
      });
    } catch (err) {
      message.error(err instanceof Error ? err.message : '搜索审核队列失败');
    } finally {
      setIsReviewLoading(false);
    }
  }

  async function changeReviewQueuePage(type: 'novel' | 'chapter', page: number, pageSize: number) {
    if (!token) {
      return;
    }
    setIsReviewLoading(true);
    try {
      if (type === 'novel') {
        setReviewNovels(
          await api.listNovelReviewQueue(token, {
            page,
            pageSize,
            keyword: reviewKeyword || undefined,
          }),
        );
      } else {
        setReviewChapters(
          await api.listChapterReviewQueue(token, {
            page,
            pageSize,
            keyword: reviewKeyword || undefined,
          }),
        );
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载审核队列失败');
    } finally {
      setIsReviewLoading(false);
    }
  }

  async function openReviewDetail(type: 'novel' | 'chapter', id: string) {
    if (!token) {
      return;
    }
    setIsDetailLoading(true);
    try {
      if (type === 'novel') {
        setSelectedReviewDetail({ type, data: await api.getNovelReviewDetail(token, id) });
      } else {
        setSelectedReviewDetail({ type, data: await api.getChapterReviewDetail(token, id) });
      }
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载审核详情失败');
    } finally {
      setIsDetailLoading(false);
    }
  }

  async function updateNovelStatus(id: string, status: AdminNovelStatus) {
    if (!token) {
      return;
    }

    setIsLoading(true);
    try {
      await api.updateNovelStatus(token, id, status);
      message.success('作品状态已更新');
      await loadAll(token);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新失败');
    } finally {
      setIsLoading(false);
    }
  }

  async function updateUserRole(id: string, role: User['role']) {
    if (!token) {
      return;
    }

    setIsLoading(true);
    try {
      await api.updateUserRole(token, id, role);
      message.success('用户角色已更新');
      await Promise.all([loadManagedUsers(token), loadAuditLogs(token)]);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新失败');
    } finally {
      setIsLoading(false);
    }
  }

  async function updateUserStatus(id: string, status: UserStatus, reason?: string) {
    if (!token) {
      return;
    }

    setIsLoading(true);
    try {
      await api.updateUserStatus(token, id, status, reason);
      message.success(status === 'SUSPENDED' ? '用户已封禁' : '用户已解封');
      await Promise.all([loadManagedUsers(token), loadAuditLogs(token)]);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '更新失败');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }

  async function openNovelDetail(id: string) {
    if (!token) {
      return;
    }

    setSelectedUserDetail(undefined);
    setIsDetailLoading(true);
    try {
      setSelectedNovelDetail(await api.getAdminNovel(token, id));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载作品详情失败');
    } finally {
      setIsDetailLoading(false);
    }
  }

  async function openUserDetail(id: string) {
    if (!token) {
      return;
    }

    setSelectedNovelDetail(undefined);
    setIsDetailLoading(true);
    try {
      setSelectedUserDetail(await api.getAdminUser(token, id));
    } catch (err) {
      message.error(err instanceof Error ? err.message : '加载用户详情失败');
    } finally {
      setIsDetailLoading(false);
    }
  }

  async function reviewTarget(
    type: 'novel' | 'chapter',
    id: string,
    action: 'approve' | 'reject',
    reason?: string,
  ) {
    if (!token) {
      return;
    }

    setIsLoading(true);
    try {
      if (type === 'novel') {
        await api.reviewNovel(token, id, { action, reason });
      } else {
        await api.reviewChapter(token, id, { action, reason });
      }
      message.success(action === 'approve' ? '已通过' : '已驳回');
      await loadAll(token);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '操作失败');
    } finally {
      setIsLoading(false);
    }
  }

  async function batchReviewTargets(
    type: 'novel' | 'chapter',
    ids: string[],
    action: 'approve' | 'reject',
    reason?: string,
  ) {
    if (!token) {
      throw new ApiError('登录状态已失效');
    }

    setIsLoading(true);
    try {
      const result = await api.batchReview(token, {
        targetType: type,
        ids,
        action,
        reason,
      });
      if (result.failed === 0) {
        message.success(`已完成 ${result.succeeded} 项审核`);
      } else {
        const firstError = result.items.find((item) => !item.success)?.error;
        message.warning(
          `${result.succeeded} 项成功，${result.failed} 项失败${firstError ? `：${firstError}` : ''}`,
        );
      }
      await loadAll(token);
      return result;
    } catch (err) {
      message.error(err instanceof Error ? err.message : '批量审核失败');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteComment(id: string) {
    if (!token) {
      return;
    }

    setIsLoading(true);
    try {
      await api.deleteComment(token, id);
      message.success('评论已删除');
      await loadAll(token);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '删除失败');
    } finally {
      setIsLoading(false);
    }
  }

  async function deleteCommentsBatch(ids: string[]) {
    if (!token) {
      throw new ApiError('登录状态已失效');
    }

    setIsLoading(true);
    try {
      const result = await api.deleteCommentsBatch(token, ids);
      showBatchResult(result, '删除');
      const [commentList] = await Promise.all([api.listComments(token), loadAuditLogs(token)]);
      setComments(commentList);
      return result;
    } catch (err) {
      message.error(err instanceof Error ? err.message : '批量删除评论失败');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }

  async function reviewParagraphReport(id: string, action: 'dismiss' | 'remove') {
    if (!token) {
      return;
    }

    setIsLoading(true);
    try {
      await api.reviewParagraphCommentReport(token, id, { action });
      message.success(action === 'remove' ? '违规段评已移除' : '举报已驳回');
      await Promise.all([
        loadParagraphReports(token),
        loadParagraphReportStats(token),
        loadAuditLogs(token),
      ]);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '举报处理失败');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }

  async function reviewCommentReport(id: string, action: 'dismiss' | 'remove') {
    if (!token) {
      return;
    }

    setIsLoading(true);
    try {
      await api.reviewCommentReport(token, id, { action });
      message.success(action === 'remove' ? '违规评论已移除' : '举报已驳回');
      const [commentList] = await Promise.all([
        api.listComments(token),
        loadCommentReports(token),
        loadAuditLogs(token),
      ]);
      setComments(commentList);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '举报处理失败');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }

  async function reviewCommentReportsBatch(ids: string[], action: 'dismiss' | 'remove') {
    if (!token) {
      throw new ApiError('登录状态已失效');
    }

    setIsLoading(true);
    try {
      const result = await api.reviewCommentReportsBatch(token, { ids, action });
      showBatchResult(result, action === 'remove' ? '移除' : '驳回');
      const [commentList] = await Promise.all([
        api.listComments(token),
        loadCommentReports(token),
        loadAuditLogs(token),
      ]);
      setComments(commentList);
      return result;
    } catch (err) {
      message.error(err instanceof Error ? err.message : '批量处理举报失败');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }

  async function reviewParagraphReportsBatch(ids: string[], action: 'dismiss' | 'remove') {
    if (!token) {
      throw new ApiError('登录状态已失效');
    }

    setIsLoading(true);
    try {
      const result = await api.reviewParagraphCommentReportsBatch(token, { ids, action });
      showBatchResult(result, action === 'remove' ? '移除' : '驳回');
      await Promise.all([
        loadParagraphReports(token),
        loadParagraphReportStats(token),
        loadAuditLogs(token),
      ]);
      return result;
    } catch (err) {
      message.error(err instanceof Error ? err.message : '批量处理举报失败');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }

  async function searchCandidates(keyword: string) {
    setIsLoading(true);
    try {
      const novelPage = await api.listNovels({
        pageSize: 50,
        keyword: keyword.trim() || undefined,
      });
      setCandidateNovels(novelPage.items);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '搜索失败');
    } finally {
      setIsLoading(false);
    }
  }

  async function saveRecommendations(nextNovels: Novel[]) {
    if (!token) {
      return;
    }

    setIsLoading(true);
    try {
      const nextSlot = await api.updateRecommendSlotItems(
        token,
        HOME_FEATURED_CODE,
        nextNovels.map((novel) => novel.id),
      );
      setRecommendSlot(nextSlot);
      message.success('推荐位已更新');
      await loadAuditLogs(token);
    } catch (err) {
      message.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setIsLoading(false);
    }
  }

  function addRecommendation(novel: Novel) {
    if (recommendedNovels.some((item) => item.id === novel.id)) {
      return;
    }
    void saveRecommendations([...recommendedNovels, novel]);
  }

  function removeRecommendation(novelId: string) {
    void saveRecommendations(recommendedNovels.filter((novel) => novel.id !== novelId));
  }

  function moveRecommendation(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= recommendedNovels.length) {
      return;
    }

    const next = [...recommendedNovels];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    void saveRecommendations(next);
  }

  if (!isReady) {
    return <BootScreen text="正在恢复登录状态..." />;
  }

  if (!user) {
    return <LoginScreen error={error} isLoading={isLoading} onLogin={handleLogin} />;
  }

  const headerCopy: Record<SectionKey, { title: string; description: string }> = {
    dashboard: {
      title: '运营仪表盘',
      description: '集中查看待处理内容、全站规模、推荐位和近期动态。',
    },
    review: {
      title: '内容审核',
      description: '审核作者提交的作品和章节，通过后进入用户端可见内容池。',
    },
    reports: {
      title: '评论举报',
      description: '统一处理作品评论、章节评论和段评举报，并保留完整处置记录。',
    },
    safety: {
      title: '内容安全',
      description: '处理作品、章节、作者和用户举报，并执行内容下架或账号限制。',
    },
    moderation: {
      title: '敏感词规则',
      description: '维护内容提交规则，并按作品、章节和评论范围控制拦截。',
    },
    taxonomy: {
      title: '分类运营',
      description: '维护频道、作品分类和标签，控制用户端筛选与作者创作选项。',
    },
    authors: {
      title: '作者申请',
      description: '审核读者提交的作者入驻申请，并创建笔名和作者资料。',
    },
    books: {
      title: '作品管理',
      description: '查看全站作品并调整上架、隐藏、完结等运营状态。',
    },
    users: {
      title: '用户管理',
      description: '查看用户基础信息，并调整账号状态和读者、作者、管理员角色。',
    },
    recommend: {
      title: '推荐位管理',
      description: '配置用户端首页的编辑推荐，支持添加、移除和调整顺序。',
    },
    audit: {
      title: '操作审计',
      description: '查询管理员的关键操作，并核对操作前后的数据变化。',
    },
  };

  return (
    <Layout className="admin-shell">
      <Sider width={236} className="admin-sider">
        <div className="admin-brand">
          <BookOutlined />
          <span>阅界管理端</span>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[section]}
          onClick={({ key }) => {
            if (
              key === 'review' ||
              key === 'reports' ||
              key === 'safety' ||
              key === 'moderation' ||
              key === 'taxonomy' ||
              key === 'authors' ||
              key === 'recommend' ||
              key === 'books' ||
              key === 'users' ||
              key === 'audit'
            ) {
              setSection(key);
            }
            if (key === 'dashboard') {
              setSection(key);
            }
          }}
          items={[
            { key: 'dashboard', icon: <DashboardOutlined />, label: '仪表盘' },
            { key: 'review', icon: <AuditOutlined />, label: '内容审核' },
            { key: 'reports', icon: <FlagOutlined />, label: '评论举报' },
            { key: 'safety', icon: <SecurityScanOutlined />, label: '内容安全' },
            { key: 'moderation', icon: <SafetyCertificateOutlined />, label: '敏感词规则' },
            { key: 'taxonomy', icon: <TagsOutlined />, label: '分类运营' },
            { key: 'authors', icon: <IdcardOutlined />, label: '作者申请' },
            { key: 'books', icon: <BookOutlined />, label: '作品管理' },
            { key: 'users', icon: <TeamOutlined />, label: '用户管理' },
            { key: 'recommend', icon: <BarChartOutlined />, label: '推荐位' },
            { key: 'audit', icon: <HistoryOutlined />, label: '操作审计' },
          ]}
        />
      </Sider>
      <Layout>
        <Header className="admin-header">
          <div>
            <Title level={3}>{headerCopy[section].title}</Title>
            <Text type="secondary">{headerCopy[section].description}</Text>
          </div>
          <Space>
            <Text type="secondary">{user.nickname}</Text>
            <Button icon={<ReloadOutlined />} onClick={() => loadAll()} loading={isLoading}>
              刷新
            </Button>
            <Button icon={<LogoutOutlined />} onClick={logout}>
              退出
            </Button>
          </Space>
        </Header>
        <Content className="admin-content">
          {error && <Alert className="admin-alert" type="error" message={error} showIcon />}

          <section className="metric-grid">
            {metrics.map((metric) => (
              <article key={metric.label}>
                <Text type="secondary">{metric.label}</Text>
                <strong>{metric.value}</strong>
              </article>
            ))}
          </section>

          {section === 'dashboard' ? (
            <DashboardSection
              comments={comments}
              dashboard={dashboard}
              isLoading={isLoading}
              platformTotals={platformTotals}
              recommendedNovels={recommendedNovels}
              onNavigate={setSection}
            />
          ) : section === 'reports' ? (
            <ReportsWorkspace
              commentKeyword={commentReportKeyword}
              commentReports={commentReports}
              commentSource={commentReportSource}
              commentStatus={commentReportStatus}
              isLoading={isLoading}
              paragraphReports={paragraphReports}
              paragraphStats={paragraphReportStats}
              paragraphStatsDays={paragraphReportDays}
              paragraphStatus={paragraphReportStatus}
              onCommentBatchReview={reviewCommentReportsBatch}
              onCommentKeywordChange={setCommentReportKeyword}
              onCommentPageChange={(page, pageSize) =>
                loadCommentReports(token, { page, pageSize })
              }
              onCommentReview={reviewCommentReport}
              onCommentSearch={(keyword) => {
                setCommentReportKeyword(keyword);
                return loadCommentReports(token, { page: 1, keyword });
              }}
              onCommentSourceChange={(source) => {
                setCommentReportSource(source);
                void loadCommentReports(token, { page: 1, source });
              }}
              onCommentStatusChange={(status) => {
                setCommentReportStatus(status);
                void loadCommentReports(token, { page: 1, status });
              }}
              onParagraphBatchReview={reviewParagraphReportsBatch}
              onParagraphPageChange={(page, pageSize) =>
                loadParagraphReports(token, { page, pageSize })
              }
              onParagraphReview={reviewParagraphReport}
              onParagraphStatsDaysChange={(days) => {
                setParagraphReportDays(days);
                void loadParagraphReportStats(token, days);
              }}
              onParagraphStatusChange={(status) => {
                setParagraphReportStatus(status);
                void loadParagraphReports(token, { page: 1, status });
              }}
            />
          ) : section === 'safety' ? (
            <ContentSafety token={token} />
          ) : section === 'moderation' ? (
            <SensitiveWordsSection token={token} />
          ) : section === 'taxonomy' ? (
            <TaxonomyManagement token={token} />
          ) : section === 'recommend' ? (
            <RecommendSection
              candidateNovels={candidateNovels}
              isLoading={isLoading}
              recommendedNovels={recommendedNovels}
              slotName={recommendSlot?.name ?? '首页编辑推荐'}
              onAdd={addRecommendation}
              onMove={moveRecommendation}
              onRemove={removeRecommendation}
              onSearch={searchCandidates}
            />
          ) : section === 'authors' ? (
            <AuthorApplicationsSection
              applications={authorApplications}
              isLoading={isLoading}
              status={authorApplicationStatus}
              onPageChange={(page, pageSize) => loadAuthorApplications(token, { page, pageSize })}
              onReview={reviewAuthorApplication}
              onStatusChange={(status) => {
                setAuthorApplicationStatus(status);
                void loadAuthorApplications(token, { page: 1, status });
              }}
            />
          ) : section === 'books' ? (
            <BooksSection
              isLoading={isLoading}
              keyword={novelKeyword}
              novels={managedNovels}
              sort={novelSort}
              status={novelStatus}
              onKeywordChange={setNovelKeyword}
              onPageChange={(page, pageSize) => loadManagedNovels(token, { page, pageSize })}
              onResetFilters={() => {
                setNovelKeyword('');
                setNovelStatus(undefined);
                setNovelSort('latest');
                return loadManagedNovels(token, {
                  page: 1,
                  keyword: '',
                  status: null,
                  sort: 'latest',
                });
              }}
              onSearch={(keyword) => {
                setNovelKeyword(keyword);
                return loadManagedNovels(token, { page: 1, keyword });
              }}
              onSortChange={(sort) => {
                setNovelSort(sort);
                void loadManagedNovels(token, { page: 1, sort });
              }}
              onStatusChange={(status) => {
                setNovelStatus(status);
                void loadManagedNovels(token, { page: 1, status: status ?? null });
              }}
              onUpdateStatus={updateNovelStatus}
              onViewDetail={(id) => void openNovelDetail(id)}
            />
          ) : section === 'users' ? (
            <UsersSection
              isLoading={isLoading}
              currentUserId={user.id}
              keyword={userKeyword}
              role={userRole}
              status={userStatus}
              users={managedUsers}
              onKeywordChange={setUserKeyword}
              onPageChange={(page, pageSize) => loadManagedUsers(token, { page, pageSize })}
              onResetFilters={() => {
                setUserKeyword('');
                setUserRole(undefined);
                setUserStatus(undefined);
                return loadManagedUsers(token, { page: 1, keyword: '', role: null, status: null });
              }}
              onRoleChange={(role) => {
                setUserRole(role);
                void loadManagedUsers(token, { page: 1, role: role ?? null });
              }}
              onStatusChange={(status) => {
                setUserStatus(status);
                void loadManagedUsers(token, { page: 1, status: status ?? null });
              }}
              onSearch={(keyword) => {
                setUserKeyword(keyword);
                return loadManagedUsers(token, { page: 1, keyword });
              }}
              onUpdateRole={updateUserRole}
              onUpdateStatus={updateUserStatus}
              onViewDetail={(id) => void openUserDetail(id)}
            />
          ) : section === 'audit' ? (
            <AuditLogSection
              action={auditAction}
              auditLogs={auditLogs}
              isLoading={isLoading}
              keyword={auditKeyword}
              targetType={auditTargetType}
              onActionChange={(action) => {
                setAuditAction(action);
                void loadAuditLogs(token, { page: 1, action: action ?? null });
              }}
              onKeywordChange={setAuditKeyword}
              onPageChange={(page, pageSize) => loadAuditLogs(token, { page, pageSize })}
              onResetFilters={() => {
                setAuditKeyword('');
                setAuditAction(undefined);
                setAuditTargetType(undefined);
                return loadAuditLogs(token, {
                  page: 1,
                  keyword: '',
                  action: null,
                  targetType: null,
                });
              }}
              onSearch={(keyword) => {
                setAuditKeyword(keyword);
                return loadAuditLogs(token, { page: 1, keyword });
              }}
              onTargetTypeChange={(targetType) => {
                setAuditTargetType(targetType);
                void loadAuditLogs(token, { page: 1, targetType: targetType ?? null });
              }}
              onViewDetail={setSelectedAuditLog}
            />
          ) : (
            <ReviewSection
              chapters={reviewChapters}
              comments={comments}
              dashboard={dashboard}
              isLoading={isLoading || isReviewLoading}
              keyword={reviewKeyword}
              novels={reviewNovels}
              onBatchDeleteComments={deleteCommentsBatch}
              onBatchReview={batchReviewTargets}
              onChapterPageChange={(page, pageSize) =>
                changeReviewQueuePage('chapter', page, pageSize)
              }
              onDeleteComment={deleteComment}
              onKeywordChange={setReviewKeyword}
              onNovelPageChange={(page, pageSize) => changeReviewQueuePage('novel', page, pageSize)}
              onOpenDetail={openReviewDetail}
              onReview={reviewTarget}
              onSearch={searchReviewQueues}
            />
          )}
        </Content>
        <NovelDetailDrawer
          detail={selectedNovelDetail}
          isLoading={isDetailLoading}
          onClose={() => setSelectedNovelDetail(undefined)}
        />
        <UserDetailDrawer
          detail={selectedUserDetail}
          isLoading={isDetailLoading}
          onClose={() => setSelectedUserDetail(undefined)}
        />
        <AuditLogDrawer log={selectedAuditLog} onClose={() => setSelectedAuditLog(undefined)} />
        <ReviewDetailDrawer
          detail={selectedReviewDetail}
          isLoading={isDetailLoading}
          onClose={() => setSelectedReviewDetail(undefined)}
          onReview={reviewTarget}
        />
      </Layout>
    </Layout>
  );
}

function DashboardSection({
  comments,
  dashboard,
  isLoading,
  platformTotals,
  recommendedNovels,
  onNavigate,
}: {
  comments: AdminComment[];
  dashboard: ReviewDashboard;
  isLoading: boolean;
  platformTotals: { novels: number; users: number };
  recommendedNovels: Novel[];
  onNavigate(section: SectionKey): void;
}) {
  const pendingItems = [
    ...dashboard.novels.map((novel) => ({
      id: `novel:${novel.id}`,
      type: '作品',
      title: novel.title,
      owner: novel.author.nickname,
      updatedAt: novel.updatedAt,
    })),
    ...dashboard.chapters.map((chapter) => ({
      id: `chapter:${chapter.id}`,
      type: '章节',
      title: `${chapter.novel.title} / ${chapter.title}`,
      owner: chapter.novel.author.nickname,
      updatedAt: chapter.updatedAt,
    })),
  ]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, 8);

  return (
    <>
      <section className="admin-panel dashboard-actions">
        <div className="panel-heading">
          <div>
            <Title level={4}>快捷入口</Title>
            <Text type="secondary">处理最常用的运营任务。</Text>
          </div>
        </div>
        <Space wrap>
          <Button type="primary" icon={<AuditOutlined />} onClick={() => onNavigate('review')}>
            处理审核
          </Button>
          <Button icon={<BookOutlined />} onClick={() => onNavigate('books')}>
            管理作品
          </Button>
          <Button icon={<TeamOutlined />} onClick={() => onNavigate('users')}>
            管理用户
          </Button>
          <Button icon={<BarChartOutlined />} onClick={() => onNavigate('recommend')}>
            配置推荐位
          </Button>
          <Button icon={<HistoryOutlined />} onClick={() => onNavigate('audit')}>
            查看审计日志
          </Button>
        </Space>
      </section>

      <section className="dashboard-grid">
        <section className="admin-panel">
          <div className="panel-heading">
            <Title level={4}>审核待办</Title>
            <Tag
              color={dashboard.counts.novels + dashboard.counts.chapters ? 'processing' : 'success'}
            >
              {dashboard.counts.novels + dashboard.counts.chapters} 项
            </Tag>
          </div>
          <Table
            rowKey="id"
            columns={[
              {
                title: '类型',
                dataIndex: 'type',
                width: 80,
                render: (type) => <Tag>{type}</Tag>,
              },
              {
                title: '内容',
                dataIndex: 'title',
              },
              {
                title: '作者',
                dataIndex: 'owner',
                width: 120,
              },
              {
                title: '更新时间',
                dataIndex: 'updatedAt',
                width: 180,
                render: (value) => formatDate(value),
              },
            ]}
            dataSource={pendingItems}
            loading={isLoading}
            pagination={false}
            size="small"
          />
        </section>

        <section className="admin-panel">
          <div className="panel-heading">
            <Title level={4}>首页推荐</Title>
            <Tag color={recommendedNovels.length ? 'processing' : 'default'}>
              {recommendedNovels.length} 本
            </Tag>
          </div>
          {recommendedNovels.length ? (
            <div className="dashboard-list">
              {recommendedNovels.slice(0, 6).map((novel, index) => (
                <article key={novel.id}>
                  <Tag color="blue">{index + 1}</Tag>
                  <span>{novel.title}</span>
                  <Text type="secondary">{novel.author.nickname}</Text>
                </article>
              ))}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无推荐作品" />
          )}
        </section>
      </section>

      <section className="dashboard-grid">
        <section className="admin-panel">
          <div className="panel-heading">
            <Title level={4}>最近审核</Title>
          </div>
          <div className="dashboard-list">
            {dashboard.recentLogs.length === 0 && <Text type="secondary">暂无审核记录</Text>}
            {dashboard.recentLogs.slice(0, 6).map((log) => (
              <article key={log.id}>
                <Tag color={log.action === 'approve' ? 'success' : 'error'}>
                  {reviewActionText(log.action)}
                </Tag>
                <span>{targetTypeText(log.targetType)}</span>
                <Text type="secondary">
                  {log.reviewer.nickname} · {formatDate(log.createdAt)}
                </Text>
              </article>
            ))}
          </div>
        </section>

        <section className="admin-panel">
          <div className="panel-heading">
            <Title level={4}>最近评论</Title>
            <Tag color={comments.length ? 'processing' : 'success'}>{comments.length} 条</Tag>
          </div>
          <div className="dashboard-list">
            {comments.length === 0 && <Text type="secondary">暂无评论</Text>}
            {comments.slice(0, 6).map((comment) => (
              <article key={comment.id}>
                <span>{comment.novel.title}</span>
                <Text>{comment.content}</Text>
                <Text type="secondary">
                  {comment.user.nickname} · {formatDate(comment.createdAt)}
                </Text>
              </article>
            ))}
          </div>
        </section>
      </section>

      <section className="admin-panel dashboard-summary">
        <div>
          <Text type="secondary">作品总数</Text>
          <strong>{platformTotals.novels}</strong>
        </div>
        <div>
          <Text type="secondary">用户总数</Text>
          <strong>{platformTotals.users}</strong>
        </div>
        <div>
          <Text type="secondary">待审作品</Text>
          <strong>{dashboard.counts.novels}</strong>
        </div>
        <div>
          <Text type="secondary">待审章节</Text>
          <strong>{dashboard.counts.chapters}</strong>
        </div>
      </section>
    </>
  );
}

function ReviewSection({
  chapters,
  comments,
  dashboard,
  isLoading,
  keyword,
  novels,
  onBatchDeleteComments,
  onBatchReview,
  onChapterPageChange,
  onDeleteComment,
  onKeywordChange,
  onNovelPageChange,
  onOpenDetail,
  onReview,
  onSearch,
}: {
  chapters: PaginatedReviewChapters;
  comments: AdminComment[];
  dashboard: ReviewDashboard;
  isLoading: boolean;
  keyword: string;
  novels: PaginatedReviewNovels;
  onBatchDeleteComments: BatchCommentDeleteHandler;
  onBatchReview: BatchReviewHandler;
  onChapterPageChange(page: number, pageSize: number): Promise<void>;
  onDeleteComment(id: string): Promise<void>;
  onKeywordChange(keyword: string): void;
  onNovelPageChange(page: number, pageSize: number): Promise<void>;
  onOpenDetail(type: 'novel' | 'chapter', id: string): Promise<void>;
  onReview: ReviewHandler;
  onSearch(keyword: string): Promise<void>;
}) {
  const [reviewScope, setReviewScope] = useState<'all' | 'novel' | 'chapter'>('all');
  const [selectedNovelIds, setSelectedNovelIds] = useState<string[]>([]);
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [selectedCommentIds, setSelectedCommentIds] = useState<string[]>([]);
  const showNovels = reviewScope === 'all' || reviewScope === 'novel';
  const showChapters = reviewScope === 'all' || reviewScope === 'chapter';

  useEffect(() => {
    const pendingNovelIds = new Set(novels.items.map((novel) => novel.id));
    const pendingChapterIds = new Set(chapters.items.map((chapter) => chapter.id));
    const recentCommentIds = new Set(comments.map((comment) => comment.id));
    setSelectedNovelIds((ids) => ids.filter((id) => pendingNovelIds.has(id)));
    setSelectedChapterIds((ids) => ids.filter((id) => pendingChapterIds.has(id)));
    setSelectedCommentIds((ids) => ids.filter((id) => recentCommentIds.has(id)));
  }, [chapters.items, comments, novels.items]);

  async function reviewNovelBatch(action: 'approve' | 'reject', reason?: string) {
    const result = await onBatchReview('novel', selectedNovelIds, action, reason);
    setSelectedNovelIds(result.items.filter((item) => !item.success).map((item) => item.id));
  }

  async function reviewChapterBatch(action: 'approve' | 'reject', reason?: string) {
    const result = await onBatchReview('chapter', selectedChapterIds, action, reason);
    setSelectedChapterIds(result.items.filter((item) => !item.success).map((item) => item.id));
  }

  async function deleteCommentBatch() {
    const result = await onBatchDeleteComments(selectedCommentIds);
    setSelectedCommentIds(result.items.filter((item) => !item.success).map((item) => item.id));
  }

  return (
    <>
      <section className="admin-panel review-filter-panel">
        <div className="panel-heading">
          <Title level={4}>审核筛选</Title>
          <Tag color={keyword.trim() ? 'processing' : 'default'}>
            {novels.pagination.total + chapters.pagination.total} 项
          </Tag>
        </div>
        <Space className="review-filter-bar" wrap>
          <Input.Search
            allowClear
            enterButton={<SearchOutlined />}
            placeholder="搜索标题、作者、分类或正文"
            value={keyword}
            onChange={(event) => {
              onKeywordChange(event.target.value);
              if (!event.target.value) {
                void onSearch('');
              }
            }}
            onSearch={onSearch}
          />
          <Select
            value={reviewScope}
            style={{ width: 160 }}
            options={[
              { value: 'all', label: '全部类型' },
              { value: 'novel', label: '只看作品' },
              { value: 'chapter', label: '只看章节' },
            ]}
            onChange={setReviewScope}
          />
        </Space>
      </section>

      {showNovels && (
        <section className="admin-panel">
          <div className="panel-heading">
            <Title level={4}>待审核作品</Title>
            <Space wrap>
              <Tag color={novels.pagination.total ? 'processing' : 'success'}>
                {novels.pagination.total} 项待审
              </Tag>
              <Tag color={selectedNovelIds.length ? 'processing' : 'default'}>
                已选 {selectedNovelIds.length} 项
              </Tag>
              <BatchReviewActions
                count={selectedNovelIds.length}
                targetLabel="作品"
                onReview={reviewNovelBatch}
              />
            </Space>
          </div>
          <Table
            rowKey="id"
            columns={novelColumns(onReview, onOpenDetail)}
            dataSource={novels.items}
            loading={isLoading}
            pagination={{
              current: novels.pagination.page,
              pageSize: novels.pagination.pageSize,
              total: novels.pagination.total,
              showSizeChanger: true,
              onChange: onNovelPageChange,
            }}
            rowSelection={{
              selectedRowKeys: selectedNovelIds,
              onChange: (keys) => setSelectedNovelIds(keys.map(String)),
            }}
          />
        </section>
      )}

      {showChapters && (
        <section className="admin-panel">
          <div className="panel-heading">
            <Title level={4}>待审核章节</Title>
            <Space wrap>
              <Tag color={chapters.pagination.total ? 'processing' : 'success'}>
                {chapters.pagination.total} 项待审
              </Tag>
              <Tag color={selectedChapterIds.length ? 'processing' : 'default'}>
                已选 {selectedChapterIds.length} 项
              </Tag>
              <BatchReviewActions
                count={selectedChapterIds.length}
                targetLabel="章节"
                onReview={reviewChapterBatch}
              />
            </Space>
          </div>
          <Table
            rowKey="id"
            columns={chapterColumns(onReview, onOpenDetail)}
            dataSource={chapters.items}
            loading={isLoading}
            pagination={{
              current: chapters.pagination.page,
              pageSize: chapters.pagination.pageSize,
              total: chapters.pagination.total,
              showSizeChanger: true,
              onChange: onChapterPageChange,
            }}
            rowSelection={{
              selectedRowKeys: selectedChapterIds,
              onChange: (keys) => setSelectedChapterIds(keys.map(String)),
            }}
          />
        </section>
      )}

      <section className="admin-panel">
        <div className="panel-heading">
          <Title level={4}>最近审核</Title>
        </div>
        <div className="review-log-list">
          {dashboard.recentLogs.length === 0 && <Text type="secondary">暂无审核记录</Text>}
          {dashboard.recentLogs.map((log) => (
            <article key={log.id}>
              <Tag color={log.action === 'approve' ? 'success' : 'error'}>
                {log.action === 'approve' ? '通过' : '驳回'}
              </Tag>
              <span>
                {targetTypeText(log.targetType)} · {log.reviewer.nickname} ·{' '}
                {new Date(log.createdAt).toLocaleString()}
              </span>
              <Text type="secondary">{displayReviewReason(log.reason)}</Text>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-panel">
        <div className="panel-heading">
          <Title level={4}>最近评论</Title>
          <Space wrap>
            <Tag color={comments.length ? 'processing' : 'success'}>{comments.length} 条</Tag>
            <Tag color={selectedCommentIds.length ? 'processing' : 'default'}>
              已选 {selectedCommentIds.length} 条
            </Tag>
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              disabled={selectedCommentIds.length === 0}
              onClick={() =>
                Modal.confirm({
                  title: `批量删除 ${selectedCommentIds.length} 条评论？`,
                  content: '评论将被永久删除，每条删除操作都会分别写入审计记录。',
                  okText: '批量删除',
                  okButtonProps: { danger: true },
                  cancelText: '取消',
                  onOk: deleteCommentBatch,
                })
              }
            >
              批量删除
            </Button>
          </Space>
        </div>
        <Table
          rowKey="id"
          columns={commentColumns(onDeleteComment)}
          dataSource={comments}
          loading={isLoading}
          pagination={{ pageSize: 5 }}
          rowSelection={{
            selectedRowKeys: selectedCommentIds,
            onChange: (keys) => setSelectedCommentIds(keys.map(String)),
          }}
        />
      </section>
    </>
  );
}

function ReportsWorkspace({
  commentKeyword,
  commentReports,
  commentSource,
  commentStatus,
  isLoading,
  paragraphReports,
  paragraphStats,
  paragraphStatsDays,
  paragraphStatus,
  onCommentBatchReview,
  onCommentKeywordChange,
  onCommentPageChange,
  onCommentReview,
  onCommentSearch,
  onCommentSourceChange,
  onCommentStatusChange,
  onParagraphBatchReview,
  onParagraphPageChange,
  onParagraphReview,
  onParagraphStatsDaysChange,
  onParagraphStatusChange,
}: {
  commentKeyword: string;
  commentReports: PaginatedCommentReports;
  commentSource: CommentReportSource;
  commentStatus: ParagraphReportStatus;
  isLoading: boolean;
  paragraphReports: PaginatedParagraphCommentReports;
  paragraphStats?: ParagraphReportStats;
  paragraphStatsDays: ParagraphReportStatsPeriod;
  paragraphStatus: ParagraphReportStatus;
  onCommentBatchReview: BatchParagraphReportHandler;
  onCommentKeywordChange(keyword: string): void;
  onCommentPageChange(page: number, pageSize: number): Promise<void>;
  onCommentReview(id: string, action: 'dismiss' | 'remove'): Promise<void>;
  onCommentSearch(keyword: string): Promise<void>;
  onCommentSourceChange(source: CommentReportSource): void;
  onCommentStatusChange(status: ParagraphReportStatus): void;
  onParagraphBatchReview: BatchParagraphReportHandler;
  onParagraphPageChange(page: number, pageSize: number): Promise<void>;
  onParagraphReview(id: string, action: 'dismiss' | 'remove'): Promise<void>;
  onParagraphStatsDaysChange(days: ParagraphReportStatsPeriod): void;
  onParagraphStatusChange(status: ParagraphReportStatus): void;
}) {
  return (
    <Tabs
      defaultActiveKey="comments"
      items={[
        {
          key: 'comments',
          label: `作品与章节评论 (${commentReports.pagination.total})`,
          children: (
            <CommentReportsSection
              isLoading={isLoading}
              keyword={commentKeyword}
              reports={commentReports}
              source={commentSource}
              status={commentStatus}
              onBatchReview={onCommentBatchReview}
              onKeywordChange={onCommentKeywordChange}
              onPageChange={onCommentPageChange}
              onReview={onCommentReview}
              onSearch={onCommentSearch}
              onSourceChange={onCommentSourceChange}
              onStatusChange={onCommentStatusChange}
            />
          ),
        },
        {
          key: 'paragraphs',
          label: `段评举报 (${paragraphReports.pagination.total})`,
          children: (
            <ParagraphReportsSection
              isLoading={isLoading}
              reports={paragraphReports}
              stats={paragraphStats}
              statsDays={paragraphStatsDays}
              status={paragraphStatus}
              onBatchReview={onParagraphBatchReview}
              onPageChange={onParagraphPageChange}
              onReview={onParagraphReview}
              onStatsDaysChange={onParagraphStatsDaysChange}
              onStatusChange={onParagraphStatusChange}
            />
          ),
        },
      ]}
    />
  );
}

function CommentReportsSection({
  isLoading,
  keyword,
  reports,
  source,
  status,
  onBatchReview,
  onKeywordChange,
  onPageChange,
  onReview,
  onSearch,
  onSourceChange,
  onStatusChange,
}: {
  isLoading: boolean;
  keyword: string;
  reports: PaginatedCommentReports;
  source: CommentReportSource;
  status: ParagraphReportStatus;
  onBatchReview: BatchParagraphReportHandler;
  onKeywordChange(keyword: string): void;
  onPageChange(page: number, pageSize: number): Promise<void>;
  onReview(id: string, action: 'dismiss' | 'remove'): Promise<void>;
  onSearch(keyword: string): Promise<void>;
  onSourceChange(source: CommentReportSource): void;
  onStatusChange(status: ParagraphReportStatus): void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    const visiblePendingIds = new Set(
      reports.items.filter((report) => report.status === 'PENDING').map((report) => report.id),
    );
    setSelectedIds((ids) => ids.filter((id) => visiblePendingIds.has(id)));
  }, [reports.items]);

  async function reviewSelected(action: 'dismiss' | 'remove') {
    const result = await onBatchReview(selectedIds, action);
    setSelectedIds(result.items.filter((item) => !item.success).map((item) => item.id));
  }

  const columns: ColumnsType<AdminCommentReport> = [
    {
      title: '评论内容',
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <Space wrap size={4}>
            <Tag color={row.chapterId ? 'processing' : 'default'}>
              {row.chapterId ? '章节评论' : '作品评论'}
            </Tag>
            <strong>
              {row.novelTitle}
              {row.chapterTitle ? ` / ${row.chapterTitle}` : ''}
            </strong>
          </Space>
          <Paragraph className="chapter-preview" ellipsis={{ rows: 2 }}>
            {row.contentSnapshot}
          </Paragraph>
          <Text type="secondary">
            发布者：{row.commentAuthorNickname}（{row.commentAuthorEmail}）
          </Text>
          {!row.commentId && <Text type="danger">原评论已删除，举报快照已保留</Text>}
        </Space>
      ),
    },
    {
      title: '举报信息',
      width: 240,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <Tag color={paragraphReportReasonColor(row.reason)}>
            {paragraphReportReasonText(row.reason)}
          </Tag>
          {row.detail && <Text>{row.detail}</Text>}
          <Text type="secondary">举报人：{row.reporter.nickname}</Text>
        </Space>
      ),
    },
    {
      title: '状态',
      width: 110,
      render: (_, row) => (
        <Tag color={paragraphReportStatusColor(row.status)}>
          {paragraphReportStatusText(row.status)}
        </Tag>
      ),
    },
    {
      title: '时间',
      width: 180,
      render: (_, row) => formatDate(row.updatedAt),
    },
    {
      title: '操作',
      width: 210,
      render: (_, row) =>
        row.status === 'PENDING' ? (
          <Space>
            <Button
              size="small"
              icon={<StopOutlined />}
              onClick={() =>
                Modal.confirm({
                  title: '驳回这条举报？',
                  content: '评论将保持可见，此操作会写入审计记录。',
                  okText: '确认驳回',
                  cancelText: '取消',
                  onOk: () => onReview(row.id, 'dismiss'),
                })
              }
            >
              驳回
            </Button>
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              disabled={!row.commentId}
              onClick={() =>
                Modal.confirm({
                  title: '移除这条评论？',
                  content: '原评论会被删除，举报快照和审计记录继续保留。',
                  okText: '确认移除',
                  okButtonProps: { danger: true },
                  cancelText: '取消',
                  onOk: () => onReview(row.id, 'remove'),
                })
              }
            >
              移除评论
            </Button>
          </Space>
        ) : (
          <Text type="secondary">{row.reviewer?.nickname ?? '系统'} 已处理</Text>
        ),
    },
  ];

  return (
    <section className="admin-panel">
      <div className="panel-heading">
        <div>
          <Title level={4}>普通评论举报队列</Title>
          <Text type="secondary">共 {reports.pagination.total} 条记录</Text>
        </div>
        <Space wrap>
          {status === 'PENDING' && (
            <>
              <Tag color={selectedIds.length ? 'processing' : 'default'}>
                已选 {selectedIds.length} 条
              </Tag>
              <Button
                size="small"
                icon={<StopOutlined />}
                disabled={selectedIds.length === 0}
                onClick={() =>
                  Modal.confirm({
                    title: `批量驳回 ${selectedIds.length} 条举报？`,
                    content: '相关评论会保持可见。',
                    okText: '批量驳回',
                    cancelText: '取消',
                    onOk: () => reviewSelected('dismiss'),
                  })
                }
              >
                批量驳回
              </Button>
              <Button
                danger
                size="small"
                icon={<DeleteOutlined />}
                disabled={selectedIds.length === 0}
                onClick={() =>
                  Modal.confirm({
                    title: `批量移除 ${selectedIds.length} 条举报涉及的评论？`,
                    content: '原评论会被删除，同一评论的多个举报会合并处理。',
                    okText: '批量移除',
                    okButtonProps: { danger: true },
                    cancelText: '取消',
                    onOk: () => reviewSelected('remove'),
                  })
                }
              >
                批量移除
              </Button>
            </>
          )}
          <Input.Search
            allowClear
            value={keyword}
            style={{ width: 260 }}
            placeholder="搜索评论、作者、作品或举报人"
            onChange={(event) => onKeywordChange(event.target.value)}
            onSearch={onSearch}
          />
          <Select
            value={source}
            style={{ width: 130 }}
            onChange={onSourceChange}
            options={[
              { value: 'ALL', label: '全部来源' },
              { value: 'NOVEL', label: '作品评论' },
              { value: 'CHAPTER', label: '章节评论' },
            ]}
          />
          <Select
            value={status}
            style={{ width: 130 }}
            onChange={onStatusChange}
            options={[
              { value: 'PENDING', label: '待处理' },
              { value: 'RESOLVED', label: '已移除' },
              { value: 'DISMISSED', label: '已驳回' },
            ]}
          />
        </Space>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={reports.items}
        loading={isLoading}
        rowSelection={
          status === 'PENDING'
            ? {
                selectedRowKeys: selectedIds,
                onChange: (keys) => setSelectedIds(keys.map(String)),
              }
            : undefined
        }
        pagination={{
          current: reports.pagination.page,
          pageSize: reports.pagination.pageSize,
          total: reports.pagination.total,
          showSizeChanger: true,
          onChange: onPageChange,
        }}
      />
    </section>
  );
}

function ParagraphReportsSection({
  isLoading,
  reports,
  stats,
  statsDays,
  status,
  onBatchReview,
  onPageChange,
  onReview,
  onStatsDaysChange,
  onStatusChange,
}: {
  isLoading: boolean;
  reports: PaginatedParagraphCommentReports;
  stats?: ParagraphReportStats;
  statsDays: ParagraphReportStatsPeriod;
  status: ParagraphReportStatus;
  onBatchReview: BatchParagraphReportHandler;
  onPageChange(page: number, pageSize: number): Promise<void>;
  onReview(id: string, action: 'dismiss' | 'remove'): Promise<void>;
  onStatsDaysChange(days: ParagraphReportStatsPeriod): void;
  onStatusChange(status: ParagraphReportStatus): void;
}) {
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const reasonMax = Math.max(1, ...(stats?.reasonBreakdown.map((item) => item.count) ?? [0]));
  const trendMax = Math.max(
    1,
    ...(stats?.trend.flatMap((item) => [item.created, item.resolved, item.dismissed]) ?? [0]),
  );

  useEffect(() => {
    const visiblePendingIds = new Set(
      reports.items.filter((report) => report.status === 'PENDING').map((report) => report.id),
    );
    setSelectedReportIds((ids) => ids.filter((id) => visiblePendingIds.has(id)));
  }, [reports.items]);

  async function reviewSelectedReports(action: 'dismiss' | 'remove') {
    const result = await onBatchReview(selectedReportIds, action);
    setSelectedReportIds(result.items.filter((item) => !item.success).map((item) => item.id));
  }

  const columns: ColumnsType<AdminParagraphCommentReport> = [
    {
      title: '段评内容',
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <strong>
            {row.comment.chapter.novel.title} · {row.comment.chapter.title} · 第{' '}
            {row.comment.paragraphIndex + 1} 段
          </strong>
          <Paragraph className="chapter-preview" ellipsis={{ rows: 2 }}>
            {row.comment.isDeleted ? '该段评已删除' : row.comment.content}
          </Paragraph>
          <Text type="secondary">
            发布者：{row.comment.user.nickname}（{row.comment.user.email}）
          </Text>
        </Space>
      ),
    },
    {
      title: '举报信息',
      width: 240,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <Tag color={paragraphReportReasonColor(row.reason)}>
            {paragraphReportReasonText(row.reason)}
          </Tag>
          {row.detail && <Text>{row.detail}</Text>}
          <Text type="secondary">举报人：{row.reporter.nickname}</Text>
        </Space>
      ),
    },
    {
      title: '状态',
      width: 110,
      render: (_, row) => (
        <Tag color={paragraphReportStatusColor(row.status)}>
          {paragraphReportStatusText(row.status)}
        </Tag>
      ),
    },
    {
      title: '时间',
      width: 180,
      render: (_, row) => formatDate(row.updatedAt),
    },
    {
      title: '操作',
      width: 190,
      render: (_, row) =>
        row.status === 'PENDING' ? (
          <Space>
            <Button
              size="small"
              icon={<StopOutlined />}
              onClick={() =>
                Modal.confirm({
                  title: '驳回这条举报？',
                  content: '段评将保持可见，此操作会写入审计记录。',
                  okText: '确认驳回',
                  cancelText: '取消',
                  onOk: () => onReview(row.id, 'dismiss'),
                })
              }
            >
              驳回
            </Button>
            <Button
              danger
              size="small"
              icon={<DeleteOutlined />}
              onClick={() =>
                Modal.confirm({
                  title: '移除这条段评？',
                  content: '段评正文会被隐藏，已有回复和举报记录仍会保留。',
                  okText: '确认移除',
                  okButtonProps: { danger: true },
                  cancelText: '取消',
                  onOk: () => onReview(row.id, 'remove'),
                })
              }
            >
              移除段评
            </Button>
          </Space>
        ) : (
          <Text type="secondary">{row.reviewer?.nickname ?? '系统'} 已处理</Text>
        ),
    },
  ];

  return (
    <>
      <section className="admin-panel report-overview-panel">
        <div className="panel-heading">
          <div>
            <Title level={4}>举报处理概览</Title>
            <Text type="secondary">周期数据按北京时间统计，待处理数为当前全部积压。</Text>
          </div>
          <Segmented
            value={statsDays}
            options={[
              { value: 7, label: '近 7 天' },
              { value: 14, label: '近 14 天' },
              { value: 30, label: '近 30 天' },
            ]}
            onChange={(value) => onStatsDaysChange(Number(value) as ParagraphReportStatsPeriod)}
          />
        </div>
        {stats ? (
          <>
            <div className="report-metric-strip">
              <ReportMetric label="周期新增" value={stats.overview.created} />
              <ReportMetric label="当前待处理" value={stats.overview.pending} />
              <ReportMetric label="周期内已移除" value={stats.overview.resolved} />
              <ReportMetric label="周期内已驳回" value={stats.overview.dismissed} />
              <ReportMetric label="新增处理率" value={`${stats.overview.resolutionRate}%`} />
              <ReportMetric
                label="平均处理时长"
                value={formatResolutionDuration(stats.overview.averageResolutionMinutes)}
              />
            </div>

            <div className="report-insights-grid">
              <div className="report-reason-breakdown">
                <Text strong>举报原因分布</Text>
                <div className="report-reason-list">
                  {stats.reasonBreakdown.map((item) => (
                    <div className="report-reason-row" key={item.reason}>
                      <Text>{paragraphReportReasonText(item.reason)}</Text>
                      <div className="report-reason-track" aria-hidden="true">
                        <span
                          className={`report-reason-fill reason-${item.reason.toLowerCase()}`}
                          style={{ width: `${(item.count / reasonMax) * 100}%` }}
                        />
                      </div>
                      <strong>{item.count}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="report-trend-section">
                <div className="report-trend-heading">
                  <Text strong>每日趋势</Text>
                  <div className="report-trend-legend">
                    <span>
                      <i className="trend-created" />
                      新增
                    </span>
                    <span>
                      <i className="trend-resolved" />
                      移除
                    </span>
                    <span>
                      <i className="trend-dismissed" />
                      驳回
                    </span>
                  </div>
                </div>
                <div className="report-trend-scroll">
                  <div
                    className="report-trend-chart"
                    style={{ minWidth: Math.max(320, stats.trend.length * 34) }}
                  >
                    {stats.trend.map((item) => (
                      <div className="report-trend-day" key={item.date}>
                        <div className="report-trend-bars">
                          <span
                            className="trend-created"
                            style={{ height: `${(item.created / trendMax) * 100}%` }}
                            title={`${item.date} 新增 ${item.created}`}
                          />
                          <span
                            className="trend-resolved"
                            style={{ height: `${(item.resolved / trendMax) * 100}%` }}
                            title={`${item.date} 移除 ${item.resolved}`}
                          />
                          <span
                            className="trend-dismissed"
                            style={{ height: `${(item.dismissed / trendMax) * 100}%` }}
                            title={`${item.date} 驳回 ${item.dismissed}`}
                          />
                        </div>
                        <small>{item.date.slice(5)}</small>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无举报统计" />
        )}
      </section>

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <Title level={4}>段评举报队列</Title>
            <Text type="secondary">共 {reports.pagination.total} 条记录</Text>
          </div>
          <Space wrap>
            {status === 'PENDING' && (
              <>
                <Tag color={selectedReportIds.length ? 'processing' : 'default'}>
                  已选 {selectedReportIds.length} 条
                </Tag>
                <Button
                  size="small"
                  icon={<StopOutlined />}
                  disabled={selectedReportIds.length === 0}
                  onClick={() =>
                    Modal.confirm({
                      title: `批量驳回 ${selectedReportIds.length} 条举报？`,
                      content: '相关段评将保持可见，每次内容处置都会写入审计记录。',
                      okText: '批量驳回',
                      cancelText: '取消',
                      onOk: () => reviewSelectedReports('dismiss'),
                    })
                  }
                >
                  批量驳回
                </Button>
                <Button
                  danger
                  size="small"
                  icon={<DeleteOutlined />}
                  disabled={selectedReportIds.length === 0}
                  onClick={() =>
                    Modal.confirm({
                      title: `批量移除 ${selectedReportIds.length} 条举报涉及的段评？`,
                      content: '违规段评正文会被隐藏，同一段评的多个举报会合并处理。',
                      okText: '批量移除',
                      okButtonProps: { danger: true },
                      cancelText: '取消',
                      onOk: () => reviewSelectedReports('remove'),
                    })
                  }
                >
                  批量移除
                </Button>
              </>
            )}
            <Select
              value={status}
              style={{ width: 150 }}
              onChange={onStatusChange}
              options={[
                { value: 'PENDING', label: '待处理' },
                { value: 'RESOLVED', label: '已移除' },
                { value: 'DISMISSED', label: '已驳回' },
              ]}
            />
          </Space>
        </div>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={reports.items}
          loading={isLoading}
          rowSelection={
            status === 'PENDING'
              ? {
                  selectedRowKeys: selectedReportIds,
                  onChange: (keys) => setSelectedReportIds(keys.map(String)),
                }
              : undefined
          }
          pagination={{
            current: reports.pagination.page,
            pageSize: reports.pagination.pageSize,
            total: reports.pagination.total,
            showSizeChanger: true,
            onChange: onPageChange,
          }}
        />
      </section>
    </>
  );
}

function ReportMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <Text type="secondary">{label}</Text>
      <strong>{value}</strong>
    </div>
  );
}

function RecommendSection({
  candidateNovels,
  isLoading,
  recommendedNovels,
  slotName,
  onAdd,
  onMove,
  onRemove,
  onSearch,
}: {
  candidateNovels: Novel[];
  isLoading: boolean;
  recommendedNovels: Novel[];
  slotName: string;
  onAdd(novel: Novel): void;
  onMove(index: number, direction: -1 | 1): void;
  onRemove(novelId: string): void;
  onSearch(keyword: string): Promise<void>;
}) {
  const recommendedIds = new Set(recommendedNovels.map((novel) => novel.id));

  return (
    <>
      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <Title level={4}>{slotName}</Title>
            <Text type="secondary">建议保留 3-6 本，用户端首页会按这里的顺序展示。</Text>
          </div>
          <Tag color={recommendedNovels.length ? 'processing' : 'default'}>
            {recommendedNovels.length} 本
          </Tag>
        </div>
        <Table
          rowKey="id"
          columns={recommendColumns(recommendedNovels, onMove, onRemove)}
          dataSource={recommendedNovels}
          loading={isLoading}
          pagination={false}
        />
      </section>

      <section className="admin-panel">
        <div className="panel-heading">
          <Title level={4}>添加作品</Title>
          <Input.Search
            allowClear
            enterButton={<SearchOutlined />}
            placeholder="搜索已上架作品"
            style={{ maxWidth: 360 }}
            onSearch={onSearch}
          />
        </div>
        <Table
          rowKey="id"
          columns={candidateColumns(recommendedIds, onAdd)}
          dataSource={candidateNovels}
          loading={isLoading}
          pagination={{ pageSize: 8 }}
        />
      </section>
    </>
  );
}

function AuthorApplicationsSection({
  applications,
  isLoading,
  status,
  onPageChange,
  onReview,
  onStatusChange,
}: {
  applications: PaginatedAuthorApplications;
  isLoading: boolean;
  status: AuthorApplicationStatus;
  onPageChange(page: number, pageSize: number): void;
  onReview(id: string, action: 'approve' | 'reject', reason?: string): Promise<void>;
  onStatusChange(status: AuthorApplicationStatus): void;
}) {
  const columns: ColumnsType<AdminAuthorApplication> = [
    {
      title: '申请人',
      width: 210,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <strong>{row.user.nickname}</strong>
          <Text type="secondary">{row.user.email}</Text>
        </Space>
      ),
    },
    {
      title: '作者资料',
      render: (_, row) => (
        <Space orientation="vertical" size={4}>
          <strong>笔名：{row.penName}</strong>
          {row.bio && (
            <Paragraph ellipsis={{ rows: 2, tooltip: row.bio }} style={{ margin: 0 }}>
              {row.bio}
            </Paragraph>
          )}
          <Paragraph ellipsis={{ rows: 2, tooltip: row.statement }} style={{ margin: 0 }}>
            申请说明：{row.statement}
          </Paragraph>
        </Space>
      ),
    },
    {
      title: '状态',
      width: 130,
      render: (_, row) => (
        <Tag color={authorApplicationStatusColor(row.status)}>
          {authorApplicationStatusText(row.status)}
        </Tag>
      ),
    },
    {
      title: '审核信息',
      width: 210,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <Text type="secondary">{row.reviewedBy?.nickname ?? '尚未审核'}</Text>
          {row.reviewReason && <Text type="danger">{row.reviewReason}</Text>}
          <Text type="secondary">{formatDate(row.reviewedAt ?? row.updatedAt)}</Text>
        </Space>
      ),
    },
    {
      title: '操作',
      width: 180,
      render: (_, row) =>
        row.status === 'PENDING' ? (
          <Space>
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => {
                Modal.confirm({
                  title: `通过 ${row.user.nickname} 的作者申请`,
                  content: `通过后账号将升级为作者，笔名为“${row.penName}”。`,
                  okText: '确认通过',
                  cancelText: '取消',
                  onOk: () => onReview(row.id, 'approve'),
                });
              }}
            >
              通过
            </Button>
            <Button
              danger
              size="small"
              onClick={() => {
                let reason = '';
                Modal.confirm({
                  title: `驳回 ${row.user.nickname} 的作者申请`,
                  content: (
                    <Input.TextArea
                      rows={3}
                      maxLength={300}
                      showCount
                      placeholder="请输入驳回原因"
                      onChange={(event) => {
                        reason = event.target.value;
                      }}
                    />
                  ),
                  okText: '确认驳回',
                  okButtonProps: { danger: true },
                  cancelText: '取消',
                  onOk: () => {
                    const normalized = reason.trim();
                    if (!normalized) {
                      message.error('请填写驳回原因');
                      return Promise.reject(new Error('驳回原因不能为空'));
                    }
                    return onReview(row.id, 'reject', normalized);
                  },
                });
              }}
            >
              驳回
            </Button>
          </Space>
        ) : (
          <Text type="secondary">已处理</Text>
        ),
    },
  ];

  return (
    <section className="admin-panel">
      <div className="panel-heading">
        <div>
          <Title level={4}>作者入驻申请</Title>
          <Text type="secondary">共 {applications.pagination.total} 条申请</Text>
        </div>
        <Select
          value={status}
          style={{ width: 150 }}
          options={authorApplicationStatusOptions}
          onChange={onStatusChange}
        />
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={applications.items}
        loading={isLoading}
        scroll={{ x: 1050 }}
        pagination={{
          current: applications.pagination.page,
          pageSize: applications.pagination.pageSize,
          total: applications.pagination.total,
          showSizeChanger: true,
          onChange: onPageChange,
        }}
      />
    </section>
  );
}

function BooksSection({
  isLoading,
  keyword,
  novels,
  sort,
  status,
  onKeywordChange,
  onPageChange,
  onResetFilters,
  onSearch,
  onSortChange,
  onStatusChange,
  onUpdateStatus,
  onViewDetail,
}: {
  isLoading: boolean;
  keyword: string;
  novels: PaginatedNovels;
  sort: AdminNovelSort;
  status?: AdminNovelStatus;
  onKeywordChange(keyword: string): void;
  onPageChange(page: number, pageSize: number): void;
  onResetFilters(): Promise<void>;
  onSearch(keyword: string): Promise<void>;
  onSortChange(sort: AdminNovelSort): void;
  onStatusChange(status?: AdminNovelStatus): void;
  onUpdateStatus(id: string, status: AdminNovelStatus): Promise<void>;
  onViewDetail(id: string): void;
}) {
  return (
    <section className="admin-panel">
      <div className="panel-heading">
        <div>
          <Title level={4}>全站作品</Title>
          <Text type="secondary">共 {novels.pagination.total} 本作品</Text>
        </div>
        <Space wrap>
          <Input.Search
            allowClear
            enterButton={<SearchOutlined />}
            placeholder="搜索书名、作者或简介"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            onSearch={onSearch}
          />
          <Select
            value={sort}
            style={{ width: 140 }}
            options={novelSortOptions}
            onChange={onSortChange}
          />
          <Select
            allowClear
            placeholder="全部状态"
            value={status}
            style={{ width: 150 }}
            options={novelStatusOptions}
            onChange={onStatusChange}
          />
          <Button onClick={() => void onResetFilters()}>重置</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        columns={managementNovelColumns(onUpdateStatus, onViewDetail)}
        dataSource={novels.items}
        loading={isLoading}
        pagination={{
          current: novels.pagination.page,
          pageSize: novels.pagination.pageSize,
          total: novels.pagination.total,
          showSizeChanger: true,
          onChange: onPageChange,
        }}
      />
    </section>
  );
}

function UsersSection({
  currentUserId,
  isLoading,
  keyword,
  role,
  status,
  users,
  onKeywordChange,
  onPageChange,
  onResetFilters,
  onRoleChange,
  onSearch,
  onStatusChange,
  onUpdateRole,
  onUpdateStatus,
  onViewDetail,
}: {
  currentUserId: string;
  isLoading: boolean;
  keyword: string;
  role?: User['role'];
  status?: UserStatus;
  users: PaginatedUsers;
  onKeywordChange(keyword: string): void;
  onPageChange(page: number, pageSize: number): void;
  onResetFilters(): Promise<void>;
  onRoleChange(role?: User['role']): void;
  onSearch(keyword: string): Promise<void>;
  onStatusChange(status?: UserStatus): void;
  onUpdateRole(id: string, role: User['role']): Promise<void>;
  onUpdateStatus(id: string, status: UserStatus, reason?: string): Promise<void>;
  onViewDetail(id: string): void;
}) {
  return (
    <section className="admin-panel">
      <div className="panel-heading">
        <div>
          <Title level={4}>用户列表</Title>
          <Text type="secondary">共 {users.pagination.total} 个用户</Text>
        </div>
        <Space wrap>
          <Input.Search
            allowClear
            enterButton={<SearchOutlined />}
            placeholder="搜索昵称或邮箱"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            onSearch={onSearch}
          />
          <Select
            allowClear
            placeholder="全部角色"
            value={role}
            style={{ width: 150 }}
            options={userRoleOptions}
            onChange={onRoleChange}
          />
          <Select
            allowClear
            placeholder="全部状态"
            value={status}
            style={{ width: 150 }}
            options={userStatusOptions}
            onChange={onStatusChange}
          />
          <Button onClick={() => void onResetFilters()}>重置</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        columns={userColumns(currentUserId, onUpdateRole, onUpdateStatus, onViewDetail)}
        dataSource={users.items}
        loading={isLoading}
        pagination={{
          current: users.pagination.page,
          pageSize: users.pagination.pageSize,
          total: users.pagination.total,
          showSizeChanger: true,
          onChange: onPageChange,
        }}
      />
    </section>
  );
}

function SensitiveWordsSection({ token }: { token: string }) {
  const [form] = Form.useForm<{
    term: string;
    scope: SensitiveWordScope;
    note?: string;
    isEnabled: boolean;
  }>();
  const [rules, setRules] = useState<PaginatedSensitiveWordRules>({
    items: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  });
  const [keyword, setKeyword] = useState('');
  const [scope, setScope] = useState<SensitiveWordScope>();
  const [enabled, setEnabled] = useState<boolean>();
  const [editingRule, setEditingRule] = useState<SensitiveWordRule>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  async function loadRules(
    options: {
      page?: number;
      pageSize?: number;
      keyword?: string;
      scope?: SensitiveWordScope | null;
      enabled?: boolean | null;
    } = {},
  ) {
    setIsLoading(true);
    try {
      const hasScope = Object.prototype.hasOwnProperty.call(options, 'scope');
      const hasEnabled = Object.prototype.hasOwnProperty.call(options, 'enabled');
      setRules(
        await api.listSensitiveWordRules(token, {
          page: options.page ?? rules.pagination.page,
          pageSize: options.pageSize ?? rules.pagination.pageSize,
          keyword: options.keyword !== undefined ? options.keyword : keyword || undefined,
          scope: hasScope ? (options.scope ?? undefined) : scope,
          enabled: hasEnabled ? (options.enabled ?? undefined) : enabled,
        }),
      );
    } catch (err) {
      message.error(err instanceof Error ? err.message : '敏感词规则加载失败');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadRules({ page: 1 });
  }, [token]);

  function openCreate() {
    setEditingRule(undefined);
    form.setFieldsValue({ term: '', scope: 'ALL', note: '', isEnabled: true });
    setIsModalOpen(true);
  }

  function openEdit(rule: SensitiveWordRule) {
    setEditingRule(rule);
    form.setFieldsValue({
      term: rule.term,
      scope: rule.scope,
      note: rule.note ?? '',
      isEnabled: rule.isEnabled,
    });
    setIsModalOpen(true);
  }

  async function saveRule(values: {
    term: string;
    scope: SensitiveWordScope;
    note?: string;
    isEnabled: boolean;
  }) {
    setIsLoading(true);
    try {
      if (editingRule) {
        await api.updateSensitiveWordRule(token, editingRule.id, values);
        message.success('敏感词规则已更新');
      } else {
        await api.createSensitiveWordRule(token, values);
        message.success('敏感词规则已创建');
      }
      setIsModalOpen(false);
      setEditingRule(undefined);
      form.resetFields();
      await loadRules();
    } catch (err) {
      message.error(err instanceof Error ? err.message : '规则保存失败');
    } finally {
      setIsLoading(false);
    }
  }

  async function toggleRule(rule: SensitiveWordRule, nextEnabled: boolean) {
    setIsLoading(true);
    try {
      await api.updateSensitiveWordRule(token, rule.id, { isEnabled: nextEnabled });
      setRules((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.id === rule.id ? { ...item, isEnabled: nextEnabled } : item,
        ),
      }));
      message.success(nextEnabled ? '规则已启用' : '规则已停用');
    } catch (err) {
      message.error(err instanceof Error ? err.message : '规则状态更新失败');
    } finally {
      setIsLoading(false);
    }
  }

  function deleteRule(rule: SensitiveWordRule) {
    Modal.confirm({
      title: `删除敏感词“${rule.term}”`,
      content: '删除后，该词将不再参与内容提交校验。',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await api.deleteSensitiveWordRule(token, rule.id);
        message.success('敏感词规则已删除');
        await loadRules({
          page: rules.items.length === 1 ? Math.max(1, rules.pagination.page - 1) : undefined,
        });
      },
    });
  }

  const columns: ColumnsType<SensitiveWordRule> = [
    {
      title: '敏感词',
      dataIndex: 'term',
      width: 180,
      render: (value) => <Text strong>{value}</Text>,
    },
    {
      title: '范围',
      dataIndex: 'scope',
      width: 120,
      render: (value: SensitiveWordScope) => <Tag>{sensitiveWordScopeText(value)}</Tag>,
    },
    {
      title: '备注',
      dataIndex: 'note',
      render: (value) => value || <Text type="secondary">未填写</Text>,
    },
    {
      title: '创建人',
      width: 170,
      render: (_, row) => row.createdBy?.nickname ?? '系统',
    },
    {
      title: '状态',
      width: 100,
      render: (_, row) => (
        <Switch
          checked={row.isEnabled}
          checkedChildren="启用"
          unCheckedChildren="停用"
          onChange={(checked) => void toggleRule(row, checked)}
        />
      ),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 180,
      render: (value) => formatDate(value),
    },
    {
      title: '操作',
      width: 150,
      fixed: 'right',
      render: (_, row) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(row)}>
            编辑
          </Button>
          <Button danger size="small" icon={<DeleteOutlined />} onClick={() => deleteRule(row)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <>
      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <Title level={4}>内容提交规则</Title>
            <Text type="secondary">共 {rules.pagination.total} 条敏感词规则</Text>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建规则
          </Button>
        </div>
        <Space wrap className="review-filter-bar">
          <Input.Search
            allowClear
            enterButton={<SearchOutlined />}
            placeholder="搜索敏感词或备注"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            onSearch={(value) => {
              setKeyword(value);
              void loadRules({ page: 1, keyword: value });
            }}
          />
          <Select
            allowClear
            placeholder="全部范围"
            style={{ width: 150 }}
            value={scope}
            options={sensitiveWordScopeOptions}
            onChange={(value) => {
              setScope(value);
              void loadRules({ page: 1, scope: value });
            }}
          />
          <Select
            allowClear
            placeholder="全部状态"
            style={{ width: 140 }}
            value={enabled}
            options={[
              { label: '已启用', value: true },
              { label: '已停用', value: false },
            ]}
            onChange={(value) => {
              setEnabled(value);
              void loadRules({ page: 1, enabled: value });
            }}
          />
          <Button
            onClick={() => {
              setKeyword('');
              setScope(undefined);
              setEnabled(undefined);
              void api
                .listSensitiveWordRules(token, { page: 1, pageSize: rules.pagination.pageSize })
                .then(setRules)
                .catch((err) => message.error(err instanceof Error ? err.message : '重置失败'));
            }}
          >
            重置
          </Button>
        </Space>
        <Table
          rowKey="id"
          columns={columns}
          dataSource={rules.items}
          loading={isLoading}
          scroll={{ x: 1050 }}
          pagination={{
            current: rules.pagination.page,
            pageSize: rules.pagination.pageSize,
            total: rules.pagination.total,
            showSizeChanger: true,
            onChange: (page, pageSize) => void loadRules({ page, pageSize }),
          }}
        />
      </section>

      <Modal
        destroyOnHidden
        open={isModalOpen}
        title={editingRule ? '编辑敏感词规则' : '新建敏感词规则'}
        okText={editingRule ? '保存' : '创建'}
        cancelText="取消"
        confirmLoading={isLoading}
        onCancel={() => {
          setIsModalOpen(false);
          setEditingRule(undefined);
        }}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={saveRule}>
          <Form.Item
            label="敏感词"
            name="term"
            rules={[{ required: true, message: '请输入敏感词' }]}
          >
            <Input maxLength={50} />
          </Form.Item>
          <Form.Item
            label="适用范围"
            name="scope"
            rules={[{ required: true, message: '请选择适用范围' }]}
          >
            <Select options={sensitiveWordScopeOptions} />
          </Form.Item>
          <Form.Item label="备注" name="note">
            <Input.TextArea maxLength={200} rows={3} />
          </Form.Item>
          <Form.Item label="立即启用" name="isEnabled" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function AuditLogSection({
  action,
  auditLogs,
  isLoading,
  keyword,
  targetType,
  onActionChange,
  onKeywordChange,
  onPageChange,
  onResetFilters,
  onSearch,
  onTargetTypeChange,
  onViewDetail,
}: {
  action?: string;
  auditLogs: PaginatedAuditLogs;
  isLoading: boolean;
  keyword: string;
  targetType?: string;
  onActionChange(action?: string): void;
  onKeywordChange(keyword: string): void;
  onPageChange(page: number, pageSize: number): void;
  onResetFilters(): Promise<void>;
  onSearch(keyword: string): Promise<void>;
  onTargetTypeChange(targetType?: string): void;
  onViewDetail(log: AdminAuditLog): void;
}) {
  const columns: ColumnsType<AdminAuditLog> = [
    {
      title: '操作',
      dataIndex: 'action',
      width: 190,
      render: (value) => <Tag color={auditActionColor(value)}>{auditActionText(value)}</Tag>,
    },
    {
      title: '对象',
      width: 210,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <Tag>{auditTargetTypeText(row.targetType)}</Tag>
          <Text type="secondary" ellipsis={{ tooltip: row.targetId }} style={{ maxWidth: 180 }}>
            {row.targetId}
          </Text>
        </Space>
      ),
    },
    {
      title: '摘要',
      dataIndex: 'summary',
      render: (value) => <Text>{value}</Text>,
    },
    {
      title: '操作人',
      width: 180,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <strong>{row.actor.nickname}</strong>
          <Text type="secondary">{row.actor.email}</Text>
        </Space>
      ),
    },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (value) => formatDate(value),
    },
    {
      title: '变更',
      width: 100,
      fixed: 'right',
      render: (_, row) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => onViewDetail(row)}>
          详情
        </Button>
      ),
    },
  ];

  return (
    <section className="admin-panel">
      <div className="panel-heading">
        <div>
          <Title level={4}>操作记录</Title>
          <Text type="secondary">共 {auditLogs.pagination.total} 条审计日志</Text>
        </div>
        <Space wrap>
          <Input.Search
            allowClear
            enterButton={<SearchOutlined />}
            placeholder="搜索摘要、操作人或对象 ID"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            onSearch={onSearch}
          />
          <Select
            allowClear
            placeholder="全部操作"
            value={action}
            style={{ width: 190 }}
            options={auditActionOptions}
            onChange={onActionChange}
          />
          <Select
            allowClear
            placeholder="全部对象"
            value={targetType}
            style={{ width: 150 }}
            options={auditTargetTypeOptions}
            onChange={onTargetTypeChange}
          />
          <Button onClick={() => void onResetFilters()}>重置</Button>
        </Space>
      </div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={auditLogs.items}
        loading={isLoading}
        scroll={{ x: 1160 }}
        pagination={{
          current: auditLogs.pagination.page,
          pageSize: auditLogs.pagination.pageSize,
          total: auditLogs.pagination.total,
          showSizeChanger: true,
          onChange: onPageChange,
        }}
      />
    </section>
  );
}

function ReviewDetailDrawer({
  detail,
  isLoading,
  onClose,
  onReview,
}: {
  detail?: ReviewDetailState;
  isLoading: boolean;
  onClose(): void;
  onReview: ReviewHandler;
}) {
  const title = detail
    ? `审核详情：${detail.type === 'novel' ? detail.data.title : `${detail.data.novel.title} / ${detail.data.title}`}`
    : '审核详情';

  return (
    <Drawer
      title={title}
      open={Boolean(detail)}
      size={820}
      onClose={onClose}
      extra={
        detail ? (
          <ReviewActions
            type={detail.type}
            id={detail.data.id}
            approveDisabled={
              detail.type === 'chapter' && !publicNovelStatuses.has(detail.data.novel.status)
            }
            approveDisabledReason="请先通过作品审核"
            onReview={async (type, id, action, reason) => {
              await onReview(type, id, action, reason);
              onClose();
            }}
          />
        ) : undefined
      }
    >
      {detail?.type === 'novel' ? (
        <Space className="detail-drawer" orientation="vertical" size={18}>
          <section className="detail-metrics">
            <article>
              <Text type="secondary">章节</Text>
              <strong>{detail.data._count.chapters}</strong>
            </article>
            <article>
              <Text type="secondary">字数</Text>
              <strong>{formatWordCount(detail.data.wordCount)}</strong>
            </article>
            <article>
              <Text type="secondary">审核记录</Text>
              <strong>{detail.data.reviewLogs.length}</strong>
            </article>
          </section>

          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="状态">
              <Tag>{statusText(detail.data.status)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="作者">
              {detail.data.author.nickname}（{detail.data.author.email}）
            </Descriptions.Item>
            <Descriptions.Item label="分类">{detail.data.category.name}</Descriptions.Item>
            <Descriptions.Item label="标签">
              <Space wrap>
                {detail.data.tags.length ? (
                  detail.data.tags.map((tag) => <Tag key={tag.id}>{tag.name}</Tag>)
                ) : (
                  <Text type="secondary">无标签</Text>
                )}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {formatDate(detail.data.createdAt)}
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              {formatDate(detail.data.updatedAt)}
            </Descriptions.Item>
            <Descriptions.Item label="作品简介">{detail.data.summary}</Descriptions.Item>
          </Descriptions>

          <DetailTableSection
            title="章节目录"
            dataSource={detail.data.chapters}
            loading={isLoading}
            columns={[
              { title: '序号', dataIndex: 'orderIndex', width: 70 },
              { title: '标题', dataIndex: 'title' },
              {
                title: '状态',
                width: 100,
                render: (_, row) => <Tag>{chapterStatusText(row.status)}</Tag>,
              },
              {
                title: '字数',
                width: 100,
                render: (_, row) => formatWordCount(row.wordCount),
              },
              {
                title: '计划发布',
                width: 180,
                render: (_, row) =>
                  row.scheduledAt ? (
                    formatDate(row.scheduledAt)
                  ) : (
                    <Text type="secondary">未设置</Text>
                  ),
              },
            ]}
          />

          <DetailTableSection
            title="历史审核记录"
            dataSource={detail.data.reviewLogs}
            loading={isLoading}
            columns={reviewDetailLogColumns()}
          />
        </Space>
      ) : detail?.type === 'chapter' ? (
        <Space className="detail-drawer" orientation="vertical" size={18}>
          <section className="detail-metrics">
            <article>
              <Text type="secondary">字数</Text>
              <strong>{formatWordCount(detail.data.wordCount)}</strong>
            </article>
            <article>
              <Text type="secondary">章节序号</Text>
              <strong>{detail.data.orderIndex}</strong>
            </article>
            <article>
              <Text type="secondary">审核记录</Text>
              <strong>{detail.data.reviewLogs.length}</strong>
            </article>
          </section>

          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="状态">
              <Tag>{chapterStatusText(detail.data.status)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="作品">
              {detail.data.novel.title} · {statusText(detail.data.novel.status)}
            </Descriptions.Item>
            <Descriptions.Item label="作者">
              {detail.data.novel.author.nickname}（{detail.data.novel.author.email}）
            </Descriptions.Item>
            <Descriptions.Item label="分类">{detail.data.novel.category.name}</Descriptions.Item>
            <Descriptions.Item label="计划发布">
              {detail.data.scheduledAt ? formatDate(detail.data.scheduledAt) : '审核后立即发布'}
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {formatDate(detail.data.createdAt)}
            </Descriptions.Item>
            <Descriptions.Item label="更新时间">
              {formatDate(detail.data.updatedAt)}
            </Descriptions.Item>
          </Descriptions>

          <section>
            <div className="detail-section-title">章节正文</div>
            <Paragraph className="review-detail-content">{detail.data.content}</Paragraph>
          </section>

          <DetailTableSection
            title="历史审核记录"
            dataSource={detail.data.reviewLogs}
            loading={isLoading}
            columns={reviewDetailLogColumns()}
          />
        </Space>
      ) : (
        <Empty description="暂无审核详情" />
      )}
    </Drawer>
  );
}

function reviewDetailLogColumns() {
  return [
    {
      title: '动作',
      width: 90,
      render: (_: unknown, row: ReviewNovelDetail['reviewLogs'][number]) => (
        <Tag color={row.action === 'approve' ? 'success' : 'error'}>
          {reviewActionText(row.action)}
        </Tag>
      ),
    },
    {
      title: '审核人',
      width: 130,
      render: (_: unknown, row: ReviewNovelDetail['reviewLogs'][number]) => row.reviewer.nickname,
    },
    {
      title: '原因',
      render: (_: unknown, row: ReviewNovelDetail['reviewLogs'][number]) =>
        displayReviewReason(row.reason),
    },
    {
      title: '时间',
      width: 180,
      render: (_: unknown, row: ReviewNovelDetail['reviewLogs'][number]) =>
        formatDate(row.createdAt),
    },
  ];
}

function NovelDetailDrawer({
  detail,
  isLoading,
  onClose,
}: {
  detail?: AdminNovelDetail;
  isLoading: boolean;
  onClose(): void;
}) {
  return (
    <Drawer
      title={detail ? `作品详情：${detail.title}` : '作品详情'}
      open={Boolean(detail)}
      size={760}
      onClose={onClose}
    >
      {detail ? (
        <Space className="detail-drawer" orientation="vertical" size={18}>
          <section className="detail-metrics">
            <article>
              <Text type="secondary">章节</Text>
              <strong>{detail._count.chapters}</strong>
            </article>
            <article>
              <Text type="secondary">收藏</Text>
              <strong>{detail._count.bookshelf}</strong>
            </article>
            <article>
              <Text type="secondary">评论</Text>
              <strong>{detail._count.comments}</strong>
            </article>
            <article>
              <Text type="secondary">阅读记录</Text>
              <strong>{detail._count.histories}</strong>
            </article>
          </section>

          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="状态">
              <Tag color={publicNovelStatuses.has(detail.status) ? 'success' : 'warning'}>
                {statusText(detail.status)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="作者">
              {detail.author.nickname}（{detail.author.email}）
            </Descriptions.Item>
            <Descriptions.Item label="作者笔名">
              {detail.author.authorProfile?.penName ?? '未设置'}
            </Descriptions.Item>
            <Descriptions.Item label="分类">{detail.category.name}</Descriptions.Item>
            <Descriptions.Item label="标签">
              <Space wrap>
                {detail.tags.length ? (
                  detail.tags.map((tag) => <Tag key={tag.id}>{tag.name}</Tag>)
                ) : (
                  <Text type="secondary">无标签</Text>
                )}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="字数">{formatWordCount(detail.wordCount)}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{formatDate(detail.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{formatDate(detail.updatedAt)}</Descriptions.Item>
            <Descriptions.Item label="简介">{detail.summary}</Descriptions.Item>
          </Descriptions>

          <DetailTableSection
            title="章节"
            dataSource={detail.chapters}
            loading={isLoading}
            columns={[
              { title: '序号', dataIndex: 'orderIndex', width: 80 },
              { title: '标题', dataIndex: 'title' },
              {
                title: '状态',
                width: 100,
                render: (_, row) => <Tag>{chapterStatusText(row.status)}</Tag>,
              },
              {
                title: '字数',
                width: 100,
                render: (_, row) => formatWordCount(row.wordCount),
              },
              {
                title: '计划发布',
                width: 180,
                render: (_, row) =>
                  row.scheduledAt ? (
                    formatDate(row.scheduledAt)
                  ) : (
                    <Text type="secondary">未设置</Text>
                  ),
              },
              {
                title: '更新时间',
                width: 180,
                render: (_, row) => formatDate(row.updatedAt),
              },
            ]}
          />

          <DetailTableSection
            title="最新评论"
            dataSource={detail.comments}
            loading={isLoading}
            columns={[
              {
                title: '用户',
                width: 150,
                render: (_, row) => row.user.nickname,
              },
              {
                title: '内容',
                render: (_, row) => <Text>{row.content}</Text>,
              },
              {
                title: '时间',
                width: 180,
                render: (_, row) => formatDate(row.createdAt),
              },
            ]}
          />

          <DetailTableSection
            title="审核记录"
            dataSource={detail.reviewLogs}
            loading={isLoading}
            columns={[
              {
                title: '动作',
                width: 90,
                render: (_, row) => (
                  <Tag color={row.action === 'approve' ? 'success' : 'error'}>
                    {reviewActionText(row.action)}
                  </Tag>
                ),
              },
              {
                title: '审核人',
                width: 130,
                render: (_, row) => row.reviewer.nickname,
              },
              {
                title: '原因',
                render: (_, row) => displayReviewReason(row.reason),
              },
              {
                title: '时间',
                width: 180,
                render: (_, row) => formatDate(row.createdAt),
              },
            ]}
          />
        </Space>
      ) : (
        <Empty description="暂无作品详情" />
      )}
    </Drawer>
  );
}

function UserDetailDrawer({
  detail,
  isLoading,
  onClose,
}: {
  detail?: AdminUserDetail;
  isLoading: boolean;
  onClose(): void;
}) {
  return (
    <Drawer
      title={detail ? `用户详情：${detail.nickname}` : '用户详情'}
      open={Boolean(detail)}
      size={820}
      onClose={onClose}
    >
      {detail ? (
        <Space className="detail-drawer" orientation="vertical" size={18}>
          <section className="detail-metrics">
            <article>
              <Text type="secondary">作品</Text>
              <strong>{detail._count.novels}</strong>
            </article>
            <article>
              <Text type="secondary">书架</Text>
              <strong>{detail._count.bookshelfItems}</strong>
            </article>
            <article>
              <Text type="secondary">评论</Text>
              <strong>{detail._count.comments}</strong>
            </article>
            <article>
              <Text type="secondary">阅读记录</Text>
              <strong>{detail._count.readingHistories}</strong>
            </article>
          </section>

          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="账号状态">
              <Tag color={detail.status === 'ACTIVE' ? 'success' : 'error'}>
                {userStatusText(detail.status)}
              </Tag>
            </Descriptions.Item>
            {detail.status === 'SUSPENDED' && (
              <>
                <Descriptions.Item label="封禁原因">
                  {detail.suspensionReason || '未填写'}
                </Descriptions.Item>
                <Descriptions.Item label="封禁时间">
                  {formatDate(detail.suspendedAt)}
                </Descriptions.Item>
              </>
            )}
            <Descriptions.Item label="角色">
              <Tag
                color={
                  detail.role === 'ADMIN' ? 'red' : detail.role === 'AUTHOR' ? 'blue' : 'default'
                }
              >
                {roleText(detail.role)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="邮箱">{detail.email}</Descriptions.Item>
            <Descriptions.Item label="注册时间">{formatDate(detail.createdAt)}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{formatDate(detail.updatedAt)}</Descriptions.Item>
            <Descriptions.Item label="作者笔名">
              {detail.authorProfile?.penName ?? '未开通作者资料'}
            </Descriptions.Item>
            <Descriptions.Item label="作者简介">
              {detail.authorProfile?.bio || '未填写'}
            </Descriptions.Item>
          </Descriptions>

          <DetailTableSection
            title="作品"
            dataSource={detail.novels}
            loading={isLoading}
            columns={[
              {
                title: '作品',
                render: (_, row) => <NovelCell novel={row} />,
              },
              {
                title: '状态',
                width: 100,
                render: (_, row) => <Tag>{statusText(row.status)}</Tag>,
              },
              {
                title: '数据',
                width: 170,
                render: (_, row) =>
                  `${row._count?.chapters ?? 0} 章 / ${row._count?.comments ?? 0} 评论`,
              },
            ]}
          />

          <DetailTableSection
            title="书架"
            dataSource={detail.bookshelfItems}
            loading={isLoading}
            columns={[
              {
                title: '作品',
                render: (_, row) => row.novel.title,
              },
              {
                title: '作者',
                width: 130,
                render: (_, row) => row.novel.author.nickname,
              },
              {
                title: '状态',
                width: 100,
                render: (_, row) => <Tag>{statusText(row.novel.status)}</Tag>,
              },
              {
                title: '加入时间',
                width: 180,
                render: (_, row) => formatDate(row.createdAt),
              },
            ]}
          />

          <DetailTableSection
            title="阅读历史"
            dataSource={detail.readingHistories}
            loading={isLoading}
            columns={[
              {
                title: '作品',
                render: (_, row) => row.novel.title,
              },
              {
                title: '章节',
                render: (_, row) => `第 ${row.chapter.orderIndex} 章 ${row.chapter.title}`,
              },
              {
                title: '进度',
                width: 90,
                render: (_, row) => `${row.progress}%`,
              },
              {
                title: '更新时间',
                width: 180,
                render: (_, row) => formatDate(row.updatedAt),
              },
            ]}
          />

          <DetailTableSection
            title="评论"
            dataSource={detail.comments}
            loading={isLoading}
            columns={[
              {
                title: '作品',
                width: 150,
                render: (_, row) => row.novel.title,
              },
              {
                title: '内容',
                render: (_, row) => row.content,
              },
              {
                title: '时间',
                width: 180,
                render: (_, row) => formatDate(row.createdAt),
              },
            ]}
          />

          <DetailTableSection
            title="审核操作"
            dataSource={detail.reviewLogs}
            loading={isLoading}
            columns={[
              {
                title: '对象',
                width: 90,
                render: (_, row) => targetTypeText(row.targetType),
              },
              {
                title: '动作',
                width: 90,
                render: (_, row) => (
                  <Tag color={row.action === 'approve' ? 'success' : 'error'}>
                    {reviewActionText(row.action)}
                  </Tag>
                ),
              },
              {
                title: '原因',
                render: (_, row) => displayReviewReason(row.reason),
              },
              {
                title: '时间',
                width: 180,
                render: (_, row) => formatDate(row.createdAt),
              },
            ]}
          />
        </Space>
      ) : (
        <Empty description="暂无用户详情" />
      )}
    </Drawer>
  );
}

function AuditLogDrawer({ log, onClose }: { log?: AdminAuditLog; onClose(): void }) {
  return (
    <Drawer
      title={log ? `审计详情：${auditActionText(log.action)}` : '审计详情'}
      open={Boolean(log)}
      size={760}
      onClose={onClose}
    >
      {log ? (
        <Space className="detail-drawer" orientation="vertical" size={18}>
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="操作">
              <Tag color={auditActionColor(log.action)}>{auditActionText(log.action)}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="操作人">
              {log.actor.nickname}（{log.actor.email}）
            </Descriptions.Item>
            <Descriptions.Item label="对象">
              {auditTargetTypeText(log.targetType)} · {log.targetId}
            </Descriptions.Item>
            <Descriptions.Item label="摘要">{log.summary}</Descriptions.Item>
            <Descriptions.Item label="操作时间">{formatDate(log.createdAt)}</Descriptions.Item>
          </Descriptions>

          <section className="audit-change-grid">
            <AuditJsonBlock title="操作前" value={log.before} />
            <AuditJsonBlock title="操作后" value={log.after} />
          </section>
        </Space>
      ) : (
        <Empty description="暂无审计详情" />
      )}
    </Drawer>
  );
}

function AuditJsonBlock({ title, value }: { title: string; value?: unknown }) {
  return (
    <section>
      <div className="detail-section-title">{title}</div>
      <pre className="audit-json">{formatAuditJson(value)}</pre>
    </section>
  );
}

function DetailTableSection<T extends { id: string }>({
  title,
  dataSource,
  loading,
  columns,
}: {
  title: string;
  dataSource: T[];
  loading: boolean;
  columns: ColumnsType<T>;
}) {
  return (
    <section>
      <div className="detail-section-title">{title}</div>
      <Table
        rowKey="id"
        columns={columns}
        dataSource={dataSource}
        loading={loading}
        pagination={dataSource.length > 5 ? { pageSize: 5 } : false}
        size="small"
      />
    </section>
  );
}

function LoginScreen({
  error,
  isLoading,
  onLogin,
}: {
  error?: string;
  isLoading: boolean;
  onLogin(values: { email: string; password: string }): Promise<void>;
}) {
  return (
    <main className="admin-login-page">
      <section className="admin-login-panel">
        <div>
          <Text type="secondary">阅界管理端</Text>
          <Title level={2}>管理员登录</Title>
        </div>
        {error && <Alert type="error" message={error} showIcon />}
        <Form
          layout="vertical"
          initialValues={{ email: 'admin@novel.local', password: 'Admin123456' }}
          onFinish={onLogin}
        >
          <Form.Item label="邮箱" name="email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Button block type="primary" htmlType="submit" loading={isLoading}>
            登录
          </Button>
        </Form>
      </section>
    </main>
  );
}

function BootScreen({ text }: { text: string }) {
  return (
    <main className="admin-login-page">
      <section className="admin-login-panel">
        <Title level={3}>{text}</Title>
      </section>
    </main>
  );
}

function novelColumns(
  onReview: ReviewHandler,
  onOpenDetail: (type: 'novel' | 'chapter', id: string) => Promise<void>,
): ColumnsType<ReviewNovel> {
  return [
    {
      title: '作品',
      dataIndex: 'title',
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <strong>{row.title}</strong>
          <Text type="secondary">{row.summary}</Text>
        </Space>
      ),
    },
    {
      title: '作者',
      render: (_, row) => row.author.nickname,
      width: 120,
    },
    {
      title: '分类',
      render: (_, row) => row.category.name,
      width: 100,
    },
    {
      title: '章节',
      render: (_, row) => row._count.chapters,
      width: 80,
    },
    {
      title: '操作',
      width: 230,
      render: (_, row) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            title="查看审核详情"
            onClick={() => onOpenDetail('novel', row.id)}
          />
          <ReviewActions type="novel" id={row.id} onReview={onReview} />
        </Space>
      ),
    },
  ];
}

function chapterColumns(
  onReview: ReviewHandler,
  onOpenDetail: (type: 'novel' | 'chapter', id: string) => Promise<void>,
): ColumnsType<ReviewChapter> {
  return [
    {
      title: '章节',
      dataIndex: 'title',
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <strong>{row.title}</strong>
          <Text type="secondary">{row.novel.title}</Text>
        </Space>
      ),
    },
    {
      title: '作者',
      render: (_, row) => row.novel.author.nickname,
      width: 120,
    },
    {
      title: '作品状态',
      render: (_, row) => (
        <Tag color={publicNovelStatuses.has(row.novel.status) ? 'success' : 'warning'}>
          {statusText(row.novel.status)}
        </Tag>
      ),
      width: 110,
    },
    {
      title: '字数',
      dataIndex: 'wordCount',
      width: 90,
    },
    {
      title: '计划发布',
      width: 180,
      render: (_, row) =>
        row.scheduledAt ? formatDate(row.scheduledAt) : <Text type="secondary">审核后立即</Text>,
    },
    {
      title: '操作',
      width: 230,
      render: (_, row) => (
        <Space>
          <Button
            size="small"
            icon={<EyeOutlined />}
            title="查看审核详情"
            onClick={() => onOpenDetail('chapter', row.id)}
          />
          <ReviewActions
            type="chapter"
            id={row.id}
            approveDisabled={!publicNovelStatuses.has(row.novel.status)}
            approveDisabledReason="请先通过作品审核"
            onReview={onReview}
          />
        </Space>
      ),
    },
  ];
}

function commentColumns(onDelete: (id: string) => Promise<void>): ColumnsType<AdminComment> {
  return [
    {
      title: '评论',
      dataIndex: 'content',
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <strong>{row.novel.title}</strong>
          <Text>{row.content}</Text>
        </Space>
      ),
    },
    {
      title: '用户',
      render: (_, row) => row.user.nickname,
      width: 120,
    },
    {
      title: '时间',
      render: (_, row) => new Date(row.createdAt).toLocaleString(),
      width: 190,
    },
    {
      title: '操作',
      width: 100,
      render: (_, row) => (
        <Button danger size="small" onClick={() => onDelete(row.id)}>
          删除
        </Button>
      ),
    },
  ];
}

function recommendColumns(
  items: Novel[],
  onMove: (index: number, direction: -1 | 1) => void,
  onRemove: (id: string) => void,
): ColumnsType<Novel> {
  return [
    {
      title: '顺序',
      width: 80,
      render: (_, row) => items.findIndex((item) => item.id === row.id) + 1,
    },
    {
      title: '作品',
      render: (_, row) => <NovelCell novel={row} />,
    },
    {
      title: '操作',
      width: 220,
      render: (_, row, index) => (
        <Space>
          <Button
            size="small"
            icon={<UpOutlined />}
            disabled={index === 0}
            onClick={() => onMove(index, -1)}
          />
          <Button
            size="small"
            icon={<DownOutlined />}
            disabled={index === items.length - 1}
            onClick={() => onMove(index, 1)}
          />
          <Button danger size="small" icon={<DeleteOutlined />} onClick={() => onRemove(row.id)}>
            移除
          </Button>
        </Space>
      ),
    },
  ];
}

function candidateColumns(
  recommendedIds: Set<string>,
  onAdd: (novel: Novel) => void,
): ColumnsType<Novel> {
  return [
    {
      title: '作品',
      render: (_, row) => <NovelCell novel={row} />,
    },
    {
      title: '热度',
      width: 160,
      render: (_, row) => `${row._count?.bookshelf ?? 0} 收藏 / ${row._count?.comments ?? 0} 评论`,
    },
    {
      title: '操作',
      width: 110,
      render: (_, row) => (
        <Button
          size="small"
          type="primary"
          icon={<PlusOutlined />}
          disabled={recommendedIds.has(row.id)}
          onClick={() => onAdd(row)}
        >
          添加
        </Button>
      ),
    },
  ];
}

function managementNovelColumns(
  onUpdateStatus: (id: string, status: AdminNovelStatus) => Promise<void>,
  onViewDetail: (id: string) => void,
): ColumnsType<Novel> {
  return [
    {
      title: '作品',
      render: (_, row) => <NovelCell novel={row} />,
    },
    {
      title: '状态',
      width: 150,
      render: (_, row) => (
        <Select
          value={row.status}
          options={novelStatusOptions}
          style={{ width: 130 }}
          onChange={(status) => {
            if (status === row.status) {
              return;
            }
            Modal.confirm({
              title: '确认修改作品状态',
              content: `将《${row.title}》从“${statusText(row.status)}”调整为“${statusText(status)}”。`,
              okText: '确认修改',
              cancelText: '取消',
              onOk: () => onUpdateStatus(row.id, status),
            });
          }}
        />
      ),
    },
    {
      title: '操作',
      width: 110,
      render: (_, row) => (
        <Button size="small" icon={<EyeOutlined />} onClick={() => onViewDetail(row.id)}>
          详情
        </Button>
      ),
    },
    {
      title: '数据',
      width: 180,
      render: (_, row) =>
        `${row._count?.chapters ?? 0} 章 / ${row._count?.bookshelf ?? 0} 收藏 / ${
          row._count?.comments ?? 0
        } 评论`,
    },
    {
      title: '更新时间',
      width: 180,
      render: (_, row) => new Date(row.updatedAt).toLocaleString(),
    },
  ];
}

function userColumns(
  currentUserId: string,
  onUpdateRole: (id: string, role: User['role']) => Promise<void>,
  onUpdateStatus: (id: string, status: UserStatus, reason?: string) => Promise<void>,
  onViewDetail: (id: string) => void,
): ColumnsType<AdminUser> {
  return [
    {
      title: '用户',
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <strong>{row.nickname}</strong>
          <Text type="secondary">{row.email}</Text>
        </Space>
      ),
    },
    {
      title: '角色',
      width: 150,
      render: (_, row) => (
        <Select
          value={row.role}
          options={userRoleOptions}
          style={{ width: 130 }}
          onChange={(role) => {
            if (role === row.role) {
              return;
            }
            Modal.confirm({
              title: '确认修改用户角色',
              content: `将 ${row.nickname} 的角色从“${roleText(row.role)}”调整为“${roleText(role)}”。`,
              okText: '确认修改',
              cancelText: '取消',
              onOk: () => onUpdateRole(row.id, role),
            });
          }}
        />
      ),
    },
    {
      title: '账号状态',
      width: 190,
      render: (_, row) => (
        <Space orientation="vertical" size={2}>
          <Tag color={row.status === 'ACTIVE' ? 'success' : 'error'}>
            {userStatusText(row.status)}
          </Tag>
          {row.suspensionReason && (
            <Text
              type="secondary"
              ellipsis={{ tooltip: row.suspensionReason }}
              style={{ maxWidth: 160 }}
            >
              {row.suspensionReason}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: '操作',
      width: 210,
      render: (_, row) => (
        <Space size="small">
          <Button size="small" icon={<EyeOutlined />} onClick={() => onViewDetail(row.id)}>
            详情
          </Button>
          {row.status === 'ACTIVE' ? (
            <Button
              danger
              disabled={row.id === currentUserId}
              icon={<StopOutlined />}
              size="small"
              title={row.id === currentUserId ? '不能封禁当前登录账号' : undefined}
              onClick={() => {
                let reason = '';
                Modal.confirm({
                  title: `封禁用户：${row.nickname}`,
                  content: (
                    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                      <Text type="secondary">封禁后，用户将无法登录或继续使用现有登录状态。</Text>
                      <Input.TextArea
                        maxLength={200}
                        placeholder="请输入封禁原因"
                        rows={3}
                        showCount
                        onChange={(event) => {
                          reason = event.target.value;
                        }}
                      />
                    </Space>
                  ),
                  okButtonProps: { danger: true },
                  okText: '确认封禁',
                  cancelText: '取消',
                  onOk: () => {
                    const normalizedReason = reason.trim();
                    if (!normalizedReason) {
                      message.error('请填写封禁原因');
                      return Promise.reject(new Error('封禁原因不能为空'));
                    }
                    return onUpdateStatus(row.id, 'SUSPENDED', normalizedReason);
                  },
                });
              }}
            >
              封禁
            </Button>
          ) : (
            <Button
              icon={<CheckCircleOutlined />}
              size="small"
              onClick={() => {
                Modal.confirm({
                  title: `解除 ${row.nickname} 的封禁`,
                  content: '解封后，用户可以重新登录并正常使用平台功能。',
                  okText: '确认解封',
                  cancelText: '取消',
                  onOk: () => onUpdateStatus(row.id, 'ACTIVE'),
                });
              }}
            >
              解封
            </Button>
          )}
        </Space>
      ),
    },
    {
      title: '贡献',
      width: 180,
      render: (_, row) => `${row._count?.novels ?? 0} 本作品 / ${row._count?.comments ?? 0} 条评论`,
    },
    {
      title: '注册时间',
      width: 180,
      render: (_, row) => new Date(row.createdAt).toLocaleString(),
    },
  ];
}

function NovelCell({ novel }: { novel: Novel }) {
  return (
    <Space orientation="vertical" size={2}>
      <strong>{novel.title}</strong>
      <Text type="secondary">
        {novel.category.name} · {novel.author.nickname} · {formatWordCount(novel.wordCount)}
      </Text>
      <Text type="secondary">{novel.summary}</Text>
    </Space>
  );
}

function ReviewActions({
  type,
  id,
  approveDisabled = false,
  approveDisabledReason,
  onReview,
}: {
  type: 'novel' | 'chapter';
  id: string;
  approveDisabled?: boolean;
  approveDisabledReason?: string;
  onReview: ReviewHandler;
}) {
  return (
    <Space>
      <Button
        size="small"
        type="primary"
        icon={<CheckCircleOutlined />}
        disabled={approveDisabled}
        title={approveDisabled ? approveDisabledReason : undefined}
        onClick={() => onReview(type, id, 'approve')}
      >
        通过
      </Button>
      <Button
        danger
        size="small"
        icon={<StopOutlined />}
        onClick={() => {
          let reason = '';
          Modal.confirm({
            title: '确认驳回',
            content: (
              <Input.TextArea
                autoSize={{ minRows: 3, maxRows: 5 }}
                placeholder="填写驳回原因"
                onChange={(event) => {
                  reason = event.target.value;
                }}
              />
            ),
            okText: '驳回',
            okButtonProps: { danger: true },
            cancelText: '取消',
            onOk: () => {
              const trimmedReason = reason.trim();
              if (!trimmedReason) {
                message.error('请填写驳回原因');
                return Promise.reject(new Error('Reject reason is required'));
              }

              return onReview(type, id, 'reject', trimmedReason);
            },
          });
        }}
      >
        驳回
      </Button>
    </Space>
  );
}

function BatchReviewActions({
  count,
  targetLabel,
  onReview,
}: {
  count: number;
  targetLabel: '作品' | '章节';
  onReview(action: 'approve' | 'reject', reason?: string): Promise<void>;
}) {
  return (
    <Space wrap>
      <Button
        size="small"
        type="primary"
        icon={<CheckCircleOutlined />}
        disabled={count === 0}
        onClick={() =>
          Modal.confirm({
            title: `批量通过 ${count} 项${targetLabel}？`,
            content: '每一项都会执行完整的状态校验，并分别写入审核和审计记录。',
            okText: '批量通过',
            cancelText: '取消',
            onOk: () => onReview('approve'),
          })
        }
      >
        批量通过
      </Button>
      <Button
        danger
        size="small"
        icon={<StopOutlined />}
        disabled={count === 0}
        onClick={() => {
          let reason = '';
          Modal.confirm({
            title: `批量驳回 ${count} 项${targetLabel}？`,
            content: (
              <Input.TextArea
                autoSize={{ minRows: 3, maxRows: 5 }}
                placeholder="填写统一驳回原因"
                onChange={(event) => {
                  reason = event.target.value;
                }}
              />
            ),
            okText: '批量驳回',
            okButtonProps: { danger: true },
            cancelText: '取消',
            onOk: () => {
              const trimmedReason = reason.trim();
              if (!trimmedReason) {
                message.error('请填写驳回原因');
                return Promise.reject(new Error('Reject reason is required'));
              }
              return onReview('reject', trimmedReason);
            },
          });
        }}
      >
        批量驳回
      </Button>
    </Space>
  );
}

const publicNovelStatuses = new Set<Novel['status']>(['SERIALIZING', 'COMPLETED']);

const novelStatusOptions: Array<{ value: AdminNovelStatus; label: string }> = [
  { value: 'DRAFT', label: '草稿' },
  { value: 'REVIEWING', label: '审核中' },
  { value: 'REJECTED', label: '已驳回' },
  { value: 'SERIALIZING', label: '连载中' },
  { value: 'COMPLETED', label: '已完结' },
  { value: 'HIDDEN', label: '已隐藏' },
];

const novelSortOptions: Array<{ value: AdminNovelSort; label: string }> = [
  { value: 'latest', label: '最近更新' },
  { value: 'popular', label: '热度优先' },
];

const userRoleOptions: Array<{ value: User['role']; label: string }> = [
  { value: 'READER', label: '读者' },
  { value: 'AUTHOR', label: '作者' },
  { value: 'ADMIN', label: '管理员' },
];

const userStatusOptions: Array<{ value: UserStatus; label: string }> = [
  { value: 'ACTIVE', label: '正常' },
  { value: 'SUSPENDED', label: '已封禁' },
];

const authorApplicationStatusOptions: Array<{
  value: AuthorApplicationStatus;
  label: string;
}> = [
  { value: 'PENDING', label: '待审核' },
  { value: 'APPROVED', label: '已通过' },
  { value: 'REJECTED', label: '已驳回' },
];

const auditActionOptions = [
  { value: 'novel.status.update', label: '修改作品状态' },
  { value: 'user.role.update', label: '修改用户角色' },
  { value: 'user.status.update', label: '修改账号状态' },
  { value: 'author.application.approve', label: '通过作者申请' },
  { value: 'author.application.reject', label: '驳回作者申请' },
  { value: 'comment.delete', label: '删除评论' },
  { value: 'paragraph-comment.report.remove', label: '移除违规段评' },
  { value: 'paragraph-comment.report.dismiss', label: '驳回段评举报' },
  { value: 'comment.report.remove', label: '移除违规评论' },
  { value: 'comment.report.dismiss', label: '驳回评论举报' },
  { value: 'recommend_slot.items.update', label: '更新推荐位' },
  { value: 'review.novel.approve', label: '通过作品审核' },
  { value: 'review.novel.reject', label: '驳回作品审核' },
  { value: 'review.chapter.approve', label: '通过章节审核' },
  { value: 'review.chapter.reject', label: '驳回章节审核' },
];

const auditTargetTypeOptions = [
  { value: 'novel', label: '作品' },
  { value: 'chapter', label: '章节' },
  { value: 'user', label: '用户' },
  { value: 'comment', label: '评论' },
  { value: 'paragraph-comment-report', label: '段评举报' },
  { value: 'comment-report', label: '评论举报' },
  { value: 'author-application', label: '作者申请' },
  { value: 'recommend_slot', label: '推荐位' },
];

function statusText(status: Novel['status']) {
  const statuses: Record<Novel['status'], string> = {
    DRAFT: '草稿',
    REVIEWING: '审核中',
    REJECTED: '已驳回',
    SERIALIZING: '连载中',
    COMPLETED: '已完结',
    HIDDEN: '已隐藏',
  };
  return statuses[status];
}

function roleText(role: User['role']) {
  const roles: Record<User['role'], string> = {
    READER: '读者',
    AUTHOR: '作者',
    ADMIN: '管理员',
  };
  return roles[role];
}

function userStatusText(status: UserStatus) {
  return status === 'ACTIVE' ? '正常' : '已封禁';
}

function authorApplicationStatusText(status: AuthorApplicationStatus) {
  const statuses: Record<AuthorApplicationStatus, string> = {
    PENDING: '待审核',
    APPROVED: '已通过',
    REJECTED: '已驳回',
  };
  return statuses[status];
}

function authorApplicationStatusColor(status: AuthorApplicationStatus) {
  if (status === 'APPROVED') {
    return 'success';
  }
  if (status === 'REJECTED') {
    return 'error';
  }
  return 'processing';
}

function chapterStatusText(status: AdminNovelDetail['chapters'][number]['status']) {
  const statuses: Record<AdminNovelDetail['chapters'][number]['status'], string> = {
    DRAFT: '草稿',
    REVIEWING: '审核中',
    SCHEDULED: '待定时发布',
    PUBLISHED: '已发布',
    REJECTED: '已驳回',
  };
  return statuses[status];
}

function reviewActionText(action: string) {
  if (action === 'approve') {
    return '通过';
  }
  if (action === 'reject') {
    return '驳回';
  }
  return action;
}

function auditActionText(action: string) {
  const actions: Record<string, string> = {
    'novel.status.update': '修改作品状态',
    'user.role.update': '修改用户角色',
    'user.status.update': '修改账号状态',
    'author.application.approve': '通过作者申请',
    'author.application.reject': '驳回作者申请',
    'comment.delete': '删除评论',
    'paragraph-comment.report.remove': '移除违规段评',
    'paragraph-comment.report.dismiss': '驳回段评举报',
    'comment.report.remove': '移除违规评论',
    'comment.report.dismiss': '驳回评论举报',
    'recommend_slot.items.update': '更新推荐位',
    'review.novel.approve': '通过作品审核',
    'review.novel.reject': '驳回作品审核',
    'review.chapter.approve': '通过章节审核',
    'review.chapter.reject': '驳回章节审核',
  };
  return actions[action] ?? action;
}

function auditActionColor(action: string) {
  if (action.endsWith('.approve')) {
    return 'success';
  }
  if (
    action.endsWith('.reject') ||
    action === 'comment.delete' ||
    action === 'paragraph-comment.report.remove' ||
    action === 'comment.report.remove'
  ) {
    return 'error';
  }
  if (action === 'recommend_slot.items.update') {
    return 'processing';
  }
  return 'warning';
}

function auditTargetTypeText(targetType: string) {
  const targetTypes: Record<string, string> = {
    novel: '作品',
    chapter: '章节',
    user: '用户',
    comment: '评论',
    'paragraph-comment-report': '段评举报',
    'comment-report': '评论举报',
    'author-application': '作者申请',
    recommend_slot: '推荐位',
  };
  return targetTypes[targetType] ?? targetType;
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : '-';
}

function showBatchResult(result: BatchActionResult, actionLabel: string) {
  if (result.failed === 0) {
    message.success(`已完成 ${result.succeeded} 项${actionLabel}`);
    return;
  }
  const firstError = result.items.find((item) => !item.success)?.error;
  message.warning(
    `${result.succeeded} 项成功，${result.failed} 项失败${firstError ? `：${firstError}` : ''}`,
  );
}

function paragraphReportReasonText(reason: AdminParagraphCommentReport['reason']) {
  const reasons: Record<AdminParagraphCommentReport['reason'], string> = {
    SPAM: '垃圾广告',
    ABUSE: '攻击辱骂',
    SPOILER: '恶意剧透',
    OTHER: '其他问题',
  };
  return reasons[reason];
}

function formatResolutionDuration(minutes: number | null) {
  if (minutes === null) {
    return '暂无';
  }
  if (minutes < 1) {
    return '<1 分钟';
  }
  if (minutes < 60) {
    return `${Math.round(minutes)} 分钟`;
  }
  if (minutes < 1440) {
    return `${Math.round((minutes / 60) * 10) / 10} 小时`;
  }
  return `${Math.round((minutes / 1440) * 10) / 10} 天`;
}

function paragraphReportReasonColor(reason: AdminParagraphCommentReport['reason']) {
  if (reason === 'ABUSE') {
    return 'error';
  }
  if (reason === 'SPOILER') {
    return 'warning';
  }
  return reason === 'SPAM' ? 'processing' : 'default';
}

function paragraphReportStatusText(status: ParagraphReportStatus) {
  const statuses: Record<ParagraphReportStatus, string> = {
    PENDING: '待处理',
    RESOLVED: '已移除',
    DISMISSED: '已驳回',
  };
  return statuses[status];
}

function paragraphReportStatusColor(status: ParagraphReportStatus) {
  if (status === 'RESOLVED') {
    return 'error';
  }
  if (status === 'DISMISSED') {
    return 'default';
  }
  return 'processing';
}

const sensitiveWordScopeOptions = [
  { label: '全部内容', value: 'ALL' },
  { label: '作品信息', value: 'NOVEL' },
  { label: '章节内容', value: 'CHAPTER' },
  { label: '评论与段评', value: 'COMMENT' },
] satisfies Array<{ label: string; value: SensitiveWordScope }>;

function sensitiveWordScopeText(scope: SensitiveWordScope) {
  return sensitiveWordScopeOptions.find((item) => item.value === scope)?.label ?? scope;
}

function formatWordCount(value: number) {
  if (value >= 10000) {
    return `${Math.round(value / 1000) / 10} 万字`;
  }
  return `${value} 字`;
}

function displayReviewReason(reason?: string | null) {
  const normalized = reason?.trim();
  if (!normalized || /^[?\s]+$/.test(normalized)) {
    return '未填写具体原因';
  }

  return normalized;
}

function formatAuditJson(value?: unknown) {
  if (value === undefined || value === null) {
    return '无记录';
  }

  return JSON.stringify(value, null, 2);
}

function targetTypeText(targetType: string) {
  if (targetType === 'novel') {
    return '作品';
  }
  if (targetType === 'chapter') {
    return '章节';
  }
  return targetType;
}

export default App;
