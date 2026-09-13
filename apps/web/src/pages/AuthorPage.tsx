import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent, ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  BarChart3,
  Bookmark,
  BookCheck,
  BookOpen,
  BookPlus,
  CalendarDays,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheckBig,
  Database,
  FilePlus2,
  FileText,
  Globe2,
  History,
  ImagePlus,
  Layers3,
  ListChecks,
  MessageCircle,
  Megaphone,
  PencilLine,
  Pin,
  RefreshCcw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import type {
  AuthorApplication,
  AuthorAiAction,
  AuthorAiAssistanceResult,
  AuthorCalendar,
  AuthorCalendarEvent,
  AuthorCalendarEventType,
  AuthorCollectionTaskPreview,
  AuthorCollectionTaskResult,
  AuthorCollectionHtmlAnalysis,
  AuthorCollectionJsonAnalysis,
  AuthorDashboard,
  AuthorNovel,
  AuthorRagEvaluationResult,
  AuthorOnboarding,
  AuthorProfile,
  AuthorRagIndexStatus,
  Category,
  ChapterVersion,
  DeletedChapter,
  DraftChapter,
  NovelAnnouncement,
  NovelVolume,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { NovelCover } from '../components/NovelCover';
import { ContentAppealsPanel } from '../components/ContentAppealsPanel';

const writerRoles = new Set(['AUTHOR']);
const coverTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const readerPortalUrl = import.meta.env.VITE_READER_APP_URL ?? 'http://localhost:5300';

type NovelPayload = {
  title: string;
  summary: string;
  categoryId: string;
  coverUrl?: string;
  tagNames?: string[];
};

type ChapterPayload = {
  title: string;
  content: string;
  volumeId?: string | null;
  scheduledAt?: string | null;
};

type AnnouncementPayload = {
  title: string;
  content: string;
  isPinned: boolean;
  action: 'save' | 'publish';
};

type CalendarPlanPayload = {
  title: string;
  note?: string;
  eventAt: string;
  type: Exclude<AuthorCalendarEventType, 'CHAPTER'>;
};

type AutoSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
type DashboardTrendMetric = 'bookshelfAdds' | 'comments' | 'publishedWords';
type AuthorWorkspaceView =
  | 'home'
  | 'dashboard'
  | 'appeals'
  | 'works'
  | 'collection'
  | 'planning'
  | 'profile';
type AuthorWorkView = 'novel' | 'catalog';

const authorWorkspaceLabels: Record<AuthorWorkspaceView, string> = {
  home: '工作台',
  dashboard: '数据概览',
  appeals: '内容申诉',
  works: '小说作品',
  collection: '采集任务',
  planning: '创作计划',
  profile: '作者资料',
};

const authorWorkLabels: Record<AuthorWorkView, string> = {
  novel: '\u4f5c\u54c1\u4fe1\u606f',
  catalog: '\u76ee\u5f55\u7ba1\u7406',
};

export function AuthorPage() {
  const { token, user, isReady, isAuthenticated, reloadUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { novelId: routeNovelId, chapterId: routeChapterId } = useParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [novels, setNovels] = useState<AuthorNovel[]>([]);
  const [dashboard, setDashboard] = useState<AuthorDashboard>();
  const [calendar, setCalendar] = useState<AuthorCalendar>();
  const [onboarding, setOnboarding] = useState<AuthorOnboarding>();
  const [dashboardDays, setDashboardDays] = useState(14);
  const [calendarMonth, setCalendarMonth] = useState(currentMonthValue());
  const [isDashboardLoading, setIsDashboardLoading] = useState(false);
  const [isCalendarLoading, setIsCalendarLoading] = useState(false);
  const [isOnboardingLoading, setIsOnboardingLoading] = useState(false);
  const [selectedNovelId, setSelectedNovelId] = useState('');
  const [selectedChapterId, setSelectedChapterId] = useState('');
  const [workspaceView, setWorkspaceView] = useState<AuthorWorkspaceView>(() =>
    new URLSearchParams(location.search).get('view') === 'works' ? 'works' : 'home',
  );
  const [workView, setWorkView] = useState<AuthorWorkView>('novel');
  const [isCreateNovelOpen, setIsCreateNovelOpen] = useState(false);
  const [isWorkDetailOpen, setIsWorkDetailOpen] = useState(false);
  const [expandedNav, setExpandedNav] = useState({ works: true, data: true });
  const [chapterVersions, setChapterVersions] = useState<ChapterVersion[]>([]);
  const [deletedChapters, setDeletedChapters] = useState<DeletedChapter[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingNovel, setIsSubmittingNovel] = useState(false);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const [isUpdatingNovelLifecycle, setIsUpdatingNovelLifecycle] = useState(false);
  const [isSubmittingChapter, setIsSubmittingChapter] = useState(false);
  const [isSubmittingChapterEdit, setIsSubmittingChapterEdit] = useState(false);
  const [isUpdatingChapters, setIsUpdatingChapters] = useState(false);
  const [isLoadingChapterVersions, setIsLoadingChapterVersions] = useState(false);
  const [isLoadingChapterTrash, setIsLoadingChapterTrash] = useState(false);
  const [isUpdatingVolumes, setIsUpdatingVolumes] = useState(false);
  const [isUpdatingAnnouncements, setIsUpdatingAnnouncements] = useState(false);
  const [isUpdatingCalendar, setIsUpdatingCalendar] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const canWrite = Boolean(user && writerRoles.has(user.role));
  const activeNovelId = routeNovelId ?? selectedNovelId;
  const activeChapterId =
    routeChapterId && routeChapterId !== 'new' ? routeChapterId : selectedChapterId;
  const selectedNovel = useMemo(
    () => novels.find((novel) => novel.id === activeNovelId),
    [activeNovelId, novels],
  );
  const selectedChapter = useMemo(
    () => selectedNovel?.chapters?.find((chapter) => chapter.id === activeChapterId),
    [activeChapterId, selectedNovel],
  );
  const isWritingRoute = Boolean(routeNovelId && routeChapterId);

  async function loadData(activeToken: string, days = dashboardDays, month = calendarMonth) {
    setIsLoading(true);
    setError(undefined);
    try {
      const [categoryList, novelList, dashboardData, calendarData] = await Promise.all([
        api.listCategories(),
        api.listAuthorNovels(activeToken),
        api.getAuthorDashboard(activeToken, days),
        api.getAuthorCalendar(activeToken, month),
      ]);
      setCategories(categoryList);
      setNovels(novelList);
      setDashboard(dashboardData);
      setCalendar(calendarData);
      setSelectedNovelId((current) =>
        novelList.some((novel) => novel.id === current) ? current : novelList[0]?.id || '',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  }

  async function loadCalendar(activeToken: string, month: string) {
    setIsCalendarLoading(true);
    setError(undefined);
    try {
      setCalendar(await api.getAuthorCalendar(activeToken, month));
    } catch (err) {
      setError(err instanceof Error ? err.message : '创作日历加载失败');
    } finally {
      setIsCalendarLoading(false);
    }
  }

  async function loadDashboard(activeToken: string, days: number) {
    setIsDashboardLoading(true);
    setError(undefined);
    try {
      setDashboard(await api.getAuthorDashboard(activeToken, days));
    } catch (err) {
      setError(err instanceof Error ? err.message : '数据概览加载失败');
    } finally {
      setIsDashboardLoading(false);
    }
  }

  async function loadChapterVersions(activeToken: string, chapterId: string) {
    setIsLoadingChapterVersions(true);
    try {
      setChapterVersions(await api.listAuthorChapterVersions(activeToken, chapterId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '章节版本历史加载失败');
    } finally {
      setIsLoadingChapterVersions(false);
    }
  }

  async function loadChapterTrash(activeToken: string, novelId: string) {
    setIsLoadingChapterTrash(true);
    try {
      setDeletedChapters(await api.listAuthorChapterTrash(activeToken, novelId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '章节回收站加载失败');
    } finally {
      setIsLoadingChapterTrash(false);
    }
  }

  async function loadOnboarding(activeToken: string) {
    setIsOnboardingLoading(true);
    setError(undefined);
    try {
      const result = await api.getAuthorOnboarding(activeToken);
      setOnboarding(result);
      if (result.canWrite && !canWrite) {
        await reloadUser();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '作者状态加载失败');
    } finally {
      setIsOnboardingLoading(false);
    }
  }

  async function submitAuthorApplication(payload: {
    penName: string;
    bio?: string;
    statement: string;
  }) {
    if (!token) {
      return;
    }
    setIsOnboardingLoading(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const application = await api.submitAuthorApplication(token, payload);
      setOnboarding((current) => ({
        canWrite: false,
        emailVerified: current?.emailVerified ?? true,
        profile: current?.profile,
        application,
      }));
      setMessage('作者申请已提交');
    } catch (err) {
      setError(err instanceof Error ? err.message : '作者申请提交失败');
      throw err;
    } finally {
      setIsOnboardingLoading(false);
    }
  }

  async function saveAuthorProfile(payload: { penName: string; bio?: string }) {
    if (!token) {
      return;
    }
    setIsOnboardingLoading(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const profile = await api.updateAuthorProfile(token, payload);
      setOnboarding((current) =>
        current ? { ...current, profile } : { canWrite: true, emailVerified: true, profile },
      );
      setMessage('作者资料已更新');
    } catch (err) {
      setError(err instanceof Error ? err.message : '作者资料保存失败');
      throw err;
    } finally {
      setIsOnboardingLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      void loadOnboarding(token);
    } else {
      setOnboarding(undefined);
    }
  }, [token, canWrite]);

  useEffect(() => {
    if (token && canWrite) {
      void loadData(token);
    }
  }, [token, canWrite]);

  useEffect(() => {
    setSelectedChapterId((current) =>
      selectedNovel?.chapters?.some((chapter) => chapter.id === current)
        ? current
        : selectedNovel?.chapters?.[0]?.id || '',
    );
  }, [selectedNovel]);

  useEffect(() => {
    if (token && selectedChapterId) {
      void loadChapterVersions(token, selectedChapterId);
    } else {
      setChapterVersions([]);
    }
  }, [token, selectedChapterId]);

  useEffect(() => {
    if (token && selectedNovelId) {
      void loadChapterTrash(token, selectedNovelId);
    } else {
      setDeletedChapters([]);
    }
  }, [token, selectedNovelId]);

  if (!isReady) {
    return <AuthorState title="正在恢复登录状态..." />;
  }

  if (!isAuthenticated) {
    return (
      <AuthorState title="请先登录">
        <Link className="primary-link" to="/login">
          去登录
        </Link>
      </AuthorState>
    );
  }

  if (user?.role === 'ADMIN') {
    return (
      <AuthorState title="管理员请使用管理后台">
        <a
          className="primary-link"
          href={import.meta.env.VITE_ADMIN_APP_URL ?? 'http://localhost:5301'}
        >
          进入管理后台
        </a>
      </AuthorState>
    );
  }

  if (!canWrite) {
    return (
      <AuthorOnboardingView
        application={onboarding?.application}
        emailVerified={onboarding?.emailVerified ?? Boolean(user?.emailVerified)}
        isLoading={isOnboardingLoading}
        message={message}
        error={error}
        nickname={user?.nickname ?? ''}
        onRefresh={() => token && loadOnboarding(token)}
        onSubmit={submitAuthorApplication}
      />
    );
  }

  if (isWritingRoute) {
    const isNewChapter = routeChapterId === 'new';

    if (isLoading && !selectedNovel) {
      return <AuthorState title="正在打开章节编辑器..." />;
    }

    if (!selectedNovel) {
      return (
        <AuthorState title="没有找到这部作品">
          <button className="primary-link" type="button" onClick={() => navigate('/?view=works')}>
            返回作品管理
          </button>
        </AuthorState>
      );
    }

    return (
      <section className="chapter-writing-page">
        <header className="chapter-writing-page-header">
          <button className="ghost-button" type="button" onClick={() => navigate('/?view=works')}>
            <ChevronLeft size={17} aria-hidden />
            返回作品管理
          </button>
          <div>
            <strong>{selectedNovel.title}</strong>
            <small>{isNewChapter ? '创建新章节' : selectedChapter?.title || '章节编辑'}</small>
          </div>
        </header>

        {(error || message) && (
          <div className={error ? 'auth-error' : 'auth-message'} role={error ? 'alert' : 'status'}>
            {error || message}
          </div>
        )}

        {isNewChapter && (
          <CreateChapterPanel
            disabled={isSubmittingChapter || !token}
            novel={selectedNovel}
            volumes={selectedNovel.volumes ?? []}
            token={token}
            onSaveDraft={async (payload) => {
              if (!token) {
                return;
              }
              setIsSubmittingChapter(true);
              setError(undefined);
              setMessage(undefined);
              try {
                const chapter = await api.createAuthorChapter(token, selectedNovel.id, {
                  ...payload,
                  action: 'save',
                });
                await loadData(token);
                setSelectedChapterId(chapter.id);
                setMessage('章节草稿已保存');
                navigate(`/write/${selectedNovel.id}/${chapter.id}`, { replace: true });
              } catch (err) {
                setError(err instanceof Error ? err.message : '保存失败');
                throw err;
              } finally {
                setIsSubmittingChapter(false);
              }
            }}
            onSubmit={async (payload) => {
              if (!token) {
                return;
              }
              setIsSubmittingChapter(true);
              setError(undefined);
              setMessage(undefined);
              try {
                const chapter = await api.createAuthorChapter(token, selectedNovel.id, {
                  ...payload,
                  action: 'submit',
                });
                await loadData(token);
                setSelectedChapterId(chapter.id);
                setMessage('章节已提交审核');
                navigate(`/write/${selectedNovel.id}/${chapter.id}`, { replace: true });
              } catch (err) {
                setError(err instanceof Error ? err.message : '提交失败');
                throw err;
              } finally {
                setIsSubmittingChapter(false);
              }
            }}
          />
        )}

        {!isNewChapter && selectedChapter && (
          <>
            <EditChapterPanel
              chapter={selectedChapter}
              volumes={selectedNovel.volumes ?? []}
              token={token}
              disabled={isSubmittingChapterEdit || !token}
              onSaveDraft={async (chapterId, payload, saveSource) => {
                if (!token) {
                  return;
                }
                const updated = await api.updateAuthorChapter(token, chapterId, {
                  ...payload,
                  action: 'save',
                  saveSource,
                });
                setNovels((current) =>
                  current.map((novel) => ({
                    ...novel,
                    chapters: novel.chapters?.map((chapter) =>
                      chapter.id === chapterId ? { ...chapter, ...updated } : chapter,
                    ),
                  })),
                );
                await loadChapterVersions(token, chapterId);
              }}
              onSubmit={async (chapterId, payload) => {
                if (!token) {
                  return;
                }
                setIsSubmittingChapterEdit(true);
                setError(undefined);
                setMessage(undefined);
                try {
                  await api.updateAuthorChapter(token, chapterId, { ...payload, action: 'submit' });
                  setMessage('章节已提交审核');
                  await loadData(token);
                  await loadChapterVersions(token, chapterId);
                } catch (err) {
                  setError(err instanceof Error ? err.message : '提交失败');
                  throw err;
                } finally {
                  setIsSubmittingChapterEdit(false);
                }
              }}
              onUpdateSchedule={async (chapterId, scheduledAt) => {
                if (!token) {
                  return;
                }
                setIsSubmittingChapterEdit(true);
                setError(undefined);
                setMessage(undefined);
                try {
                  const updated = await api.updateAuthorChapterSchedule(
                    token,
                    chapterId,
                    scheduledAt,
                  );
                  await loadData(token);
                  setMessage(
                    updated.status === 'PUBLISHED' ? '章节已立即发布' : '定时发布时间已更新',
                  );
                } catch (err) {
                  setError(err instanceof Error ? err.message : '发布时间更新失败');
                  throw err;
                } finally {
                  setIsSubmittingChapterEdit(false);
                }
              }}
            />

            <details className="chapter-writing-history">
              <summary>
                <History size={16} aria-hidden />
                版本历史
              </summary>
              <ChapterVersionPanel
                chapter={selectedChapter}
                disabled={isSubmittingChapterEdit || !token}
                isLoading={isLoadingChapterVersions}
                versions={chapterVersions}
                onRestore={async (versionId) => {
                  if (!token) {
                    return;
                  }
                  setIsSubmittingChapterEdit(true);
                  try {
                    const restored = await api.restoreAuthorChapterVersion(
                      token,
                      selectedChapter.id,
                      versionId,
                    );
                    setNovels((current) =>
                      current.map((novel) => ({
                        ...novel,
                        chapters: novel.chapters?.map((chapter) =>
                          chapter.id === restored.id ? { ...chapter, ...restored } : chapter,
                        ),
                      })),
                    );
                    await loadChapterVersions(token, selectedChapter.id);
                    setMessage('历史版本已恢复');
                  } finally {
                    setIsSubmittingChapterEdit(false);
                  }
                }}
              />
            </details>
          </>
        )}

        {!isNewChapter && !selectedChapter && (
          <AuthorState title="没有找到这个章节">
            <button className="primary-link" type="button" onClick={() => navigate('/?view=works')}>
              返回作品管理
            </button>
          </AuthorState>
        )}
      </section>
    );
  }

  return (
    <section className="author-center-shell">
      <AuthorCenterSidebar
        activeView={workspaceView}
        isCreateNovelOpen={isCreateNovelOpen}
        expanded={expandedNav}
        onToggle={(menu) => setExpandedNav((current) => ({ ...current, [menu]: !current[menu] }))}
        onSelect={(view) => {
          setWorkspaceView(view);
          if (view !== 'works') {
            setIsCreateNovelOpen(false);
            setIsWorkDetailOpen(false);
          }
        }}
        onCreateNovel={() => {
          setWorkspaceView('works');
          setIsCreateNovelOpen(true);
          setIsWorkDetailOpen(false);
          setWorkView('novel');
        }}
      />

      <main className="author-page author-center-content">
        <header className="topbar author-center-heading">
          <div>
            <p className="eyebrow">阅界创作中心</p>
            <h1>{isCreateNovelOpen ? '创建作品' : authorWorkspaceLabels[workspaceView]}</h1>
          </div>
          <button
            className="ghost-button"
            type="button"
            onClick={() => token && loadData(token, dashboardDays)}
          >
            <RefreshCcw size={16} aria-hidden />
            刷新
          </button>
        </header>

        {(error || message) && (
          <div className={error ? 'auth-error' : 'auth-message'} role={error ? 'alert' : 'status'}>
            {error || message}
          </div>
        )}

        {workspaceView === 'profile' && (
          <AuthorProfilePanel
            disabled={isOnboardingLoading}
            profile={onboarding?.profile}
            fallbackPenName={user?.nickname ?? ''}
            onSave={saveAuthorProfile}
          />
        )}

        {workspaceView === 'appeals' && token && <ContentAppealsPanel token={token} />}

        {workspaceView === 'collection' && token && (
          <AuthorCollectionTaskPanel
            categories={categories}
            token={token}
            onImported={(result) =>
              setMessage(`《${result.title}》已导入阅读端，共 ${result.chapterCount} 章`)
            }
          />
        )}

        {(workspaceView === 'home' || workspaceView === 'dashboard') && (
          <AuthorDashboardPanel
            dashboard={dashboard}
            days={dashboardDays}
            isLoading={isLoading || isDashboardLoading}
            onChangeDays={(days) => {
              setDashboardDays(days);
              if (token) {
                void loadDashboard(token, days);
              }
            }}
            onSelectNovel={setSelectedNovelId}
            selectedNovelId={selectedNovelId}
          />
        )}

        {workspaceView === 'planning' && (
          <AuthorCalendarPanel
            calendar={calendar}
            disabled={isUpdatingCalendar || !token}
            isLoading={isLoading || isCalendarLoading}
            month={calendarMonth}
            novels={novels}
            selectedNovelId={selectedNovelId}
            onMonthChange={(month) => {
              setCalendarMonth(month);
              if (token) {
                void loadCalendar(token, month);
              }
            }}
            onCreate={async (novelId, payload) => {
              if (!token) {
                return;
              }
              setIsUpdatingCalendar(true);
              setError(undefined);
              setMessage(undefined);
              try {
                await api.createAuthorCalendarEvent(token, novelId, payload);
                await loadCalendar(token, calendarMonth);
                setMessage('创作计划已创建');
              } catch (err) {
                setError(err instanceof Error ? err.message : '创作计划创建失败');
                throw err;
              } finally {
                setIsUpdatingCalendar(false);
              }
            }}
            onUpdate={async (eventId, payload) => {
              if (!token) {
                return;
              }
              setIsUpdatingCalendar(true);
              setError(undefined);
              setMessage(undefined);
              try {
                await api.updateAuthorCalendarEvent(token, eventId, payload);
                await loadCalendar(token, calendarMonth);
                setMessage('创作计划已更新');
              } catch (err) {
                setError(err instanceof Error ? err.message : '创作计划更新失败');
                throw err;
              } finally {
                setIsUpdatingCalendar(false);
              }
            }}
            onDelete={async (eventId) => {
              if (!token) {
                return;
              }
              setIsUpdatingCalendar(true);
              setError(undefined);
              setMessage(undefined);
              try {
                await api.deleteAuthorCalendarEvent(token, eventId);
                await loadCalendar(token, calendarMonth);
                setMessage('创作计划已删除');
              } catch (err) {
                setError(err instanceof Error ? err.message : '创作计划删除失败');
                throw err;
              } finally {
                setIsUpdatingCalendar(false);
              }
            }}
          />
        )}

        {workspaceView === 'works' && (
          <section className="author-workspace-layout">
            <aside className="author-workspace-sidebar">
              {!isWorkDetailOpen && !isCreateNovelOpen ? (
                <>
                  <NovelListPanel
                    isLoading={isLoading}
                    novels={novels}
                    selectedNovelId={selectedNovelId}
                    onSelect={(novelId) => {
                      setSelectedNovelId(novelId);
                      setIsCreateNovelOpen(false);
                      setIsWorkDetailOpen(true);
                      setWorkView('novel');
                    }}
                    onOpenSettings={(novelId) => {
                      setSelectedNovelId(novelId);
                      setIsCreateNovelOpen(false);
                      setIsWorkDetailOpen(true);
                      setWorkView('novel');
                    }}
                    onOpenCatalog={(novelId) => {
                      setSelectedNovelId(novelId);
                      setIsCreateNovelOpen(false);
                      setIsWorkDetailOpen(true);
                      setWorkView('catalog');
                    }}
                    onCreateChapter={(novelId) => navigate(`/write/${novelId}/new`)}
                  />
                  <button
                    className="primary-link author-create-novel-button"
                    type="button"
                    onClick={() => {
                      setIsCreateNovelOpen(true);
                      setIsWorkDetailOpen(false);
                      setWorkView('novel');
                    }}
                  >
                    <BookPlus size={16} aria-hidden />
                    {'\u65b0\u5efa\u4f5c\u54c1'}
                  </button>
                </>
              ) : (
                <button
                  className="ghost-button author-back-to-works"
                  type="button"
                  onClick={() => {
                    setIsCreateNovelOpen(false);
                    setIsWorkDetailOpen(false);
                  }}
                >
                  <ChevronLeft size={16} aria-hidden />
                  返回作品列表
                </button>
              )}
            </aside>

            <div
              className={`author-workspace-main${
                isCreateNovelOpen || isWorkDetailOpen ? '' : ' hidden'
              }`}
            >
              {isCreateNovelOpen && (
                <CreateNovelPanel
                  categories={categories}
                  disabled={isSubmittingNovel || !token}
                  token={token}
                  onSaveDraft={async (payload) => {
                    if (!token) {
                      return;
                    }

                    setIsSubmittingNovel(true);
                    setError(undefined);
                    setMessage(undefined);
                    try {
                      const novel = await api.createAuthorNovel(token, {
                        ...payload,
                        action: 'save',
                      });
                      setMessage('作品草稿已保存');
                      await loadData(token);
                      setSelectedNovelId(novel.id);
                      setIsCreateNovelOpen(false);
                      setIsWorkDetailOpen(true);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : '保存失败');
                      throw err;
                    } finally {
                      setIsSubmittingNovel(false);
                    }
                  }}
                  onSubmit={async (payload) => {
                    if (!token) {
                      return;
                    }

                    setIsSubmittingNovel(true);
                    setError(undefined);
                    setMessage(undefined);
                    try {
                      const novel = await api.createAuthorNovel(token, {
                        ...payload,
                        action: 'submit',
                      });
                      setMessage('作品已提交审核');
                      await loadData(token);
                      setSelectedNovelId(novel.id);
                      setIsCreateNovelOpen(false);
                      setIsWorkDetailOpen(true);
                    } catch (err) {
                      setError(err instanceof Error ? err.message : '提交失败');
                      throw err;
                    } finally {
                      setIsSubmittingNovel(false);
                    }
                  }}
                />
              )}

              {!isCreateNovelOpen && selectedNovel && (
                <>
                  <section className="author-work-hero">
                    <div className="author-work-hero-main">
                      <NovelCover novel={selectedNovel} size="large" />
                      <div className="author-work-hero-copy">
                        <div className="author-work-hero-kicker">
                          <span>我的作品</span>
                          <span className="author-work-status" data-status={selectedNovel.status}>
                            {statusText(selectedNovel.status)}
                          </span>
                        </div>
                        <h2>{selectedNovel.title}</h2>
                        <p>{selectedNovel.summary || '还没有填写作品简介，完善档案让读者更快了解你的故事。'}</p>
                        <div className="author-work-hero-meta">
                          <span>{selectedNovel.category.name}</span>
                          <span>{formatDashboardNumber(selectedNovel.wordCount)} 字</span>
                          <span>{selectedNovel._count.chapters} 章</span>
                          <span>更新于 {formatAnnouncementTime(selectedNovel.updatedAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="author-work-hero-actions">
                      <button
                        className="primary-link"
                        type="button"
                        onClick={() => navigate(`/write/${selectedNovel.id}/new`)}
                      >
                        <FilePlus2 size={16} aria-hidden />
                        创建章节
                      </button>
                    </div>
                    <nav className="author-work-tabs" aria-label="作品管理工具">
                      {(['novel', 'catalog'] as AuthorWorkView[]).map((view) => (
                        <button
                          aria-current={workView === view ? 'page' : undefined}
                          className={workView === view ? 'active' : ''}
                          key={view}
                          type="button"
                          onClick={() => setWorkView(view)}
                        >
                          {authorWorkLabels[view]}
                          {view === 'catalog' && selectedNovel._count.chapters > 0 && (
                            <span>{selectedNovel._count.chapters}</span>
                          )}
                        </button>
                      ))}
                    </nav>
                  </section>
                </>
              )}

              {!isCreateNovelOpen && selectedNovel && workView === 'novel' && (
                <>
                  <EditNovelPanel
                    categories={categories}
                    disabled={isSubmittingEdit || isUpdatingNovelLifecycle || !token}
                    novel={selectedNovel}
                    token={token}
                    onSaveDraft={async (novelId, payload) => {
                      if (!token) {
                        return;
                      }

                      const updated = await api.updateAuthorNovel(token, novelId, {
                        ...payload,
                        action: 'save',
                      });
                      setNovels((current) =>
                        current.map((novel) =>
                          novel.id === novelId
                            ? { ...novel, ...updated, chapters: novel.chapters }
                            : novel,
                        ),
                      );
                    }}
                    onSubmit={async (novelId, payload) => {
                      if (!token) {
                        return;
                      }

                      setIsSubmittingEdit(true);
                      setError(undefined);
                      setMessage(undefined);
                      try {
                        const novel = await api.updateAuthorNovel(token, novelId, {
                          ...payload,
                          action: 'submit',
                        });
                        setMessage('作品已重新提交审核');
                        await loadData(token);
                        setSelectedNovelId(novel.id);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : '提交失败');
                        throw err;
                      } finally {
                        setIsSubmittingEdit(false);
                      }
                    }}
                    onDelete={async (novelId) => {
                      if (!token) {
                        return;
                      }

                      setIsUpdatingNovelLifecycle(true);
                      setError(undefined);
                      setMessage(undefined);
                      try {
                        await api.deleteAuthorNovel(token, novelId);
                        const remainingNovels = novels.filter((novel) => novel.id !== novelId);
                        setNovels(remainingNovels);
                        setSelectedNovelId(remainingNovels[0]?.id || '');
                        setIsWorkDetailOpen(false);
                        setMessage('作品已删除');
                        await loadDashboard(token, dashboardDays);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : '删除失败');
                        throw err;
                      } finally {
                        setIsUpdatingNovelLifecycle(false);
                      }
                    }}
                    onLifecycle={async (novelId, action) => {
                      if (!token) {
                        return;
                      }

                      setIsUpdatingNovelLifecycle(true);
                      setError(undefined);
                      setMessage(undefined);
                      try {
                        const updated = await api.updateAuthorNovelLifecycle(
                          token,
                          novelId,
                          action,
                        );
                        setNovels((current) =>
                          current.map((novel) =>
                            novel.id === novelId ? { ...novel, ...updated } : novel,
                          ),
                        );
                        setMessage(action === 'complete' ? '作品已设为完结' : '作品已恢复连载');
                        await loadDashboard(token, dashboardDays);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : '状态更新失败');
                        throw err;
                      } finally {
                        setIsUpdatingNovelLifecycle(false);
                      }
                    }}
                  />

                  <AnnouncementManagerPanel
                    disabled={isUpdatingAnnouncements || !token}
                    novel={selectedNovel}
                    onCreate={async (payload) => {
                      if (!token || !selectedNovel) {
                        return;
                      }
                      setIsUpdatingAnnouncements(true);
                      setError(undefined);
                      setMessage(undefined);
                      try {
                        await api.createAuthorAnnouncement(token, selectedNovel.id, payload);
                        await loadData(token);
                        setMessage(
                          payload.action === 'publish' ? '作品公告已发布' : '公告草稿已保存',
                        );
                      } catch (err) {
                        setError(err instanceof Error ? err.message : '公告保存失败');
                        throw err;
                      } finally {
                        setIsUpdatingAnnouncements(false);
                      }
                    }}
                    onUpdate={async (announcementId, payload) => {
                      if (!token) {
                        return;
                      }
                      setIsUpdatingAnnouncements(true);
                      setError(undefined);
                      setMessage(undefined);
                      try {
                        await api.updateAuthorAnnouncement(token, announcementId, payload);
                        await loadData(token);
                        setMessage(
                          payload.action === 'publish' ? '作品公告已发布' : '公告草稿已保存',
                        );
                      } catch (err) {
                        setError(err instanceof Error ? err.message : '公告更新失败');
                        throw err;
                      } finally {
                        setIsUpdatingAnnouncements(false);
                      }
                    }}
                    onDelete={async (announcementId) => {
                      if (!token) {
                        return;
                      }
                      setIsUpdatingAnnouncements(true);
                      setError(undefined);
                      setMessage(undefined);
                      try {
                        await api.deleteAuthorAnnouncement(token, announcementId);
                        await loadData(token);
                        setMessage('作品公告已删除');
                      } catch (err) {
                        setError(err instanceof Error ? err.message : '公告删除失败');
                        throw err;
                      } finally {
                        setIsUpdatingAnnouncements(false);
                      }
                    }}
                  />
                </>
              )}

              {!isCreateNovelOpen && selectedNovel && workView === 'catalog' && (
                <>
                  <CatalogOverview novel={selectedNovel} />
                  <div className="author-catalog-workbench">
                    <VolumeManagerPanel
                    disabled={isUpdatingVolumes || !token}
                    novel={selectedNovel}
                    onCreate={async (payload) => {
                      if (!token || !selectedNovel) {
                        return;
                      }
                      setIsUpdatingVolumes(true);
                      setError(undefined);
                      setMessage(undefined);
                      try {
                        await api.createAuthorVolume(token, selectedNovel.id, payload);
                        await loadData(token);
                        setMessage('分卷已创建');
                      } catch (err) {
                        setError(err instanceof Error ? err.message : '分卷创建失败');
                        throw err;
                      } finally {
                        setIsUpdatingVolumes(false);
                      }
                    }}
                    onUpdate={async (volumeId, payload) => {
                      if (!token) {
                        return;
                      }
                      setIsUpdatingVolumes(true);
                      setError(undefined);
                      setMessage(undefined);
                      try {
                        await api.updateAuthorVolume(token, volumeId, payload);
                        await loadData(token);
                        setMessage('分卷已更新');
                      } catch (err) {
                        setError(err instanceof Error ? err.message : '分卷更新失败');
                        throw err;
                      } finally {
                        setIsUpdatingVolumes(false);
                      }
                    }}
                    onDelete={async (volumeId) => {
                      if (!token) {
                        return;
                      }
                      setIsUpdatingVolumes(true);
                      setError(undefined);
                      setMessage(undefined);
                      try {
                        await api.deleteAuthorVolume(token, volumeId);
                        await loadData(token);
                        setMessage('分卷已删除');
                      } catch (err) {
                        setError(err instanceof Error ? err.message : '分卷删除失败');
                        throw err;
                      } finally {
                        setIsUpdatingVolumes(false);
                      }
                    }}
                    onReorder={async (volumeIds) => {
                      if (!token || !selectedNovel) {
                        return;
                      }
                      setIsUpdatingVolumes(true);
                      setError(undefined);
                      setMessage(undefined);
                      try {
                        await api.reorderAuthorVolumes(token, selectedNovel.id, volumeIds);
                        await loadData(token);
                        setMessage('分卷顺序已更新');
                      } catch (err) {
                        setError(err instanceof Error ? err.message : '分卷排序失败');
                        throw err;
                      } finally {
                        setIsUpdatingVolumes(false);
                      }
                    }}
                    />

                    <ChapterListPanel
                    chapters={selectedNovel?.chapters ?? []}
                    volumes={selectedNovel?.volumes ?? []}
                    disabled={isUpdatingChapters || !token}
                    selectedChapterId={selectedChapterId}
                    onSelect={(chapterId) => navigate(`/write/${selectedNovel.id}/${chapterId}`)}
                    onDelete={async (chapterIds) => {
                      if (!token || !selectedNovel) {
                        return;
                      }

                      setIsUpdatingChapters(true);
                      setError(undefined);
                      setMessage(undefined);
                      try {
                        const result = await api.deleteAuthorChapters(
                          token,
                          selectedNovel.id,
                          chapterIds,
                        );
                        setNovels((current) =>
                          current.map((novel) =>
                            novel.id === selectedNovel.id
                              ? {
                                  ...novel,
                                  chapters: result.chapters,
                                  _count: { ...novel._count, chapters: result.chapters.length },
                                }
                              : novel,
                          ),
                        );
                        setSelectedChapterId((current) =>
                          result.chapters.some((chapter) => chapter.id === current)
                            ? current
                            : result.chapters[0]?.id || '',
                        );
                        setMessage(`已将 ${result.deletedCount} 个章节移入回收站`);
                        await loadChapterTrash(token, selectedNovel.id);
                        await loadDashboard(token, dashboardDays);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : '删除失败');
                        throw err;
                      } finally {
                        setIsUpdatingChapters(false);
                      }
                    }}
                    onReorder={async (chapterIds) => {
                      if (!token || !selectedNovel) {
                        return;
                      }

                      setIsUpdatingChapters(true);
                      setError(undefined);
                      setMessage(undefined);
                      try {
                        const chapters = await api.reorderAuthorChapters(
                          token,
                          selectedNovel.id,
                          chapterIds,
                        );
                        setNovels((current) =>
                          current.map((novel) =>
                            novel.id === selectedNovel.id ? { ...novel, chapters } : novel,
                          ),
                        );
                        setMessage('章节顺序已更新');
                      } catch (err) {
                        setError(err instanceof Error ? err.message : '排序失败');
                        throw err;
                      } finally {
                        setIsUpdatingChapters(false);
                      }
                    }}
                    onAssignVolume={async (chapterId, volumeId) => {
                      if (!token) {
                        return;
                      }
                      setIsUpdatingChapters(true);
                      setError(undefined);
                      setMessage(undefined);
                      try {
                        await api.assignAuthorChapterVolume(token, chapterId, volumeId);
                        await loadData(token);
                        setMessage('章节分卷已更新');
                      } catch (err) {
                        setError(err instanceof Error ? err.message : '章节归卷失败');
                        throw err;
                      } finally {
                        setIsUpdatingChapters(false);
                      }
                    }}
                    />
                  </div>

                  <ChapterTrashPanel
                    chapters={deletedChapters}
                    disabled={isUpdatingChapters || !token}
                    isLoading={isLoadingChapterTrash}
                    onRestore={async (chapterId) => {
                      if (!token || !selectedNovel) {
                        return;
                      }
                      setIsUpdatingChapters(true);
                      setError(undefined);
                      setMessage(undefined);
                      try {
                        await api.restoreAuthorChapter(token, chapterId);
                        await loadData(token);
                        await loadChapterTrash(token, selectedNovel.id);
                        setSelectedChapterId(chapterId);
                        setMessage('章节已从回收站恢复，并追加到章节列表末尾');
                      } catch (err) {
                        setError(err instanceof Error ? err.message : '章节恢复失败');
                        throw err;
                      } finally {
                        setIsUpdatingChapters(false);
                      }
                    }}
                    onPermanentDelete={async (chapterId) => {
                      if (!token || !selectedNovel) {
                        return;
                      }
                      setIsUpdatingChapters(true);
                      setError(undefined);
                      setMessage(undefined);
                      try {
                        await api.permanentlyDeleteAuthorChapter(token, chapterId);
                        await loadChapterTrash(token, selectedNovel.id);
                        setMessage('章节已永久删除');
                      } catch (err) {
                        setError(err instanceof Error ? err.message : '永久删除失败');
                        throw err;
                      } finally {
                        setIsUpdatingChapters(false);
                      }
                    }}
                  />
                </>
              )}

              {!isCreateNovelOpen && !selectedNovel && !isLoading && (
                <div className="author-workspace-empty">
                  <h2>{'\u4ece\u65b0\u5efa\u4f5c\u54c1\u5f00\u59cb'}</h2>
                  <p>
                    {
                      '\u9009\u62e9\u5de6\u4fa7\u5df2\u6709\u4f5c\u54c1\uff0c\u6216\u521b\u5efa\u4e00\u90e8\u65b0\u4f5c\u54c1\u3002'
                    }
                  </p>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </section>
  );
}

function AuthorCenterSidebar({
  activeView,
  isCreateNovelOpen,
  expanded,
  onToggle,
  onSelect,
  onCreateNovel,
}: {
  activeView: AuthorWorkspaceView;
  isCreateNovelOpen: boolean;
  expanded: { works: boolean; data: boolean };
  onToggle(menu: 'works' | 'data'): void;
  onSelect(view: AuthorWorkspaceView): void;
  onCreateNovel(): void;
}) {
  return (
    <aside className="author-center-sidebar">
      <nav className="author-center-nav" aria-label="作者中心导航">
        <button
          className={`author-nav-primary${activeView === 'home' ? ' active' : ''}`}
          type="button"
          onClick={() => onSelect('home')}
        >
          <BookOpen size={18} aria-hidden />
          <span>工作台</span>
        </button>

        <div className="author-nav-group">
          <button
            className="author-nav-primary"
            type="button"
            aria-expanded={expanded.works}
            onClick={() => onToggle('works')}
          >
            <Layers3 size={18} aria-hidden />
            <span>作品管理</span>
            <ChevronRight className={expanded.works ? 'expanded' : ''} size={16} aria-hidden />
          </button>
          {expanded.works && (
            <div className="author-nav-children">
              <button
                className={activeView === 'works' && !isCreateNovelOpen ? 'active' : ''}
                type="button"
                onClick={() => onSelect('works')}
              >
                小说作品
              </button>
              <button
                className={isCreateNovelOpen ? 'active' : ''}
                type="button"
                onClick={onCreateNovel}
              >
                创建作品
              </button>
              <button
                className={activeView === 'collection' ? 'active' : ''}
                type="button"
                onClick={() => onSelect('collection')}
              >
                采集任务
              </button>
            </div>
          )}
        </div>

        <div className="author-nav-group">
          <button
            className="author-nav-primary"
            type="button"
            aria-expanded={expanded.data}
            onClick={() => onToggle('data')}
          >
            <BarChart3 size={18} aria-hidden />
            <span>数据中心</span>
            <ChevronRight className={expanded.data ? 'expanded' : ''} size={16} aria-hidden />
          </button>
          {expanded.data && (
            <div className="author-nav-children">
              <button
                className={activeView === 'dashboard' ? 'active' : ''}
                type="button"
                onClick={() => onSelect('dashboard')}
              >
                数据概览
              </button>
              <button
                className={activeView === 'appeals' ? 'active' : ''}
                type="button"
                onClick={() => onSelect('appeals')}
              >
                内容申诉
              </button>
            </div>
          )}
        </div>

        <button
          className={`author-nav-primary${activeView === 'planning' ? ' active' : ''}`}
          type="button"
          onClick={() => onSelect('planning')}
        >
          <CalendarDays size={18} aria-hidden />
          <span>创作计划</span>
        </button>
        <button
          className={`author-nav-primary${activeView === 'profile' ? ' active' : ''}`}
          type="button"
          onClick={() => onSelect('profile')}
        >
          <BadgeCheck size={18} aria-hidden />
          <span>作者资料</span>
        </button>
      </nav>
    </aside>
  );
}

type CollectionSourceType = 'wikisource' | 'json' | 'html';

type CollectionMapping = {
  titlePath: string;
  summaryPath: string;
  chaptersPath: string;
  chapterTitlePath: string;
  chapterContentPath: string;
  chapterUrlPath: string;
  chapterIdPath: string;
  titleSelector: string;
  summarySelector: string;
  chapterLinkSelector: string;
  chapterContentSelector: string;
};

function jsonItemPath(path: string) {
  const marker = path.indexOf('[0]');
  if (marker < 0) return path;
  return path.slice(marker + 3).replace(/^\./u, '');
}

function CollectionMappingField({
  id,
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options?: string[];
  placeholder?: string;
  onChange(value: string): void;
}) {
  const listId = `${id}-options`;
  return (
    <label>
      {label}
      <input
        list={options?.length ? listId : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {options && options.length > 0 && (
        <datalist id={listId}>
          {options.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      )}
    </label>
  );
}

function AuthorCollectionTaskPanel({
  categories,
  token,
  onImported,
}: {
  categories: Category[];
  token: string;
  onImported(result: AuthorCollectionTaskResult): void;
}) {
  const [sourceType, setSourceType] = useState<CollectionSourceType>('wikisource');
  const [title, setTitle] = useState('');
  const [sourceAuthor, setSourceAuthor] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [maxChapters, setMaxChapters] = useState(20);
  const [startChapter, setStartChapter] = useState(1);
  const [endChapter, setEndChapter] = useState<number | ''>('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [analysis, setAnalysis] = useState<AuthorCollectionHtmlAnalysis | AuthorCollectionJsonAnalysis>();
  const [mapping, setMapping] = useState<CollectionMapping>({
    titlePath: '',
    summaryPath: '',
    chaptersPath: '',
    chapterTitlePath: '',
    chapterContentPath: '',
    chapterUrlPath: '',
    chapterIdPath: '',
    titleSelector: '#info h1',
    summarySelector: '#intro',
    chapterLinkSelector: 'a[rel="chapter"]',
    chapterContentSelector: '#booktxt',
  });
  const [preview, setPreview] = useState<AuthorCollectionTaskPreview>();
  const [result, setResult] = useState<AuthorCollectionTaskResult>();
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [localError, setLocalError] = useState<string>();

  const htmlAnalysis = sourceType === 'html' && analysis
    ? (analysis as AuthorCollectionHtmlAnalysis)
    : undefined;
  const jsonAnalysis = sourceType === 'json' && analysis
    ? (analysis as AuthorCollectionJsonAnalysis)
    : undefined;

  useEffect(() => {
    setCategoryId((current) => current || categories[0]?.id || '');
  }, [categories]);

  function changeSourceType(next: CollectionSourceType) {
    setSourceType(next);
    setAnalysis(undefined);
    setLocalError(undefined);
    setPreview(undefined);
  }

  async function analyzeSource() {
    const url = sourceUrl.trim();
    if (!url) {
      setLocalError('请先输入要分析的来源网址。');
      return;
    }
    setIsAnalyzing(true);
    setLocalError(undefined);
    try {
      if (sourceType === 'html') {
        const analyzed = await api.analyzeHtmlCollectionSource(token, url);
        setAnalysis(analyzed);
        setMapping((current) => ({
          ...current,
          titleSelector: analyzed.candidates.titleSelectors[0] ?? current.titleSelector,
          summarySelector: analyzed.candidates.summarySelectors[0] ?? current.summarySelector,
          chapterLinkSelector: analyzed.candidates.chapterLinkSelectors[0] ?? current.chapterLinkSelector,
          chapterContentSelector: analyzed.candidates.contentSelectors[0] ?? current.chapterContentSelector,
        }));
      } else {
        const analyzed = await api.analyzeJsonCollectionSource(token, url);
        setAnalysis(analyzed);
        setMapping((current) => ({
          ...current,
          titlePath: analyzed.candidates.titlePaths[0] ?? current.titlePath,
          summaryPath: analyzed.candidates.summaryPaths[0] ?? current.summaryPath,
          chaptersPath: analyzed.candidates.chapterArrayPaths[0] ?? current.chaptersPath,
          chapterTitlePath: jsonItemPath(analyzed.candidates.titlePaths.find((path) => path.includes('[0]')) ?? current.chapterTitlePath),
          chapterContentPath: jsonItemPath(analyzed.candidates.contentPaths.find((path) => path.includes('[0]')) ?? current.chapterContentPath),
          chapterUrlPath: jsonItemPath(analyzed.candidates.urlPaths.find((path) => path.includes('[0]')) ?? current.chapterUrlPath),
        }));
      }
    } catch (error) {
      setAnalysis(undefined);
      setLocalError(error instanceof Error ? error.message : '页面结构分析失败');
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function createPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rightsConfirmed) {
      setLocalError('请先确认作品属于公版内容，或你已经获得明确导入授权。');
      return;
    }
    if (sourceType !== 'wikisource' && !sourceUrl.trim()) {
      setLocalError('请输入来源网址，并先完成页面结构分析。');
      return;
    }
    if (sourceType === 'json' && (!mapping.titlePath || !mapping.chaptersPath || !mapping.chapterTitlePath || !mapping.chapterContentPath)) {
      setLocalError('JSON 采集还缺少必要字段映射，请先分析接口并补全标题、章节数组、章节标题和正文路径。');
      return;
    }
    if (endChapter !== '' && endChapter < startChapter) {
      setLocalError('结束章节不能小于起始章节。');
      return;
    }

    setIsPreviewing(true);
    setLocalError(undefined);
    setPreview(undefined);
    setResult(undefined);
    try {
      const task = await api.previewAuthorCollectionTask(token, {
        sourceType,
        title: title.trim(),
        categoryId,
        sourceUrl: sourceType === 'wikisource' ? undefined : sourceUrl.trim(),
        sourceAuthor: sourceAuthor.trim() || undefined,
        ...(sourceType === 'json'
          ? {
              titlePath: mapping.titlePath,
              summaryPath: mapping.summaryPath || undefined,
              chaptersPath: mapping.chaptersPath,
              chapterTitlePath: mapping.chapterTitlePath,
              chapterContentPath: mapping.chapterContentPath,
              chapterUrlPath: mapping.chapterUrlPath || undefined,
              chapterIdPath: mapping.chapterIdPath || undefined,
            }
          : sourceType === 'html'
            ? {
                titleSelector: mapping.titleSelector || undefined,
                summarySelector: mapping.summarySelector || undefined,
                chapterLinkSelector: mapping.chapterLinkSelector || undefined,
                chapterContentSelector: mapping.chapterContentSelector || undefined,
              }
            : {}),
        maxChapters,
        startChapter,
        endChapter: endChapter === '' ? undefined : endChapter,
        rightsConfirmed: true,
      });
      setPreview(task);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '采集任务创建失败');
    } finally {
      setIsPreviewing(false);
    }
  }

  async function commitTask() {
    if (!preview || !rightsConfirmed) return;
    setIsCommitting(true);
    setLocalError(undefined);
    try {
      const imported = await api.commitAuthorCollectionTask(token, preview.taskId);
      setResult(imported);
      setPreview(undefined);
      onImported(imported);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '采集内容导入失败');
    } finally {
      setIsCommitting(false);
    }
  }

  function resetTask() {
    setSourceType('wikisource');
    setTitle('');
    setSourceAuthor('');
    setSourceUrl('');
    setMaxChapters(20);
    setStartChapter(1);
    setEndChapter('');
    setRightsConfirmed(false);
    setAnalysis(undefined);
    setMapping({
      titlePath: '',
      summaryPath: '',
      chaptersPath: '',
      chapterTitlePath: '',
      chapterContentPath: '',
      chapterUrlPath: '',
      chapterIdPath: '',
      titleSelector: '#info h1',
      summarySelector: '#intro',
      chapterLinkSelector: 'a[rel="chapter"]',
      chapterContentSelector: '#booktxt',
    });
    setPreview(undefined);
    setResult(undefined);
    setLocalError(undefined);
  }

  return (
    <section className="collection-task-page">
      <form className="panel author-form collection-task-form" onSubmit={createPreview}>
        <div className="section-title">
          <div>
            <p className="eyebrow">采集任务</p>
            <h2>创建采集任务</h2>
          </div>
          <Globe2 size={20} aria-hidden />
        </div>
        <p className="collection-task-intro">
          先选择来源类型。对于 HTML 页面或 JSON 接口，输入网址后点击“分析页面”，系统会给出可用的字段/选择器，你可以手动校正后再生成章节预览。
        </p>
        <label>
          采集来源
          <select value={sourceType} onChange={(event) => changeSourceType(event.target.value as CollectionSourceType)}>
            <option value="wikisource">中文维基文库（公版）</option>
            <option value="html">HTML 页面（需确认授权）</option>
            <option value="json">JSON 接口（需确认授权）</option>
          </select>
        </label>
        {sourceType !== 'wikisource' && (
          <div className="collection-source-url-row">
            <label>
              来源网址
              <input
                required
                type="url"
                placeholder={sourceType === 'html' ? '例如：https://example.com/book/list.html' : '例如：https://example.com/api/book/1'}
                value={sourceUrl}
                onChange={(event) => {
                  setSourceUrl(event.target.value);
                  setAnalysis(undefined);
                }}
              />
            </label>
            <button className="ghost-button collection-analyze-button" type="button" onClick={analyzeSource} disabled={isAnalyzing}>
              <RefreshCcw className={isAnalyzing ? 'is-spinning' : ''} size={15} aria-hidden />
              {isAnalyzing ? '分析中...' : '分析页面'}
            </button>
          </div>
        )}
        <div className="collection-task-fields">
          <label>
            目标书名
            <input
              required
              maxLength={120}
              placeholder={sourceType === 'html' ? '分类页请填写要采集的作品名' : '例如：红楼梦'}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            原作者
            <input
              maxLength={80}
              placeholder="例如：曹雪芹"
              value={sourceAuthor}
              onChange={(event) => setSourceAuthor(event.target.value)}
            />
          </label>
          <label>
            阅读端分类
            <select
              required
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            起始章节
            <input
              required
              type="number"
              min={1}
              max={1000000}
              value={startChapter}
              onChange={(event) => setStartChapter(Math.max(1, Number(event.target.value) || 1))}
            />
          </label>
          <label>
            结束章节（可选）
            <input
              type="number"
              min={startChapter}
              max={1000000}
              placeholder={`默认采集 ${startChapter}-${startChapter + maxChapters - 1} 章`}
              value={endChapter}
              onChange={(event) => setEndChapter(event.target.value ? Math.max(startChapter, Number(event.target.value)) : '')}
            />
          </label>
          <label>
            未填写结束章节时，最多采集
            <input
              required
              type="number"
              min={1}
              max={50}
              value={maxChapters}
              onChange={(event) => setMaxChapters(Number(event.target.value))}
            />
          </label>
        </div>
        {htmlAnalysis && (
          <div className="collection-analysis" role="status">
            <div className="collection-analysis-heading">
              <div>
                <strong>HTML 结构分析完成</strong>
                <span>页面标题：{htmlAnalysis.title || '未识别'} · 链接 {htmlAnalysis.counts.links} 个 · 疑似章节链接 {htmlAnalysis.counts.chapterLinks} 个</span>
              </div>
              <small>可直接使用候选值，也可以手动输入选择器</small>
            </div>
            <div className="collection-analysis-grid">
              <CollectionMappingField id="html-title" label="书名选择器" value={mapping.titleSelector} options={htmlAnalysis.candidates.titleSelectors} placeholder="#info h1" onChange={(value) => setMapping((current) => ({ ...current, titleSelector: value }))} />
              <CollectionMappingField id="html-summary" label="简介选择器" value={mapping.summarySelector} options={htmlAnalysis.candidates.summarySelectors} placeholder="#intro" onChange={(value) => setMapping((current) => ({ ...current, summarySelector: value }))} />
              <CollectionMappingField id="html-links" label="章节链接选择器" value={mapping.chapterLinkSelector} options={htmlAnalysis.candidates.chapterLinkSelectors} placeholder={'a[rel="chapter"]'} onChange={(value) => setMapping((current) => ({ ...current, chapterLinkSelector: value }))} />
              <CollectionMappingField id="html-content" label="章节正文选择器" value={mapping.chapterContentSelector} options={htmlAnalysis.candidates.contentSelectors} placeholder="#booktxt" onChange={(value) => setMapping((current) => ({ ...current, chapterContentSelector: value }))} />
            </div>
          </div>
        )}
        {jsonAnalysis && (
          <div className="collection-analysis" role="status">
            <div className="collection-analysis-heading">
              <div>
                <strong>JSON 结构分析完成</strong>
                <span>根节点类型：{jsonAnalysis.rootType} · 字段 {jsonAnalysis.fields.length} 个 · 数组 {jsonAnalysis.arrays.length} 个</span>
              </div>
              <small>章节字段路径相对于章节数组中的单条记录</small>
            </div>
            <div className="collection-analysis-grid">
              <CollectionMappingField id="json-title" label="书名路径" value={mapping.titlePath} options={jsonAnalysis.candidates.titlePaths} placeholder="$.title" onChange={(value) => setMapping((current) => ({ ...current, titlePath: value }))} />
              <CollectionMappingField id="json-summary" label="简介路径（可选）" value={mapping.summaryPath} options={jsonAnalysis.candidates.summaryPaths} placeholder="$.summary" onChange={(value) => setMapping((current) => ({ ...current, summaryPath: value }))} />
              <CollectionMappingField id="json-chapters" label="章节数组路径" value={mapping.chaptersPath} options={jsonAnalysis.candidates.chapterArrayPaths} placeholder="$.chapters" onChange={(value) => setMapping((current) => ({ ...current, chaptersPath: value }))} />
              <CollectionMappingField id="json-chapter-title" label="章节标题路径" value={mapping.chapterTitlePath} options={jsonAnalysis.candidates.titlePaths.filter((path: string) => path.includes('[0]')).map(jsonItemPath)} placeholder="title" onChange={(value) => setMapping((current) => ({ ...current, chapterTitlePath: value }))} />
              <CollectionMappingField id="json-content" label="章节正文路径" value={mapping.chapterContentPath} options={jsonAnalysis.candidates.contentPaths.filter((path: string) => path.includes('[0]')).map(jsonItemPath)} placeholder="content" onChange={(value) => setMapping((current) => ({ ...current, chapterContentPath: value }))} />
              <CollectionMappingField id="json-url" label="章节链接路径（可选）" value={mapping.chapterUrlPath} options={jsonAnalysis.candidates.urlPaths.filter((path: string) => path.includes('[0]')).map(jsonItemPath)} placeholder="url" onChange={(value) => setMapping((current) => ({ ...current, chapterUrlPath: value }))} />
              <CollectionMappingField id="json-id" label="章节 ID 路径（可选）" value={mapping.chapterIdPath} placeholder="id" onChange={(value) => setMapping((current) => ({ ...current, chapterIdPath: value }))} />
            </div>
          </div>
        )}
        <label className="collection-rights-confirmation">
          <input
            type="checkbox"
            checked={rightsConfirmed}
            onChange={(event) => setRightsConfirmed(event.target.checked)}
          />
          <span>
            我确认该作品属于公版内容，或我已经取得可在本平台复制、发布的明确授权。
          </span>
        </label>
        <p className="collection-task-guardrail">
          仅支持白名单域名；不会绕过登录、付费墙、验证码或网站反爬措施。请只导入公版或你拥有明确授权的内容。
        </p>
        {localError && (
          <p className="auth-error" role="alert">
            {localError}
          </p>
        )}
        <button
          className="primary-link"
          type="submit"
          disabled={isPreviewing || isCommitting || !categoryId}
        >
          <RefreshCcw className={isPreviewing ? 'is-spinning' : ''} size={16} aria-hidden />
          {isPreviewing ? '正在联网采集...' : '采集并生成预览'}
        </button>
      </form>

      {preview && (
        <section className="panel collection-task-preview">
          <div className="collection-preview-heading">
            <div className="collection-preview-book">
              <NovelCover novel={{ title: preview.title, coverUrl: preview.coverUrl }} size="mini" />
              <div>
                <p className="eyebrow">待确认任务</p>
                <h2>{preview.title}</h2>
                <p>
                  {preview.sourceAuthor ? `原作者：${preview.sourceAuthor} · ` : ''}
                  分类：{preview.category.name}
                </p>
              </div>
            </div>
            <span className={preview.isComplete ? 'complete' : 'partial'}>
              {preview.isComplete ? '完整目录' : '部分章节'}
            </span>
          </div>
          <div className="collection-preview-stats">
            <span>
              <strong>{preview.chapterCount}</strong> 本次章节
            </span>
            <span>
              <strong>{preview.wordCount.toLocaleString('zh-CN')}</strong> 字
            </span>
            <span>
              来源发现 <strong>{preview.discoveredChapterCount}</strong> 个页面
            </span>
          </div>
          <p className="collection-preview-summary">{preview.summary}</p>
          <div className="collection-source-line">
            <a href={preview.sourceUrl} target="_blank" rel="noreferrer">
              查看 {preview.sourceName} 来源页
            </a>
            <span>{preview.sourceLicense}</span>
            <small>预览有效至 {new Date(preview.expiresAt).toLocaleTimeString('zh-CN')}</small>
          </div>
          <ol className="collection-chapter-list">
            {preview.chapters.map((chapter, index) => (
              <li key={chapter.externalId}>
                <span>{chapter.orderIndex ?? index + 1}</span>
                <a href={chapter.sourceUrl} target="_blank" rel="noreferrer">
                  {chapter.title}
                </a>
                <small>{chapter.wordCount.toLocaleString('zh-CN')} 字</small>
              </li>
            ))}
          </ol>
          <div className="collection-preview-actions">
            <button className="ghost-button" type="button" onClick={() => setPreview(undefined)}>
              返回修改
            </button>
            <button
              className="primary-link"
              type="button"
              disabled={isCommitting}
              onClick={commitTask}
            >
              <BookCheck size={16} aria-hidden />
              {isCommitting ? '正在写入阅读端...' : '确认导入阅读端'}
            </button>
          </div>
        </section>
      )}

      {result && (
        <section className="panel collection-task-success" role="status">
          <CircleCheckBig size={30} aria-hidden />
          <div>
            <p className="eyebrow">采集任务完成</p>
            <h2>《{result.title}》已进入阅读端</h2>
            <p>
              共导入 {result.chapterCount} 章、{result.wordCount.toLocaleString('zh-CN')} 字，来源为
              {result.sourceName}。
            </p>
            <div className="collection-preview-actions">
              <a
                className="primary-link"
                href={`${readerPortalUrl}/novels/${result.novelId}`}
                target="_blank"
                rel="noreferrer"
              >
                查看阅读端作品
              </a>
              <button className="ghost-button" type="button" onClick={resetTask}>
                创建新的采集任务
              </button>
            </div>
          </div>
        </section>
      )}
    </section>
  );
}

function AuthorDashboardPanel({
  dashboard,
  days,
  isLoading,
  selectedNovelId,
  onChangeDays,
  onSelectNovel,
}: {
  dashboard?: AuthorDashboard;
  days: number;
  isLoading: boolean;
  selectedNovelId: string;
  onChangeDays(days: number): void;
  onSelectNovel(novelId: string): void;
}) {
  const [trendMetric, setTrendMetric] = useState<DashboardTrendMetric>('bookshelfAdds');
  const trendOptions: Array<{ key: DashboardTrendMetric; label: string }> = [
    { key: 'bookshelfAdds', label: '新增收藏' },
    { key: 'comments', label: '新增评论' },
    { key: 'publishedWords', label: '发布字数' },
  ];
  const trendValues = dashboard?.trend.map((item) => item[trendMetric]) ?? [];
  const trendMax = Math.max(0, ...trendValues);
  const trendLabel = trendOptions.find((option) => option.key === trendMetric)?.label ?? '';
  const statusBreakdown = dashboard?.statusBreakdown.filter((item) => item.count > 0) ?? [];

  return (
    <section className="author-dashboard" aria-busy={isLoading}>
      <div className="author-dashboard-header">
        <div>
          <p className="eyebrow">创作数据</p>
          <h2>数据概览</h2>
        </div>
        <div className="segmented-control author-dashboard-period" aria-label="统计周期">
          {[7, 14, 30].map((period) => (
            <button
              className={days === period ? 'active' : ''}
              key={period}
              type="button"
              onClick={() => onChangeDays(period)}
            >
              {period} 天
            </button>
          ))}
        </div>
      </div>

      {!dashboard && <p className="state-line">{isLoading ? '数据加载中...' : '暂无统计数据'}</p>}
      {dashboard && (
        <>
          <div className="author-dashboard-metrics">
            <article>
              <BookOpen size={20} aria-hidden />
              <span>
                <small>作品</small>
                <strong>{formatDashboardNumber(dashboard.overview.novels)}</strong>
              </span>
            </article>
            <article>
              <FileText size={20} aria-hidden />
              <span>
                <small>已发布 / 总章节</small>
                <strong>
                  {formatDashboardNumber(dashboard.overview.publishedChapters)} /{' '}
                  {formatDashboardNumber(dashboard.overview.chapters)}
                </strong>
              </span>
            </article>
            <article>
              <BarChart3 size={20} aria-hidden />
              <span>
                <small>发布字数</small>
                <strong title={dashboard.overview.publishedWords.toLocaleString('zh-CN')}>
                  {formatDashboardNumber(dashboard.overview.publishedWords)}
                </strong>
              </span>
            </article>
            <article>
              <Bookmark size={20} aria-hidden />
              <span>
                <small>当前收藏</small>
                <strong>{formatDashboardNumber(dashboard.overview.bookshelf)}</strong>
              </span>
            </article>
            <article>
              <MessageCircle size={20} aria-hidden />
              <span>
                <small>评论</small>
                <strong>{formatDashboardNumber(dashboard.overview.comments)}</strong>
              </span>
            </article>
          </div>

          <div className="author-dashboard-statuses" aria-label="作品状态分布">
            {statusBreakdown.map((item) => (
              <span key={item.status}>
                {statusText(item.status)} <strong>{item.count}</strong>
              </span>
            ))}
          </div>

          <div className="author-dashboard-content">
            <section className="author-trend-section">
              <div className="section-title">
                <h3>{days} 天趋势</h3>
                <div className="segmented-control author-trend-modes" aria-label="趋势指标">
                  {trendOptions.map((option) => (
                    <button
                      className={trendMetric === option.key ? 'active' : ''}
                      key={option.key}
                      type="button"
                      onClick={() => setTrendMetric(option.key)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div
                className="author-trend-chart"
                role="img"
                aria-label={`${days} 天${trendLabel}趋势`}
                style={{ gridTemplateColumns: `repeat(${dashboard.trend.length}, minmax(0, 1fr))` }}
              >
                {dashboard.trend.map((item, index) => {
                  const value = item[trendMetric];
                  const height =
                    trendMax > 0 && value > 0 ? Math.max(5, (value / trendMax) * 100) : 0;
                  const labelStep = dashboard.trend.length > 14 ? 5 : 2;
                  const showLabel = index % labelStep === 0 || index === dashboard.trend.length - 1;
                  return (
                    <div
                      className="author-trend-column"
                      key={item.date}
                      title={`${item.date} ${trendLabel}：${value.toLocaleString('zh-CN')}`}
                    >
                      <div className="author-trend-track">
                        <span style={{ height: `${height}%` }} />
                      </div>
                      <small>{showLabel ? item.date.slice(5) : ''}</small>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="author-performance-section">
              <div className="section-title">
                <h3>作品表现</h3>
                <span className="muted">{dashboard.novels.length} 本</span>
              </div>
              {dashboard.novels.length === 0 && <p className="state-line">暂无作品数据</p>}
              {dashboard.novels.length > 0 && (
                <div className="author-performance-table">
                  <div className="author-performance-head" aria-hidden>
                    <span>作品</span>
                    <span>章节</span>
                    <span>字数</span>
                    <span>收藏</span>
                    <span>评论</span>
                  </div>
                  {dashboard.novels.map((novel) => (
                    <button
                      className={`author-performance-row${selectedNovelId === novel.id ? ' active' : ''}`}
                      key={novel.id}
                      type="button"
                      onClick={() => onSelectNovel(novel.id)}
                    >
                      <span className="author-performance-title">
                        <strong>{novel.title}</strong>
                        <small>{statusText(novel.status)}</small>
                      </span>
                      <span data-label="章节">
                        {novel.publishedChapters}/{novel.chapters}
                      </span>
                      <span data-label="字数">{formatDashboardNumber(novel.publishedWords)}</span>
                      <span data-label="收藏">{formatDashboardNumber(novel.bookshelf)}</span>
                      <span data-label="评论">{formatDashboardNumber(novel.comments)}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  );
}

function AuthorCalendarPanel({
  calendar,
  month,
  novels,
  selectedNovelId,
  disabled,
  isLoading,
  onMonthChange,
  onCreate,
  onUpdate,
  onDelete,
}: {
  calendar?: AuthorCalendar;
  month: string;
  novels: AuthorNovel[];
  selectedNovelId: string;
  disabled: boolean;
  isLoading: boolean;
  onMonthChange(month: string): void;
  onCreate(novelId: string, payload: CalendarPlanPayload): Promise<void>;
  onUpdate(
    eventId: string,
    payload: Partial<CalendarPlanPayload> & { isCompleted?: boolean },
  ): Promise<void>;
  onDelete(eventId: string): Promise<void>;
}) {
  const [editingId, setEditingId] = useState('');
  const [novelId, setNovelId] = useState(selectedNovelId);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [eventAt, setEventAt] = useState(defaultCalendarDateTime(month));
  const [type, setType] = useState<CalendarPlanPayload['type']>('WRITING');
  const [isCompleted, setIsCompleted] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const [pendingDeleteId, setPendingDeleteId] = useState('');
  const calendarCells = useMemo(() => buildCalendarCells(month), [month]);
  const eventsByDate = useMemo(() => {
    const result = new Map<string, AuthorCalendarEvent[]>();
    (calendar?.events ?? []).forEach((event) => {
      const key = localDateKey(event.eventAt);
      const current = result.get(key) ?? [];
      current.push(event);
      result.set(key, current);
    });
    return result;
  }, [calendar]);

  useEffect(() => {
    if (editingId) {
      return;
    }
    const nextNovelId = novels.some((novel) => novel.id === selectedNovelId)
      ? selectedNovelId
      : (novels[0]?.id ?? '');
    setNovelId(nextNovelId);
  }, [editingId, novels, selectedNovelId]);

  useEffect(() => {
    if (!editingId) {
      setEventAt(defaultCalendarDateTime(month));
    }
  }, [editingId, month]);

  function resetEditor() {
    setEditingId('');
    setNovelId(
      novels.some((novel) => novel.id === selectedNovelId)
        ? selectedNovelId
        : (novels[0]?.id ?? ''),
    );
    setTitle('');
    setNote('');
    setEventAt(defaultCalendarDateTime(month));
    setType('WRITING');
    setIsCompleted(false);
    setLocalError(undefined);
    setPendingDeleteId('');
  }

  function editEvent(event: AuthorCalendarEvent) {
    if (event.source !== 'PLAN') {
      return;
    }
    setEditingId(event.id);
    setNovelId(event.novel.id);
    setTitle(event.title);
    setNote(event.note ?? '');
    setEventAt(toDateTimeLocal(event.eventAt));
    setType(event.type === 'CHAPTER' ? 'WRITING' : event.type);
    setIsCompleted(event.isCompleted);
    setLocalError(undefined);
    setPendingDeleteId('');
  }

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!novelId) {
      setLocalError('请选择作品');
      return;
    }
    if (nextTitle.length < 2) {
      setLocalError('计划标题至少需要 2 个字');
      return;
    }
    if (!eventAt || Number.isNaN(new Date(eventAt).getTime())) {
      setLocalError('请选择有效时间');
      return;
    }

    const payload: CalendarPlanPayload = {
      title: nextTitle,
      note: note.trim() || undefined,
      eventAt: new Date(eventAt).toISOString(),
      type,
    };
    setLocalError(undefined);
    try {
      if (editingId) {
        await onUpdate(editingId, { ...payload, isCompleted });
      } else {
        await onCreate(novelId, payload);
      }
      resetEditor();
    } catch {
      // The page-level error keeps the plan available for retry.
    }
  }

  async function toggleCompleted(event: AuthorCalendarEvent) {
    try {
      await onUpdate(event.id, { isCompleted: !event.isCompleted });
      if (editingId === event.id) {
        setIsCompleted(!event.isCompleted);
      }
    } catch {
      // The parent page displays the API error.
    }
  }

  async function deleteEvent(eventId: string) {
    if (pendingDeleteId !== eventId) {
      setPendingDeleteId(eventId);
      return;
    }
    try {
      await onDelete(eventId);
      if (editingId === eventId) {
        resetEditor();
      } else {
        setPendingDeleteId('');
      }
    } catch {
      // The parent page displays the API error.
    }
  }

  return (
    <section className="panel author-calendar-panel">
      <div className="section-title author-calendar-title">
        <div>
          <h2>创作日历</h2>
          <span className="muted">{formatCalendarMonth(month)}</span>
        </div>
        <CalendarDays size={19} aria-hidden />
      </div>

      <div className="calendar-summary-strip">
        <div>
          <strong>{calendar?.summary.plans ?? 0}</strong>
          <span>写作计划</span>
        </div>
        <div>
          <strong>{calendar?.summary.completedPlans ?? 0}</strong>
          <span>已完成</span>
        </div>
        <div>
          <strong>{calendar?.summary.scheduledChapters ?? 0}</strong>
          <span>计划发布</span>
        </div>
        <div>
          <strong>{calendar?.summary.publishedChapters ?? 0}</strong>
          <span>实际发布</span>
        </div>
      </div>

      <div className="author-calendar-layout">
        <div className="calendar-board-wrap">
          <div className="calendar-toolbar">
            <button
              className="icon-button"
              disabled={isLoading}
              title="上个月"
              type="button"
              onClick={() => onMonthChange(shiftCalendarMonth(month, -1))}
            >
              <ChevronLeft size={17} aria-hidden />
            </button>
            <input
              aria-label="选择月份"
              type="month"
              value={month}
              onChange={(event) => onMonthChange(event.target.value)}
            />
            <button
              className="icon-button"
              disabled={isLoading}
              title="下个月"
              type="button"
              onClick={() => onMonthChange(shiftCalendarMonth(month, 1))}
            >
              <ChevronRight size={17} aria-hidden />
            </button>
          </div>

          <div className="calendar-weekdays" aria-hidden>
            {['一', '二', '三', '四', '五', '六', '日'].map((weekday) => (
              <span key={weekday}>周{weekday}</span>
            ))}
          </div>
          <div className="calendar-board">
            {calendarCells.map((cell) => {
              const dayEvents = eventsByDate.get(cell.key) ?? [];
              return (
                <div
                  className={cell.inMonth ? 'calendar-day' : 'calendar-day outside'}
                  key={cell.key}
                >
                  <span className="calendar-day-number">{cell.day}</span>
                  <div className="calendar-day-events">
                    {dayEvents.slice(0, 3).map((event) =>
                      event.source === 'PLAN' ? (
                        <button
                          className={`calendar-event-chip ${calendarSourceClass(event.source)}`}
                          key={event.id}
                          title={event.title}
                          type="button"
                          onClick={() => editEvent(event)}
                        >
                          {event.isCompleted && <CircleCheckBig size={11} aria-hidden />}
                          <span>{event.title}</span>
                        </button>
                      ) : (
                        <span
                          className={`calendar-event-chip ${calendarSourceClass(event.source)}`}
                          key={event.id}
                          title={event.title}
                        >
                          <span>{event.title}</span>
                        </span>
                      ),
                    )}
                    {dayEvents.length > 3 && <small>+{dayEvents.length - 3}</small>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <form className="calendar-plan-editor" onSubmit={saveEvent}>
          <div className="calendar-plan-editor-title">
            <h3>{editingId ? '编辑计划' : '新建计划'}</h3>
            {editingId && (
              <button className="icon-button" title="取消编辑" type="button" onClick={resetEditor}>
                <X size={16} aria-hidden />
              </button>
            )}
          </div>
          <label>
            作品
            <select
              disabled={disabled || Boolean(editingId)}
              required
              value={novelId}
              onChange={(event) => setNovelId(event.target.value)}
            >
              {novels.map((novel) => (
                <option key={novel.id} value={novel.id}>
                  {novel.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            类型
            <select
              disabled={disabled}
              value={type}
              onChange={(event) => setType(event.target.value as CalendarPlanPayload['type'])}
            >
              <option value="WRITING">写作</option>
              <option value="REVISION">修订</option>
              <option value="REMINDER">提醒</option>
            </select>
          </label>
          <label>
            时间
            <input
              disabled={disabled}
              required
              type="datetime-local"
              value={eventAt}
              onChange={(event) => setEventAt(event.target.value)}
            />
          </label>
          <label>
            标题
            <input
              disabled={disabled}
              maxLength={80}
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            备注
            <textarea
              disabled={disabled}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          {editingId && (
            <label className="calendar-completed-toggle">
              <input
                checked={isCompleted}
                disabled={disabled}
                type="checkbox"
                onChange={(event) => setIsCompleted(event.target.checked)}
              />
              <span>标记为已完成</span>
            </label>
          )}
          {localError && (
            <p className="auth-error" role="alert">
              {localError}
            </p>
          )}
          <button className="primary-link" disabled={disabled || novels.length === 0} type="submit">
            <Save size={16} aria-hidden />
            {editingId ? '保存计划' : '创建计划'}
          </button>
        </form>
      </div>

      <div className="calendar-event-list">
        {isLoading && <p className="state-line">日历加载中...</p>}
        {!isLoading && (calendar?.events.length ?? 0) === 0 && (
          <p className="state-line">本月还没有创作安排</p>
        )}
        {calendar?.events.map((event) => (
          <article className="calendar-event-row" key={event.id}>
            <div className={`calendar-event-marker ${calendarSourceClass(event.source)}`} />
            <div className="calendar-event-main">
              <div className="calendar-event-heading">
                <strong>{event.title}</strong>
                <span>{calendarSourceText(event.source, event.type)}</span>
                {event.isCompleted && <span>已完成</span>}
              </div>
              <p>
                {formatAnnouncementTime(event.eventAt)} · 《{event.novel.title}》
              </p>
              {event.note && <small>{event.note}</small>}
            </div>
            <div className="calendar-event-actions">
              {event.source === 'PLAN' && (
                <>
                  <button
                    className="icon-button"
                    disabled={disabled}
                    title={event.isCompleted ? '标记为未完成' : '标记为已完成'}
                    type="button"
                    onClick={() => void toggleCompleted(event)}
                  >
                    {event.isCompleted ? (
                      <CircleCheckBig size={17} aria-hidden />
                    ) : (
                      <Circle size={17} aria-hidden />
                    )}
                  </button>
                  <button
                    className="icon-button"
                    disabled={disabled}
                    title="编辑计划"
                    type="button"
                    onClick={() => editEvent(event)}
                  >
                    <PencilLine size={16} aria-hidden />
                  </button>
                  <button
                    className="danger-button"
                    disabled={disabled}
                    type="button"
                    onClick={() => void deleteEvent(event.id)}
                  >
                    <Trash2 size={16} aria-hidden />
                    {pendingDeleteId === event.id ? '确认删除' : '删除'}
                  </button>
                </>
              )}
              {event.source === 'CHAPTER_PUBLISHED' && event.chapterId && (
                <Link className="ghost-button" to={`/chapters/${event.chapterId}`}>
                  <BookOpen size={16} aria-hidden />
                  查看章节
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function NovelListPanel({
  isLoading,
  novels,
  selectedNovelId,
  onSelect,
  onOpenSettings,
  onOpenCatalog,
  onCreateChapter,
}: {
  isLoading: boolean;
  novels: AuthorNovel[];
  selectedNovelId: string;
  onSelect(novelId: string): void;
  onOpenSettings(novelId: string): void;
  onOpenCatalog(novelId: string): void;
  onCreateChapter(novelId: string): void;
}) {
  return (
    <section className="panel author-novel-library">
      <div className="section-title">
        <h2>我的作品</h2>
        <span className="muted">{novels.length} 本</span>
      </div>
      {isLoading && <p className="state-line">加载中...</p>}
      {!isLoading && novels.length === 0 && <p className="state-line">还没有作品</p>}
      <div className="author-novel-list">
        {novels.map((novel) => (
          <article
            className={`author-novel-card${selectedNovelId === novel.id ? ' active' : ''}`}
            key={novel.id}
          >
            <button
              className="author-novel-summary"
              type="button"
              onClick={() => onSelect(novel.id)}
            >
              <NovelCover novel={novel} />
              <span>
                <strong>{novel.title}</strong>
                <small>
                  {statusText(novel.status)} · {novel.category.name} · {novel._count.chapters} 章
                </small>
                {novel.status === 'REJECTED' && novel.latestRejection && (
                  <RejectionNote reason={novel.latestRejection.reason} />
                )}
              </span>
            </button>
            <div className="author-novel-quick-actions" aria-label={`${novel.title} 快捷操作`}>
              <button type="button" onClick={() => onOpenSettings(novel.id)}>
                <PencilLine size={14} aria-hidden />
                作品设置
              </button>
              <button type="button" onClick={() => onOpenCatalog(novel.id)}>
                <ListChecks size={14} aria-hidden />
                章节管理
              </button>
              <button className="create" type="button" onClick={() => onCreateChapter(novel.id)}>
                <FilePlus2 size={14} aria-hidden />
                创建章节
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CreateNovelPanel({
  categories,
  disabled,
  token,
  onSaveDraft,
  onSubmit,
}: {
  categories: Category[];
  disabled: boolean;
  token?: string;
  onSaveDraft(payload: NovelPayload): Promise<void>;
  onSubmit(payload: NovelPayload): Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [tags, setTags] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [localError, setLocalError] = useState<string>();

  useEffect(() => {
    setCategoryId((current) => current || categories[0]?.id || '');
  }, [categories]);

  function buildPayload(): NovelPayload {
    return {
      title: title.trim(),
      summary: summary.trim(),
      categoryId,
      coverUrl: coverUrl || undefined,
      tagNames: normalizeTags(tags),
    };
  }

  async function saveDraft() {
    const payload = buildPayload();
    const validationError = validateNovelDraftPayload(payload);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError(undefined);
    try {
      await onSaveDraft(payload);
      setTitle('');
      setSummary('');
      setTags('');
      setCoverUrl('');
    } catch {
      // The parent page shows the API error. Keep the draft intact for retry.
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = buildPayload();
    const validationError = validateNovelPayload(payload);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError(undefined);
    try {
      await onSubmit(payload);
      setTitle('');
      setSummary('');
      setTags('');
      setCoverUrl('');
    } catch {
      // The parent page shows the API error. Keep the draft intact for retry.
    }
  }

  return (
    <form className="panel author-form" onSubmit={submit}>
      <div className="section-title">
        <h2>创建作品</h2>
        <BookPlus size={18} aria-hidden />
      </div>

      <CoverPicker
        coverUrl={coverUrl}
        disabled={disabled}
        label="上传封面"
        title={title || '封面'}
        token={token}
        onChange={setCoverUrl}
      />

      <label>
        书名
        <input
          required
          minLength={2}
          maxLength={80}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label>
        分类
        <select required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        标签
        <input
          placeholder="例如：都市 成长"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
        />
      </label>
      <label>
        简介
        <textarea
          maxLength={1000}
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
        />
      </label>
      {localError && (
        <p className="auth-error" role="alert">
          {localError}
        </p>
      )}
      <div className="author-form-actions">
        <button
          className="ghost-button"
          disabled={disabled || !categoryId}
          type="button"
          onClick={() => void saveDraft()}
        >
          <Save size={16} aria-hidden />
          保存草稿
        </button>
        <button className="primary-link" disabled={disabled || !categoryId} type="submit">
          <Send size={16} aria-hidden />
          提交审核
        </button>
      </div>
    </form>
  );
}

function EditNovelPanel({
  categories,
  disabled,
  novel,
  token,
  onSaveDraft,
  onSubmit,
  onDelete,
  onLifecycle,
}: {
  categories: Category[];
  disabled: boolean;
  novel?: AuthorNovel;
  token?: string;
  onSaveDraft(novelId: string, payload: NovelPayload): Promise<void>;
  onSubmit(novelId: string, payload: NovelPayload): Promise<void>;
  onDelete(novelId: string): Promise<void>;
  onLifecycle(novelId: string, action: 'complete' | 'resume'): Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [tags, setTags] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [localError, setLocalError] = useState<string>();
  const [isDirty, setIsDirty] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>('idle');
  const [pendingDelete, setPendingDelete] = useState(false);
  const lastSavedSignature = useRef('');
  const canEdit = Boolean(novel && ['DRAFT', 'REJECTED'].includes(novel.status));

  useEffect(() => {
    const nextTitle = novel?.title ?? '';
    const nextSummary = novel?.summary ?? '';
    const nextCategoryId = novel?.categoryId ?? categories[0]?.id ?? '';
    const nextTags = novel?.tags.map((tag) => tag.name).join(' ') ?? '';
    const nextCoverUrl = novel?.coverUrl ?? '';
    setTitle(nextTitle);
    setSummary(nextSummary);
    setCategoryId(nextCategoryId);
    setTags(nextTags);
    setCoverUrl(nextCoverUrl);
    setIsDirty(false);
    setAutoSaveState('idle');
    setPendingDelete(false);
    setLocalError(undefined);
    lastSavedSignature.current = JSON.stringify({
      title: nextTitle.trim(),
      summary: nextSummary.trim(),
      categoryId: nextCategoryId,
      coverUrl: nextCoverUrl || undefined,
      tagNames: normalizeTags(nextTags),
    });
  }, [categories, novel?.id]);

  function buildPayload(): NovelPayload {
    return {
      title: title.trim(),
      summary: summary.trim(),
      categoryId,
      coverUrl: coverUrl || undefined,
      tagNames: normalizeTags(tags),
    };
  }

  function markDirty() {
    if (canEdit) {
      setIsDirty(true);
      setAutoSaveState('dirty');
      setLocalError(undefined);
    }
  }

  useEffect(() => {
    if (!novel || !canEdit || !isDirty || disabled) {
      return;
    }

    const payload = buildPayload();
    if (validateNovelDraftPayload(payload)) {
      return;
    }
    const signature = JSON.stringify(payload);
    if (signature === lastSavedSignature.current) {
      setIsDirty(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setAutoSaveState('saving');
      try {
        await onSaveDraft(novel.id, payload);
        lastSavedSignature.current = signature;
        setIsDirty(false);
        setAutoSaveState('saved');
      } catch (err) {
        setAutoSaveState('error');
        setLocalError(err instanceof Error ? err.message : '自动保存失败');
      }
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [canEdit, categoryId, coverUrl, disabled, isDirty, novel?.id, summary, tags, title]);

  async function saveDraft() {
    if (!novel || !canEdit) {
      return;
    }
    const payload = buildPayload();
    const validationError = validateNovelDraftPayload(payload);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setAutoSaveState('saving');
    setLocalError(undefined);
    try {
      await onSaveDraft(novel.id, payload);
      lastSavedSignature.current = JSON.stringify(payload);
      setIsDirty(false);
      setAutoSaveState('saved');
    } catch (err) {
      setAutoSaveState('error');
      setLocalError(err instanceof Error ? err.message : '保存失败');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!novel || !canEdit) {
      return;
    }

    const payload = buildPayload();
    const validationError = validateNovelPayload(payload);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError(undefined);
    setIsDirty(false);
    try {
      await onSubmit(novel.id, payload);
    } catch {
      // The parent page shows the API error. Keep the edit values intact for retry.
      setIsDirty(true);
    }
  }

  async function deleteNovel() {
    if (!novel || !['DRAFT', 'REJECTED'].includes(novel.status)) {
      return;
    }
    if (!pendingDelete) {
      setPendingDelete(true);
      return;
    }

    setLocalError(undefined);
    try {
      await onDelete(novel.id);
    } catch (err) {
      setPendingDelete(false);
      setLocalError(err instanceof Error ? err.message : '删除失败');
    }
  }

  async function updateLifecycle(action: 'complete' | 'resume') {
    if (!novel) {
      return;
    }

    setLocalError(undefined);
    try {
      await onLifecycle(novel.id, action);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '状态更新失败');
    }
  }

  return (
    <form className="panel author-form author-novel-profile" onSubmit={submit}>
      <div className="section-title author-panel-heading">
        <div className="section-heading-copy">
          <span className="eyebrow">WORK PROFILE</span>
          <h2>作品档案</h2>
          <p>完善作品的公开信息，读者会在书城和详情页看到这些内容。</p>
        </div>
        <PencilLine size={18} aria-hidden />
      </div>

      {!novel && <p className="state-line">请先选择作品</p>}
      {novel?.status === 'REJECTED' && novel.latestRejection && (
        <RejectionNote reason={novel.latestRejection.reason} />
      )}
      {novel && !canEdit && (
        <p className="state-line">当前状态为 {statusText(novel.status)}，暂不能编辑。</p>
      )}

      <div className="author-novel-form-grid">
        <aside className="author-novel-cover-card">
          <CoverPicker
            coverUrl={coverUrl}
            disabled={disabled || !canEdit}
            label="更换封面"
            title={title || '封面'}
            token={token}
            onChange={(value) => {
              setCoverUrl(value);
              markDirty();
            }}
          />
          <div className="author-novel-cover-hint">
            <strong>作品封面</strong>
            <span>建议使用清晰、符合题材气质的竖版图片。</span>
          </div>
        </aside>

        <div className="author-form-sections">
          <section className="author-form-section">
            <div className="author-form-section-heading">
              <div>
                <span className="eyebrow">IDENTITY</span>
                <h3>基础信息</h3>
              </div>
              <span>必填</span>
            </div>
            <div className="author-form-field-grid">
              <label>
                书名
                <input
                  required
                  disabled={!canEdit}
                  minLength={2}
                  maxLength={80}
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    markDirty();
                  }}
                />
              </label>
              <label>
                分类
                <select
                  required
                  disabled={!canEdit}
                  value={categoryId}
                  onChange={(event) => {
                    setCategoryId(event.target.value);
                    markDirty();
                  }}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="author-form-section">
            <div className="author-form-section-heading">
              <div>
                <span className="eyebrow">DISCOVERY</span>
                <h3>展示信息</h3>
              </div>
              <span>帮助读者找到它</span>
            </div>
            <label>
              标签
              <input
                disabled={!canEdit}
                placeholder="例如：都市 成长 热血"
                value={tags}
                onChange={(event) => {
                  setTags(event.target.value);
                  markDirty();
                }}
              />
            </label>
            <label>
              作品简介
              <textarea
                disabled={!canEdit}
                maxLength={1000}
                value={summary}
                placeholder="用几句话介绍故事的核心冲突与阅读期待..."
                onChange={(event) => {
                  setSummary(event.target.value);
                  markDirty();
                }}
              />
              <small className="field-hint">{summary.length}/1000 字</small>
            </label>
          </section>
        </div>
      </div>
      {localError && (
        <p className="auth-error" role="alert">
          {localError}
        </p>
      )}
      {canEdit && <AutoSaveNote state={autoSaveState} />}
      <div className="author-form-actions author-form-sticky-actions">
        <button
          className="ghost-button"
          disabled={disabled || !categoryId || !canEdit}
          type="button"
          onClick={() => void saveDraft()}
        >
          <Save size={16} aria-hidden />
          保存草稿
        </button>
        <button
          className="primary-link"
          disabled={disabled || !categoryId || !canEdit}
          type="submit"
        >
          <Send size={16} aria-hidden />
          {novel?.status === 'REJECTED' ? '重新提交审核' : '提交审核'}
        </button>
      </div>
      {novel && ['DRAFT', 'REJECTED'].includes(novel.status) && (
        <details className="novel-lifecycle-actions author-danger-zone">
          <summary>作品管理与危险操作</summary>
          <button
            className="danger-button"
            disabled={disabled}
            type="button"
            onClick={() => void deleteNovel()}
          >
            <Trash2 size={16} aria-hidden />
            {pendingDelete ? '确认删除作品' : '删除作品'}
          </button>
        </details>
      )}
      {novel?.status === 'SERIALIZING' && (
        <div className="novel-lifecycle-actions">
          <button
            className="ghost-button"
            disabled={disabled}
            type="button"
            onClick={() => void updateLifecycle('complete')}
          >
            <BookCheck size={16} aria-hidden />
            设为完结
          </button>
        </div>
      )}
      {novel?.status === 'COMPLETED' && (
        <div className="novel-lifecycle-actions">
          <button
            className="ghost-button"
            disabled={disabled}
            type="button"
            onClick={() => void updateLifecycle('resume')}
          >
            <RotateCcw size={16} aria-hidden />
            恢复连载
          </button>
        </div>
      )}
    </form>
  );
}

function AnnouncementManagerPanel({
  novel,
  disabled,
  onCreate,
  onUpdate,
  onDelete,
}: {
  novel?: AuthorNovel;
  disabled: boolean;
  onCreate(payload: AnnouncementPayload): Promise<void>;
  onUpdate(announcementId: string, payload: AnnouncementPayload): Promise<void>;
  onDelete(announcementId: string): Promise<void>;
}) {
  const [editingId, setEditingId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const [pendingDeleteId, setPendingDeleteId] = useState('');
  const announcements = novel?.announcements ?? [];
  const editingAnnouncement = announcements.find((item) => item.id === editingId);
  const canPublish = Boolean(novel && ['SERIALIZING', 'COMPLETED'].includes(novel.status));

  useEffect(() => {
    resetEditor();
  }, [novel?.id]);

  function resetEditor() {
    setEditingId('');
    setTitle('');
    setContent('');
    setIsPinned(false);
    setLocalError(undefined);
    setPendingDeleteId('');
  }

  function editAnnouncement(announcement: NovelAnnouncement) {
    setEditingId(announcement.id);
    setTitle(announcement.title);
    setContent(announcement.content);
    setIsPinned(announcement.isPinned);
    setLocalError(undefined);
    setPendingDeleteId('');
  }

  async function persist(action: AnnouncementPayload['action']) {
    const nextTitle = title.trim();
    const nextContent = content.trim();
    if (nextTitle.length < 2) {
      setLocalError('公告标题至少需要 2 个字');
      return;
    }
    if (nextContent.length < 2) {
      setLocalError('公告正文至少需要 2 个字');
      return;
    }
    if (action === 'publish' && !canPublish) {
      setLocalError('作品上架后才能发布公告');
      return;
    }

    setLocalError(undefined);
    const payload: AnnouncementPayload = {
      title: nextTitle,
      content: nextContent,
      isPinned,
      action,
    };
    try {
      if (editingId) {
        await onUpdate(editingId, payload);
      } else {
        await onCreate(payload);
      }
      resetEditor();
    } catch {
      // The page-level message keeps the editor contents available for retry.
    }
  }

  async function togglePinned(announcement: NovelAnnouncement) {
    try {
      await onUpdate(announcement.id, {
        title: announcement.title,
        content: announcement.content,
        isPinned: !announcement.isPinned,
        action: announcement.publishedAt ? 'publish' : 'save',
      });
    } catch {
      // The parent page displays the API error.
    }
  }

  async function deleteAnnouncement(announcementId: string) {
    if (pendingDeleteId !== announcementId) {
      setPendingDeleteId(announcementId);
      return;
    }
    try {
      await onDelete(announcementId);
      if (editingId === announcementId) {
        resetEditor();
      } else {
        setPendingDeleteId('');
      }
    } catch {
      // The parent page displays the API error.
    }
  }

  return (
    <section className="panel announcement-manager-panel">
      <div className="section-title">
        <div>
          <h2>作品公告</h2>
          <span className="muted">{announcements.length} 条</span>
        </div>
        <Megaphone size={18} aria-hidden />
      </div>

      {!novel ? (
        <p className="state-line">请先选择作品</p>
      ) : (
        <>
          <div className="announcement-editor">
            <label>
              公告标题
              <input
                disabled={disabled}
                maxLength={80}
                placeholder="例如：本周更新安排"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label>
              公告正文
              <textarea
                disabled={disabled}
                maxLength={1000}
                placeholder="写下更新安排、停更说明或作品动态"
                value={content}
                onChange={(event) => setContent(event.target.value)}
              />
            </label>
            <label className="announcement-pin-toggle">
              <input
                checked={isPinned}
                disabled={disabled}
                type="checkbox"
                onChange={(event) => setIsPinned(event.target.checked)}
              />
              <span>置顶这条公告</span>
            </label>
            {localError && (
              <p className="auth-error" role="alert">
                {localError}
              </p>
            )}
            {!canPublish && (
              <p className="inline-hint">当前作品可保存公告草稿，通过审核上架后即可发布。</p>
            )}
            {editingAnnouncement?.publishedAt && (
              <p className="inline-hint">保存为草稿会将这条公告从作品详情撤下。</p>
            )}
            <div className="announcement-editor-actions">
              <button
                className="ghost-button"
                disabled={disabled}
                type="button"
                onClick={() => void persist('save')}
              >
                <Save size={16} aria-hidden />
                {editingAnnouncement?.publishedAt ? '转为草稿' : '保存草稿'}
              </button>
              <button
                className="primary-link"
                disabled={disabled || !canPublish}
                type="button"
                onClick={() => void persist('publish')}
              >
                <Send size={16} aria-hidden />
                {editingAnnouncement?.publishedAt ? '更新公告' : '发布公告'}
              </button>
              {editingId && (
                <button
                  className="ghost-button"
                  disabled={disabled}
                  type="button"
                  onClick={resetEditor}
                >
                  <X size={16} aria-hidden />
                  取消编辑
                </button>
              )}
            </div>
          </div>

          <div className="announcement-list">
            {announcements.length === 0 && <p className="state-line">还没有作品公告</p>}
            {announcements.map((announcement) => (
              <article
                className={
                  editingId === announcement.id ? 'announcement-row active' : 'announcement-row'
                }
                key={announcement.id}
              >
                <div className="announcement-row-content">
                  <div className="announcement-row-title">
                    <strong>{announcement.title}</strong>
                    {announcement.isPinned && <span>置顶</span>}
                    <span>{announcement.publishedAt ? '已发布' : '草稿'}</span>
                  </div>
                  <p>{announcement.content}</p>
                  <small>
                    {announcement.publishedAt
                      ? `发布于 ${formatAnnouncementTime(announcement.publishedAt)}`
                      : `保存于 ${formatAnnouncementTime(announcement.updatedAt)}`}
                  </small>
                </div>
                <div className="announcement-row-actions">
                  <button
                    className="icon-button"
                    disabled={disabled}
                    title={announcement.isPinned ? '取消置顶' : '置顶公告'}
                    type="button"
                    onClick={() => void togglePinned(announcement)}
                  >
                    <Pin size={16} aria-hidden />
                  </button>
                  <button
                    className="icon-button"
                    disabled={disabled}
                    title="编辑公告"
                    type="button"
                    onClick={() => editAnnouncement(announcement)}
                  >
                    <PencilLine size={16} aria-hidden />
                  </button>
                  <button
                    className="danger-button"
                    disabled={disabled}
                    type="button"
                    onClick={() => void deleteAnnouncement(announcement.id)}
                  >
                    <Trash2 size={16} aria-hidden />
                    {pendingDeleteId === announcement.id ? '确认删除' : '删除'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function CatalogOverview({ novel }: { novel: AuthorNovel }) {
  const chapters = novel.chapters ?? [];
  const publishedCount = chapters.filter((chapter) => chapter.status === 'PUBLISHED').length;
  const pendingCount = chapters.filter((chapter) =>
    ['DRAFT', 'REVIEWING', 'SCHEDULED', 'REJECTED'].includes(chapter.status),
  ).length;
  const wordCount = chapters.reduce((total, chapter) => total + chapter.wordCount, 0);

  return (
    <section className="author-catalog-overview" aria-label="目录概览">
      <div className="author-catalog-overview-heading">
        <div>
          <span className="eyebrow">CHAPTER DESK</span>
          <h2>目录工作台</h2>
          <p>管理分卷、调整章节顺序，并快速定位需要继续创作的部分。</p>
        </div>
        <BarChart3 size={20} aria-hidden />
      </div>
      <div className="author-catalog-stats">
        <div>
          <span>总章节</span>
          <strong>{chapters.length}</strong>
          <small>已创建章节</small>
        </div>
        <div>
          <span>当前字数</span>
          <strong>{formatDashboardNumber(wordCount)}</strong>
          <small>正文累计</small>
        </div>
        <div>
          <span>已发布</span>
          <strong>{publishedCount}</strong>
          <small>读者可见</small>
        </div>
        <div>
          <span>创作中</span>
          <strong>{pendingCount}</strong>
          <small>草稿 / 审核 / 定时</small>
        </div>
      </div>
    </section>
  );
}

function VolumeManagerPanel({
  novel,
  disabled,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
}: {
  novel?: AuthorNovel;
  disabled: boolean;
  onCreate(payload: { title: string; description?: string }): Promise<void>;
  onUpdate(volumeId: string, payload: { title: string; description?: string }): Promise<void>;
  onDelete(volumeId: string): Promise<void>;
  onReorder(volumeIds: string[]): Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [localError, setLocalError] = useState<string>();
  const volumes = novel?.volumes ?? [];
  const unassignedCount = novel?.chapters?.filter((chapter) => !chapter.volumeId).length ?? 0;

  async function createVolume(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      setLocalError('请输入分卷名称');
      return;
    }

    setLocalError(undefined);
    try {
      await onCreate({ title: nextTitle, description: description.trim() || undefined });
      setTitle('');
      setDescription('');
    } catch {
      // The parent page displays the API error and keeps the input for retry.
    }
  }

  async function moveVolume(volumeId: string, direction: -1 | 1) {
    const currentIndex = volumes.findIndex((volume) => volume.id === volumeId);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= volumes.length) {
      return;
    }
    const nextVolumes = [...volumes];
    [nextVolumes[currentIndex], nextVolumes[targetIndex]] = [
      nextVolumes[targetIndex],
      nextVolumes[currentIndex],
    ];
    await onReorder(nextVolumes.map((volume) => volume.id));
  }

  return (
    <section className="panel volume-manager-panel">
      <div className="section-title author-panel-heading">
        <div className="section-heading-copy">
          <span className="eyebrow">VOLUME TREE</span>
          <h2>分卷导航</h2>
          <p>{volumes.length} 个分卷，按章节结构逐级整理。</p>
        </div>
        <Layers3 size={18} aria-hidden />
      </div>
      {!novel && <p className="state-line">请先选择作品</p>}
      {novel && (
        <>
          <form className="volume-create-form" onSubmit={createVolume}>
            <label>
              新分卷名称
              <input
                required
                maxLength={80}
                disabled={disabled}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例如：第二卷 暗潮"
              />
            </label>
            <label>
              分卷说明
              <input
                maxLength={300}
                disabled={disabled}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="可选，用于说明本卷内容"
              />
            </label>
            <button className="primary-link" type="submit" disabled={disabled}>
              <BookPlus size={16} aria-hidden />
              新建分卷
            </button>
          </form>
          {localError && (
            <p className="auth-error" role="alert">
              {localError}
            </p>
          )}
          <div className="volume-list">
            <div className="volume-unassigned-row">
              <span className="volume-tree-index">00</span>
              <div>
                <strong>未分卷</strong>
                <small>暂未归入分卷的章节</small>
              </div>
              <span>{unassignedCount} 章</span>
            </div>
            {volumes.length === 0 && <p className="state-line">创建第一个分卷，让长篇结构更清晰。</p>}
            {volumes.map((volume, index) => (
              <VolumeRow
                key={volume.id}
                volume={volume}
                disabled={disabled}
                canMoveUp={index > 0}
                canMoveDown={index < volumes.length - 1}
                onMove={(direction) => moveVolume(volume.id, direction)}
                onUpdate={(payload) => onUpdate(volume.id, payload)}
                onDelete={() => onDelete(volume.id)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function VolumeRow({
  volume,
  disabled,
  canMoveUp,
  canMoveDown,
  onMove,
  onUpdate,
  onDelete,
}: {
  volume: NovelVolume;
  disabled: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove(direction: -1 | 1): Promise<void>;
  onUpdate(payload: { title: string; description?: string }): Promise<void>;
  onDelete(): Promise<void>;
}) {
  const [title, setTitle] = useState(volume.title);
  const [description, setDescription] = useState(volume.description ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const chapterCount = volume._count?.chapters ?? 0;

  useEffect(() => {
    setTitle(volume.title);
    setDescription(volume.description ?? '');
    setConfirmDelete(false);
  }, [volume.id, volume.title, volume.description]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle) {
      return;
    }
    await onUpdate({ title: nextTitle, description: description.trim() || undefined });
  }

  async function remove() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await onDelete();
  }

  return (
    <form className="volume-row" onSubmit={save}>
      <span className="volume-tree-index">{String(volume.orderIndex).padStart(2, '0')}</span>
      <div className="volume-order-actions">
        <button
          className="icon-button"
          type="button"
          aria-label={`上移分卷 ${volume.title}`}
          title="上移"
          disabled={disabled || !canMoveUp}
          onClick={() => void onMove(-1)}
        >
          <ArrowUp size={16} aria-hidden />
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label={`下移分卷 ${volume.title}`}
          title="下移"
          disabled={disabled || !canMoveDown}
          onClick={() => void onMove(1)}
        >
          <ArrowDown size={16} aria-hidden />
        </button>
      </div>
      <label>
        分卷名称
        <input
          required
          maxLength={80}
          disabled={disabled}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label>
        分卷说明
        <input
          maxLength={300}
          disabled={disabled}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <span className="volume-chapter-count">{chapterCount} 章</span>
      <div className="volume-row-actions">
        <button className="ghost-button" type="submit" disabled={disabled}>
          <Save size={16} aria-hidden />
          保存
        </button>
        <button
          className="danger-button"
          type="button"
          disabled={disabled || chapterCount > 0}
          title={chapterCount > 0 ? '请先把卷内章节移动到其他分卷' : '删除分卷'}
          onClick={() => void remove()}
        >
          <Trash2 size={16} aria-hidden />
          {confirmDelete ? '确认删除' : '删除'}
        </button>
      </div>
    </form>
  );
}

function ChapterListPanel({
  chapters,
  volumes,
  disabled,
  selectedChapterId,
  onSelect,
  onDelete,
  onReorder,
  onAssignVolume,
}: {
  chapters: DraftChapter[];
  volumes: NovelVolume[];
  disabled: boolean;
  selectedChapterId: string;
  onSelect(chapterId: string): void;
  onDelete(chapterIds: string[]): Promise<void>;
  onReorder(chapterIds: string[]): Promise<void>;
  onAssignVolume(chapterId: string, volumeId: string | null): Promise<void>;
}) {
  const [isManaging, setIsManaging] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [pendingAction, setPendingAction] = useState<'delete' | 'reorder'>();
  const manageableIds = useMemo(
    () =>
      chapters
        .filter((chapter) => ['DRAFT', 'REJECTED'].includes(chapter.status))
        .map((chapter) => chapter.id),
    [chapters],
  );
  const canReorder = chapters.length > 1 && manageableIds.length === chapters.length;
  const allManageableSelected =
    manageableIds.length > 0 && manageableIds.every((chapterId) => selectedIds.includes(chapterId));

  useEffect(() => {
    const availableIds = new Set(manageableIds);
    setSelectedIds((current) => current.filter((chapterId) => availableIds.has(chapterId)));
  }, [manageableIds]);

  function toggleManagement() {
    setIsManaging((current) => !current);
    setSelectedIds([]);
    setPendingDelete(false);
  }

  function toggleChapter(chapterId: string) {
    setSelectedIds((current) =>
      current.includes(chapterId)
        ? current.filter((currentId) => currentId !== chapterId)
        : [...current, chapterId],
    );
    setPendingDelete(false);
  }

  async function moveChapter(chapterId: string, direction: -1 | 1) {
    const currentIndex = chapters.findIndex((chapter) => chapter.id === chapterId);
    const targetIndex = currentIndex + direction;
    if (!canReorder || currentIndex < 0 || targetIndex < 0 || targetIndex >= chapters.length) {
      return;
    }

    const nextChapters = [...chapters];
    [nextChapters[currentIndex], nextChapters[targetIndex]] = [
      nextChapters[targetIndex],
      nextChapters[currentIndex],
    ];
    setPendingAction('reorder');
    try {
      await onReorder(nextChapters.map((chapter) => chapter.id));
    } finally {
      setPendingAction(undefined);
    }
  }

  async function deleteSelected() {
    if (selectedIds.length === 0) {
      return;
    }

    if (!pendingDelete) {
      setPendingDelete(true);
      return;
    }

    setPendingAction('delete');
    try {
      await onDelete(selectedIds);
      setSelectedIds([]);
      setPendingDelete(false);
    } finally {
      setPendingAction(undefined);
    }
  }

  return (
    <section className="panel author-chapter-panel">
      <div className="section-title author-panel-heading">
        <div className="section-heading-copy">
          <span className="eyebrow">CHAPTERS</span>
          <h2>章节列表</h2>
          <p>点击章节进入编辑，归卷和批量整理都在这里完成。</p>
        </div>
        <div className="chapter-list-heading-actions">
          <span className="muted">{chapters.length} 章</span>
          {chapters.length > 0 && (
            <button type="button" disabled={disabled} onClick={toggleManagement}>
              {isManaging ? <X size={16} aria-hidden /> : <ListChecks size={16} aria-hidden />}
              {isManaging ? '完成' : '管理'}
            </button>
          )}
        </div>
      </div>
      {chapters.length === 0 && <p className="state-line">当前作品还没有章节</p>}
      {isManaging && (
        <div className="chapter-management-toolbar">
          <label>
            <input
              type="checkbox"
              checked={allManageableSelected}
              disabled={disabled || manageableIds.length === 0}
              onChange={() => {
                setSelectedIds(allManageableSelected ? [] : manageableIds);
                setPendingDelete(false);
              }}
            />
            全选
          </label>
          <button
            className="danger-button"
            type="button"
            disabled={disabled || selectedIds.length === 0 || pendingAction === 'reorder'}
            onClick={() => void deleteSelected()}
          >
            <Trash2 size={16} aria-hidden />
            {pendingDelete ? `确认删除 (${selectedIds.length})` : `删除 (${selectedIds.length})`}
          </button>
        </div>
      )}
      {isManaging && manageableIds.length !== chapters.length && (
        <p className="chapter-management-note">审核中和已发布章节已锁定</p>
      )}
      {chapters.length > 0 && (
        <div className={`author-chapter-table-header${isManaging ? ' managing' : ''}`}>
          {isManaging && <span aria-hidden />}
          <span>章节</span>
          <span>状态 / 字数</span>
          <span>所属分卷</span>
          {isManaging && <span>排序</span>}
        </div>
      )}
      <div className="author-chapter-list">
        {chapters.map((chapter, index) => (
          <article
            className={`author-chapter-row${isManaging ? ' managing' : ''}${selectedChapterId === chapter.id ? ' active' : ''}`}
            key={chapter.id}
          >
            {isManaging && (
              <label className="chapter-select-control" title="选择章节">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(chapter.id)}
                  disabled={
                    disabled ||
                    !['DRAFT', 'REJECTED'].includes(chapter.status) ||
                    Boolean(pendingAction)
                  }
                  onChange={() => toggleChapter(chapter.id)}
                />
              </label>
            )}
            <button
              className="author-chapter-select"
              type="button"
              onClick={() => onSelect(chapter.id)}
            >
              <span className="author-chapter-index">
                {String(chapter.orderIndex).padStart(2, '0')}
              </span>
              <span className="author-chapter-title-copy">
                <strong>{chapter.title}</strong>
                <small>更新于 {formatAnnouncementTime(chapter.updatedAt)}</small>
              </span>
              {chapter.status === 'REJECTED' && chapter.latestRejection && (
                <RejectionNote reason={chapter.latestRejection.reason} />
              )}
            </button>
            <div className="author-chapter-meta">
              <span className="author-chapter-status" data-status={chapter.status}>
                {statusText(chapter.status)}
              </span>
              <small>
                {chapter.wordCount} 字
                {chapter.status === 'SCHEDULED' && chapter.scheduledAt
                  ? ` · ${formatScheduledAt(chapter.scheduledAt)}`
                  : ''}
              </small>
            </div>
            <label className="chapter-volume-control">
              <span className="sr-only">所属分卷</span>
              <select
                aria-label={`${chapter.title} 所属分卷`}
                disabled={disabled || Boolean(pendingAction)}
                value={chapter.volumeId ?? ''}
                onChange={(event) => void onAssignVolume(chapter.id, event.target.value || null)}
              >
                <option value="">未分卷</option>
                {volumes.map((volume) => (
                  <option key={volume.id} value={volume.id}>
                    {volume.title}
                  </option>
                ))}
              </select>
            </label>
            {isManaging && (
              <div className="chapter-order-actions">
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`上移 ${chapter.title}`}
                  title="上移"
                  disabled={disabled || !canReorder || index === 0 || Boolean(pendingAction)}
                  onClick={() => void moveChapter(chapter.id, -1)}
                >
                  <ArrowUp size={16} aria-hidden />
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`下移 ${chapter.title}`}
                  title="下移"
                  disabled={
                    disabled ||
                    !canReorder ||
                    index === chapters.length - 1 ||
                    Boolean(pendingAction)
                  }
                  onClick={() => void moveChapter(chapter.id, 1)}
                >
                  <ArrowDown size={16} aria-hidden />
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function ChapterTrashPanel({
  chapters,
  disabled,
  isLoading,
  onRestore,
  onPermanentDelete,
}: {
  chapters: DeletedChapter[];
  disabled: boolean;
  isLoading: boolean;
  onRestore(chapterId: string): Promise<void>;
  onPermanentDelete(chapterId: string): Promise<void>;
}) {
  const [pendingPermanentId, setPendingPermanentId] = useState('');
  const [pendingActionId, setPendingActionId] = useState('');

  async function restoreChapter(chapterId: string) {
    setPendingActionId(chapterId);
    setPendingPermanentId('');
    try {
      await onRestore(chapterId);
    } finally {
      setPendingActionId('');
    }
  }

  async function permanentlyDelete(chapterId: string) {
    if (pendingPermanentId !== chapterId) {
      setPendingPermanentId(chapterId);
      return;
    }
    setPendingActionId(chapterId);
    try {
      await onPermanentDelete(chapterId);
      setPendingPermanentId('');
    } finally {
      setPendingActionId('');
    }
  }

  return (
    <section className="panel">
      <div className="section-title">
        <h2>章节回收站</h2>
        <span className="muted">{chapters.length} 章</span>
      </div>
      {isLoading && <p className="state-line">正在加载回收站...</p>}
      {!isLoading && chapters.length === 0 && (
        <p className="state-line">回收站为空，删除的草稿章节会保留在这里</p>
      )}
      <div className="chapter-history-list">
        {chapters.map((chapter) => (
          <article className="chapter-history-item" key={chapter.id}>
            <div className="chapter-history-copy">
              <strong>
                原第 {chapter.orderIndex} 章 · {chapter.title}
              </strong>
              <small>
                {statusText(chapter.status)} · {chapter.wordCount} 字 · 删除于{' '}
                {formatAnnouncementTime(chapter.deletedAt)}
              </small>
              <small>保留 {chapter._count.versions} 个历史版本</small>
            </div>
            <div className="chapter-history-actions">
              <button
                className="ghost-button"
                type="button"
                disabled={disabled || Boolean(pendingActionId)}
                onClick={() => void restoreChapter(chapter.id)}
              >
                <RotateCcw size={16} aria-hidden />
                恢复
              </button>
              <button
                className="danger-button"
                type="button"
                disabled={disabled || Boolean(pendingActionId)}
                onClick={() => void permanentlyDelete(chapter.id)}
              >
                <Trash2 size={16} aria-hidden />
                {pendingPermanentId === chapter.id ? '确认永久删除' : '永久删除'}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ChapterVersionPanel({
  chapter,
  disabled,
  isLoading,
  versions,
  onRestore,
}: {
  chapter?: DraftChapter;
  disabled: boolean;
  isLoading: boolean;
  versions: ChapterVersion[];
  onRestore(versionId: string): Promise<void>;
}) {
  const [pendingRestoreId, setPendingRestoreId] = useState('');
  const [restoringId, setRestoringId] = useState('');
  const canRestore = Boolean(chapter && ['DRAFT', 'REJECTED'].includes(chapter.status));

  useEffect(() => {
    setPendingRestoreId('');
    setRestoringId('');
  }, [chapter?.id]);

  async function restoreVersion(versionId: string) {
    if (pendingRestoreId !== versionId) {
      setPendingRestoreId(versionId);
      return;
    }
    setRestoringId(versionId);
    try {
      await onRestore(versionId);
      setPendingRestoreId('');
    } finally {
      setRestoringId('');
    }
  }

  return (
    <section className="panel">
      <div className="section-title">
        <h2>版本历史</h2>
        <History size={18} aria-hidden />
      </div>
      {!chapter && <p className="state-line">请先选择章节</p>}
      {chapter && isLoading && <p className="state-line">正在加载版本历史...</p>}
      {chapter && !isLoading && versions.length === 0 && (
        <p className="state-line">当前章节还没有历史快照</p>
      )}
      {chapter && !canRestore && versions.length > 0 && (
        <p className="chapter-management-note">审核中或已发布章节只能查看历史，暂不能恢复</p>
      )}
      <div className="chapter-history-list">
        {versions.map((version) => (
          <article className="chapter-history-item" key={version.id}>
            <div className="chapter-history-copy">
              <strong>{version.title}</strong>
              <small>
                {chapterVersionSourceText(version.source)} · {version.wordCount} 字 ·{' '}
                {formatAnnouncementTime(version.createdAt)}
              </small>
              <p>{chapterVersionPreview(version.content)}</p>
            </div>
            <button
              className="ghost-button"
              type="button"
              disabled={disabled || !canRestore || Boolean(restoringId)}
              onClick={() => void restoreVersion(version.id)}
            >
              <RotateCcw size={16} aria-hidden />
              {pendingRestoreId === version.id ? '确认恢复' : '恢复此版本'}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function EditChapterPanel({
  chapter,
  volumes,
  token,
  disabled,
  onSaveDraft,
  onSubmit,
  onUpdateSchedule,
}: {
  chapter?: DraftChapter;
  volumes: NovelVolume[];
  token?: string;
  disabled: boolean;
  onSaveDraft(
    chapterId: string,
    payload: ChapterPayload,
    saveSource: 'manual' | 'autosave',
  ): Promise<void>;
  onSubmit(chapterId: string, payload: ChapterPayload): Promise<void>;
  onUpdateSchedule(chapterId: string, scheduledAt: string | null): Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [volumeId, setVolumeId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [localError, setLocalError] = useState<string>();
  const [isDirty, setIsDirty] = useState(false);
  const [autoSaveState, setAutoSaveState] = useState<AutoSaveState>('idle');
  const lastSavedSignature = useRef('');
  const canEdit = Boolean(chapter && ['DRAFT', 'REJECTED'].includes(chapter.status));
  const canSchedule = Boolean(
    chapter && ['DRAFT', 'REJECTED', 'REVIEWING', 'SCHEDULED'].includes(chapter.status),
  );

  useEffect(() => {
    const nextTitle = chapter?.title ?? '';
    const nextContent = chapter?.content ?? '';
    const nextVolumeId = chapter?.volumeId ?? '';
    const nextScheduledAt = toDateTimeLocal(chapter?.scheduledAt);
    setTitle(nextTitle);
    setContent(nextContent);
    setVolumeId(nextVolumeId);
    setScheduledAt(nextScheduledAt);
    setIsDirty(false);
    setAutoSaveState('idle');
    setLocalError(undefined);
    lastSavedSignature.current = JSON.stringify({
      title: nextTitle.trim(),
      content: nextContent.trim(),
      volumeId: nextVolumeId || null,
      scheduledAt: nextScheduledAt ? new Date(nextScheduledAt).toISOString() : null,
    });
  }, [chapter?.id, chapter?.scheduledAt, chapter?.volumeId]);

  function buildPayload(): ChapterPayload {
    return {
      title: title.trim(),
      content: content.trim(),
      volumeId: volumeId || null,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    };
  }

  function markDirty() {
    if (canEdit) {
      setIsDirty(true);
      setAutoSaveState('dirty');
      setLocalError(undefined);
    }
  }

  useEffect(() => {
    if (!chapter || !canEdit || !isDirty || disabled) {
      return;
    }

    const payload = buildPayload();
    if (validateChapterDraftPayload(payload)) {
      return;
    }
    const signature = JSON.stringify(payload);
    if (signature === lastSavedSignature.current) {
      setIsDirty(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setAutoSaveState('saving');
      try {
        await onSaveDraft(chapter.id, payload, 'autosave');
        lastSavedSignature.current = signature;
        setIsDirty(false);
        setAutoSaveState('saved');
      } catch (err) {
        setAutoSaveState('error');
        setLocalError(err instanceof Error ? err.message : '自动保存失败');
      }
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [canEdit, chapter?.id, content, disabled, isDirty, title, volumeId]);

  async function saveDraft() {
    if (!chapter || !canEdit) {
      return;
    }
    const payload = buildPayload();
    const validationError = validateChapterDraftPayload(payload);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setAutoSaveState('saving');
    setLocalError(undefined);
    try {
      await onSaveDraft(chapter.id, payload, 'manual');
      lastSavedSignature.current = JSON.stringify(payload);
      setIsDirty(false);
      setAutoSaveState('saved');
    } catch (err) {
      setAutoSaveState('error');
      setLocalError(err instanceof Error ? err.message : '保存失败');
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chapter || !canEdit) {
      return;
    }
    const payload = buildPayload();
    const validationError = validateChapterPayload(payload);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError(undefined);
    setIsDirty(false);
    try {
      await onSubmit(chapter.id, payload);
    } catch {
      // The parent page shows the API error. Keep the edit values intact for retry.
      setIsDirty(true);
    }
  }

  async function updateSchedule() {
    if (!chapter || !canSchedule) {
      return;
    }
    const nextScheduledAt = scheduledAt ? new Date(scheduledAt) : null;
    if (nextScheduledAt && nextScheduledAt.getTime() <= Date.now()) {
      setLocalError('定时发布时间必须晚于当前时间');
      return;
    }

    setLocalError(undefined);
    try {
      await onUpdateSchedule(chapter.id, nextScheduledAt?.toISOString() ?? null);
    } catch {
      // The parent page displays the API error and keeps the selected time for retry.
    }
  }

  return (
    <form className="chapter-editor-form" onSubmit={submit}>
      <header className="chapter-editor-topbar">
        <div>
          <span className="chapter-editor-kicker">章节创作</span>
          <strong>{chapter ? `第 ${chapter.orderIndex} 章` : '编辑章节'}</strong>
          {chapter && <small>{statusText(chapter.status)}</small>}
        </div>
        <div className="chapter-editor-top-actions">
          {canEdit && <AutoSaveNote state={autoSaveState} />}
          <button
            className="ghost-button"
            disabled={disabled || !canEdit}
            type="button"
            onClick={() => void saveDraft()}
          >
            <Save size={16} aria-hidden />
            保存草稿
          </button>
          <button className="primary-link" disabled={disabled || !canEdit} type="submit">
            <Send size={16} aria-hidden />
            {chapter?.status === 'REJECTED' ? '重新提交' : '提交审核'}
          </button>
        </div>
      </header>

      <main className="chapter-writing-surface">
        {!chapter && <p className="state-line">请先选择章节</p>}
        {chapter?.status === 'REJECTED' && chapter.latestRejection && (
          <RejectionNote reason={chapter.latestRejection.reason} />
        )}
        {chapter && !canEdit && (
          <p className="state-line">当前状态为 {statusText(chapter.status)}，暂不能编辑。</p>
        )}

        <div className="chapter-editor-meta">
          <label>
            <span>所属分卷</span>
            <select
              disabled={!canEdit}
              value={volumeId}
              onChange={(event) => {
                setVolumeId(event.target.value);
                markDirty();
              }}
            >
              <option value="">未分卷</option>
              {volumes.map((volume) => (
                <option key={volume.id} value={volume.id}>
                  {volume.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>定时发布</span>
            <input
              type="datetime-local"
              min={minimumScheduleValue()}
              disabled={!canSchedule}
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
          </label>
          <button
            className="ghost-button"
            type="button"
            disabled={disabled || !canSchedule}
            onClick={() => void updateSchedule()}
          >
            <CalendarClock size={16} aria-hidden />
            更新发布时间
          </button>
        </div>

        <div className="chapter-title-editor">
          <span>第 {chapter?.orderIndex ?? '—'} 章</span>
          <input
            aria-label="章节标题"
            required
            disabled={!canEdit}
            maxLength={80}
            placeholder="请输入章节标题"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              markDirty();
            }}
          />
        </div>
        <label className="chapter-content-field">
          <textarea
            aria-label="章节正文"
            disabled={!canEdit}
            placeholder="从这里开始写正文……"
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              markDirty();
            }}
          />
          <span className="chapter-word-count">{content.trim().length} 字</span>
        </label>
        {localError && (
          <p className="auth-error" role="alert">
            {localError}
          </p>
        )}
      </main>
      <AuthorAiAssistant
        chapter={chapter}
        novelId={chapter?.novelId}
        beforeChapterOrder={Math.max((chapter?.orderIndex ?? 1) - 1, 0)}
        token={token}
        title={title}
        content={content}
        disabled={disabled || !canEdit}
        onAppend={(suggestion) => {
          setContent((current) => `${current.trimEnd()}\n\n${suggestion.trim()}`.trim());
          markDirty();
        }}
      />
    </form>
  );
}

function AuthorAiAssistant({
  chapter,
  novelId,
  beforeChapterOrder,
  token,
  title,
  content,
  disabled,
  onAppend,
}: {
  chapter?: DraftChapter;
  novelId?: string;
  beforeChapterOrder?: number;
  token?: string;
  title: string;
  content: string;
  disabled: boolean;
  onAppend(suggestion: string): void;
}) {
  const [result, setResult] = useState<AuthorAiAssistanceResult>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [query, setQuery] = useState('');
  const [ragStatus, setRagStatus] = useState<AuthorRagIndexStatus>();
  const [isRagIndexing, setIsRagIndexing] = useState(false);
  const [ragEvaluation, setRagEvaluation] = useState<AuthorRagEvaluationResult>();
  const [isRagEvaluating, setIsRagEvaluating] = useState(false);
  const [ragError, setRagError] = useState<string>();

  const primaryActions: Array<{
    action: AuthorAiAction;
    label: string;
    description: string;
    icon: ReactNode;
  }> = [
    {
      action: 'consistency',
      label: '一致性审校',
      description: '对照前文章节检查人物、时间线与设定冲突',
      icon: <ShieldCheck size={18} aria-hidden />,
    },
    {
      action: 'character',
      label: '人物设定',
      description: '整理角色关系、动机与特征',
      icon: <BookOpen size={18} aria-hidden />,
    },
    {
      action: 'naming',
      label: 'AI 起名',
      description: '生成章节名、人物名和地点名',
      icon: <PencilLine size={18} aria-hidden />,
    },
    {
      action: 'inspiration',
      label: '灵感生成',
      description: '给出冲突、转折与后续方向',
      icon: <Sparkles size={18} aria-hidden />,
    },
  ];
  const secondaryActions: Array<{ action: AuthorAiAction; label: string }> = [
    { action: 'summary', label: '章节摘要' },
    { action: 'outline', label: '大纲建议' },
    { action: 'polish', label: '润色建议' },
  ];
  const actionLabels: Record<AuthorAiAction, string> = {
    character: '人物设定',
    naming: 'AI 起名',
    inspiration: '灵感生成',
    research: 'AI 查询',
    summary: '章节摘要',
    outline: '大纲建议',
    polish: '润色建议',
    consistency: '一致性审校',
  };

  useEffect(() => {
    setResult(undefined);
    setError(undefined);
    setCopied(false);
    setQuery('');
  }, [chapter?.id]);

  useEffect(() => {
    setRagEvaluation(undefined);
  }, [novelId]);

  useEffect(() => {
    let active = true;
    setRagStatus(undefined);
    setRagError(undefined);
    if (!token || !novelId) {
      return () => {
        active = false;
      };
    }
    void api
      .getAuthorRagStatus(token, novelId)
      .then((status) => {
        if (active) setRagStatus(status);
      })
      .catch((err) => {
        if (active) setRagError(err instanceof Error ? err.message : '作品记忆库状态加载失败');
      });
    return () => {
      active = false;
    };
  }, [novelId, token]);

  async function reindexNovel() {
    if (!token || !novelId || isRagIndexing) return;
    setIsRagIndexing(true);
    setRagError(undefined);
    try {
      const result = await api.reindexAuthorNovel(token, novelId);
      setRagStatus(result.status);
    } catch (err) {
      setRagError(err instanceof Error ? err.message : '作品记忆库重建失败');
    } finally {
      setIsRagIndexing(false);
    }
  }

  async function evaluateNovel() {
    if (!token || !novelId || isRagEvaluating) return;
    setIsRagEvaluating(true);
    setRagError(undefined);
    try {
      const evaluation = await api.evaluateAuthorNovelRag(token, novelId);
      setRagEvaluation(evaluation);
      setRagStatus(evaluation.status);
    } catch (err) {
      setRagError(err instanceof Error ? err.message : '作品检索评测失败');
    } finally {
      setIsRagEvaluating(false);
    }
  }

  async function run(action: AuthorAiAction) {
    if (!token) {
      return;
    }
    if (action !== 'research' && content.trim().length < 20) {
      setError('请先准备至少 20 个字符的正文或创作思路。');
      return;
    }
    if (action === 'research' && query.trim().length === 0) {
      setError('请输入想查询的问题。');
      return;
    }

    setIsLoading(true);
    setError(undefined);
    setCopied(false);
    try {
      const payload = {
        action,
        title: title.trim() || '未命名章节',
        content:
          content.trim().length >= 20
            ? content
            : '当前章节尚未开始写作，作者正在进行与小说创作相关的资料查询。',
        query: action === 'research' ? query.trim() : undefined,
        novelId,
        beforeChapterOrder,
      };
      setResult(
        chapter
          ? await api.authorAiAssist(token, chapter.id, payload)
          : await api.authorAiAssistDraft(token, payload),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 辅助暂时不可用，请稍后重试。');
    } finally {
      setIsLoading(false);
    }
  }

  async function copyResult() {
    if (!result) {
      return;
    }
    try {
      await navigator.clipboard.writeText(result.content);
      setCopied(true);
    } catch {
      setError('复制失败，请手动选择建议内容。');
    }
  }

  return (
    <section className="author-ai-assistant" aria-label="AI 写作辅助">
      <div className="author-ai-heading">
        <div>
          <span className="author-ai-title">
            <Sparkles size={16} aria-hidden />
            AI 创作助手
          </span>
          <small>读取当前编辑区内容，但不会自动保存或发布。</small>
        </div>
      </div>
      {novelId && (
        <div className="author-ai-memory-status">
          <Database size={18} aria-hidden />
          <span>
            <strong>作品记忆库</strong>
            <small>
              {ragStatus
                ? ragStatus.enabled
                  ? `${ragStatus.indexedChapterCount}/${ragStatus.chapterCount} 章 · ${ragStatus.chunkCount} 个片段${ragStatus.pendingChapterCount ? ` · 待处理 ${ragStatus.pendingChapterCount}` : ''}`
                  : 'RAG 尚未启用'
                : '正在读取索引状态...'}
            </small>
          </span>
          <div className="author-ai-memory-actions">
            <button
              type="button"
              disabled={disabled || isRagIndexing || isRagEvaluating || !ragStatus?.enabled}
              onClick={() => void reindexNovel()}
            >
              <RefreshCcw size={14} aria-hidden />
              {isRagIndexing ? '增量同步中' : '同步索引'}
            </button>
            <button
              type="button"
              disabled={disabled || isRagIndexing || isRagEvaluating || !ragStatus?.enabled}
              onClick={() => void evaluateNovel()}
            >
              <BarChart3 size={14} aria-hidden />
              {isRagEvaluating ? '评测中' : '检索评测'}
            </button>
          </div>
        </div>
      )}
      {ragError && <p className="author-ai-memory-error">{ragError}</p>}
      {ragEvaluation && (
        <div className="author-ai-evaluation" aria-label="RAG 检索评测结果">
          <div className="author-ai-evaluation-heading">
            <span>
              <BarChart3 size={15} aria-hidden />
              检索质量快照
            </span>
            <small>抽样 {ragEvaluation.sampleSize} 章</small>
          </div>
          <div className="author-ai-evaluation-grid">
            {[
              ['Top 1', ragEvaluation.hitAt1],
              ['Top 3', ragEvaluation.hitAt3],
              ['Top 5', ragEvaluation.hitAt5],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <strong>
                  {ragEvaluation.evaluatedCases
                    ? `${Math.round((Number(value) / ragEvaluation.evaluatedCases) * 100)}%`
                    : '--'}
                </strong>
                <small>{label} 命中</small>
              </div>
            ))}
            <div>
              <strong>{ragEvaluation.averageRank ?? '--'}</strong>
              <small>平均排名</small>
            </div>
          </div>
          <p>
            {ragEvaluation.evaluatedCases
              ? `已完成 ${ragEvaluation.evaluatedCases} 个自检样本，Top 5 命中 ${ragEvaluation.hitAt5} 个。`
              : '当前没有可用于评测的已发布章节。'}
          </p>
        </div>
      )}
      <div className="author-ai-tool-grid" aria-label="AI 创作工具">
        {primaryActions.map(({ action, label, description, icon }) => (
          <button
            key={action}
            className="author-ai-tool"
            type="button"
            disabled={disabled || isLoading || !token}
            onClick={() => void run(action)}
          >
            <span>{icon}</span>
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
          </button>
        ))}
      </div>

      <div className="author-ai-query">
        <label htmlFor="author-ai-query">AI 查询</label>
        <textarea
          id="author-ai-query"
          maxLength={200}
          placeholder="例如：古代客栈通常如何称呼掌柜？"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          className="ghost-button"
          type="button"
          disabled={disabled || isLoading || !token}
          onClick={() => void run('research')}
        >
          <FileText size={16} aria-hidden />
          查询
        </button>
        <small>基于模型知识回答；涉及事实时请再次核验。</small>
      </div>

      <div className="author-ai-secondary-actions" aria-label="文本辅助工具">
        {secondaryActions.map(({ action, label }) => (
          <button
            key={action}
            type="button"
            disabled={disabled || isLoading || !token}
            onClick={() => void run(action)}
          >
            {label}
          </button>
        ))}
      </div>
      {isLoading && (
        <p className="author-ai-loading">
          <Sparkles size={15} aria-hidden /> 正在生成建议...
        </p>
      )}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="author-ai-result">
          <div className="author-ai-result-heading">
            <strong>{actionLabels[result.action]}</strong>
            <span>{result.model}</span>
          </div>
          <pre>{result.content}</pre>
          {result.sources && result.sources.length > 0 && (
            <div className="author-ai-sources">
              <div className="author-ai-sources-heading">
                <strong>引用前文</strong>
                <span>{result.sources.length} 条可追溯证据</span>
              </div>
              {result.sources.map((source, index) => (
                <a
                  key={`${source.chapterId}-${source.chunkIndex}`}
                  href={`${readerPortalUrl}/chapters/${source.chapterId}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>
                    <strong>
                      S{index + 1} · 第 {source.chapterOrder} 章
                      {source.title ? `《${source.title}》` : ''}
                    </strong>
                    <small>综合匹配 {(source.score * 100).toFixed(1)}%</small>
                  </span>
                  {source.excerpt && <p>{source.excerpt}</p>}
                </a>
              ))}
            </div>
          )}
          <div className="author-ai-result-actions">
            <button className="ghost-button" type="button" onClick={() => void copyResult()}>
              {copied ? '已复制' : '复制建议'}
            </button>
            {result.action !== 'consistency' && (
              <button className="ghost-button" type="button" onClick={() => onAppend(result.content)}>
                插入正文末尾
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function CreateChapterPanel({
  disabled,
  novel,
  volumes,
  token,
  onSaveDraft,
  onSubmit,
}: {
  disabled: boolean;
  novel?: AuthorNovel;
  volumes: NovelVolume[];
  token?: string;
  onSaveDraft(payload: ChapterPayload): Promise<void>;
  onSubmit(payload: ChapterPayload): Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [volumeId, setVolumeId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [localError, setLocalError] = useState<string>();
  const volumeIds = volumes.map((volume) => volume.id).join('|');

  useEffect(() => {
    setVolumeId((current) =>
      volumes.some((volume) => volume.id === current) ? current : (volumes[0]?.id ?? ''),
    );
  }, [novel?.id, volumeIds]);

  function buildPayload(): ChapterPayload {
    return {
      title: title.trim(),
      content: content.trim(),
      volumeId: volumeId || null,
      scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
    };
  }

  async function saveDraft() {
    const payload = buildPayload();
    const validationError = validateChapterDraftPayload(payload);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError(undefined);
    try {
      await onSaveDraft(payload);
      setTitle('');
      setContent('');
      setScheduledAt('');
    } catch {
      // The parent page shows the API error. Keep the draft intact for retry.
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = buildPayload();
    const validationError = validateChapterPayload(payload);
    if (validationError) {
      setLocalError(validationError);
      return;
    }

    setLocalError(undefined);
    try {
      await onSubmit(payload);
      setTitle('');
      setContent('');
      setScheduledAt('');
    } catch {
      // The parent page shows the API error. Keep the draft intact for retry.
    }
  }

  return (
    <form className="chapter-editor-form chapter-create-editor" onSubmit={submit}>
      <header className="chapter-editor-topbar">
        <div>
          <span className="chapter-editor-kicker">新章节</span>
          <strong>{novel?.title ?? '请先选择作品'}</strong>
          <small>第 {(novel?._count.chapters ?? 0) + 1} 章</small>
        </div>
        <div className="chapter-editor-top-actions">
          <span className="autosave-note">新章节将在保存草稿后进入自动保存</span>
          <button
            className="ghost-button"
            disabled={disabled || !novel}
            type="button"
            onClick={() => void saveDraft()}
          >
            <Save size={16} aria-hidden />
            保存草稿
          </button>
          <button className="primary-link" disabled={disabled || !novel} type="submit">
            <Send size={16} aria-hidden />
            提交审核
          </button>
        </div>
      </header>

      <main className="chapter-writing-surface">
        <div className="chapter-editor-meta">
          <label>
            <span>所属分卷</span>
            <select
              disabled={disabled || !novel}
              value={volumeId}
              onChange={(event) => setVolumeId(event.target.value)}
            >
              <option value="">未分卷</option>
              {volumes.map((volume) => (
                <option key={volume.id} value={volume.id}>
                  {volume.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>定时发布</span>
            <input
              type="datetime-local"
              min={minimumScheduleValue()}
              disabled={disabled || !novel}
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
            />
          </label>
          <small>留空表示审核通过后立即发布</small>
        </div>

        <div className="chapter-title-editor">
          <span>第 {(novel?._count.chapters ?? 0) + 1} 章</span>
          <input
            aria-label="章节标题"
            required
            disabled={disabled || !novel}
            maxLength={80}
            placeholder="请输入章节标题"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <label className="chapter-content-field">
          <textarea
            aria-label="章节正文"
            disabled={disabled || !novel}
            placeholder="从这里开始写正文……"
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          <span className="chapter-word-count">{content.trim().length} 字</span>
        </label>
        {localError && (
          <p className="auth-error" role="alert">
            {localError}
          </p>
        )}
      </main>
      <AuthorAiAssistant
        novelId={novel?.id}
        beforeChapterOrder={novel?._count.chapters ?? 0}
        token={token}
        title={title}
        content={content}
        disabled={disabled || !novel}
        onAppend={(suggestion) => {
          setContent((current) => `${current.trimEnd()}\n\n${suggestion.trim()}`.trim());
        }}
      />
    </form>
  );
}

function CoverPicker({
  coverUrl,
  disabled,
  label,
  title,
  token,
  onChange,
}: {
  coverUrl: string;
  disabled: boolean;
  label: string;
  title: string;
  token?: string;
  onChange(coverUrl: string): void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>();

  async function uploadCover(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setUploadError(undefined);

    if (!file || !token) {
      return;
    }

    if (!coverTypes.has(file.type)) {
      setUploadError('只支持 JPG、PNG 或 WebP 图片');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setUploadError('封面图片不能超过 2MB');
      return;
    }

    setIsUploading(true);
    try {
      const result = await api.uploadCover(token, {
        fileName: file.name,
        contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
        dataUrl: await readFileAsDataUrl(file),
      });
      onChange(result.url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : '封面上传失败');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <>
      <div className="cover-uploader">
        <NovelCover novel={{ title, coverUrl }} />
        <label className="ghost-button">
          <ImagePlus size={16} aria-hidden />
          {isUploading ? '上传中...' : label}
          <input
            accept="image/jpeg,image/png,image/webp"
            disabled={disabled || isUploading}
            type="file"
            onChange={uploadCover}
          />
        </label>
      </div>
      {uploadError && (
        <p className="auth-error" role="alert">
          {uploadError}
        </p>
      )}
    </>
  );
}

function RejectionNote({ reason }: { reason?: string | null }) {
  return <span className="rejection-note">驳回原因：{displayReviewReason(reason)}</span>;
}

function AutoSaveNote({ state }: { state: AutoSaveState }) {
  if (state === 'idle') {
    return null;
  }

  const text: Record<AutoSaveState, string> = {
    idle: '',
    dirty: '已修改，等待自动保存',
    saving: '正在自动保存...',
    saved: '草稿已自动保存',
    error: '自动保存失败，请手动保存',
  };

  return (
    <p className="autosave-note" data-state={state} aria-live="polite">
      {text[state]}
    </p>
  );
}

function AuthorOnboardingView({
  application,
  emailVerified,
  isLoading,
  message,
  error,
  nickname,
  onRefresh,
  onSubmit,
}: {
  application?: AuthorApplication | null;
  emailVerified: boolean;
  isLoading: boolean;
  message?: string;
  error?: string;
  nickname: string;
  onRefresh(): void;
  onSubmit(payload: { penName: string; bio?: string; statement: string }): Promise<void>;
}) {
  const [penName, setPenName] = useState('');
  const [bio, setBio] = useState('');
  const [statement, setStatement] = useState('');
  const [localError, setLocalError] = useState<string>();

  useEffect(() => {
    setPenName(application?.penName ?? nickname);
    setBio(application?.bio ?? '');
    setStatement(application?.statement ?? '');
    setLocalError(undefined);
  }, [application?.id, application?.updatedAt, nickname]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPenName = penName.trim();
    const normalizedStatement = statement.trim();
    if (normalizedPenName.length < 2) {
      setLocalError('笔名至少需要 2 个字符');
      return;
    }
    if (normalizedStatement.length < 20) {
      setLocalError('申请说明至少需要 20 个字符');
      return;
    }
    setLocalError(undefined);
    await onSubmit({
      penName: normalizedPenName,
      bio: bio.trim() || undefined,
      statement: normalizedStatement,
    });
  }

  const pending = application?.status === 'PENDING';
  const approved = application?.status === 'APPROVED';

  return (
    <section className="author-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">作者入驻</p>
          <h1>申请成为作者</h1>
        </div>
        <button className="ghost-button" type="button" disabled={isLoading} onClick={onRefresh}>
          <RefreshCcw size={16} aria-hidden />
          刷新状态
        </button>
      </header>

      {(error || message) && (
        <div className={error ? 'auth-error' : 'auth-message'} role={error ? 'alert' : 'status'}>
          {error || message}
        </div>
      )}

      {!emailVerified ? (
        <section className="panel author-onboarding-status">
          <h2>请先验证邮箱</h2>
          <p>完成邮箱验证后才能提交作者申请。</p>
          <Link className="primary-link" to="/settings">
            前往账号设置
          </Link>
        </section>
      ) : pending || approved ? (
        <section className="panel author-onboarding-status">
          <BadgeCheck size={26} aria-hidden />
          <h2>{pending ? '申请审核中' : '申请已通过'}</h2>
          <p>
            笔名：{application?.penName}
            {application?.updatedAt
              ? ` · ${new Date(application.updatedAt).toLocaleString('zh-CN')}`
              : ''}
          </p>
          {approved && (
            <button className="primary-link" type="button" onClick={onRefresh}>
              进入作者工作台
            </button>
          )}
        </section>
      ) : (
        <form className="panel author-form author-onboarding-form" onSubmit={submit}>
          <div className="section-title">
            <h2>{application?.status === 'REJECTED' ? '重新提交申请' : '作者申请'}</h2>
            <BadgeCheck size={18} aria-hidden />
          </div>
          {application?.status === 'REJECTED' && (
            <p className="rejection-note">
              驳回原因：{displayReviewReason(application.reviewReason)}
            </p>
          )}
          <label>
            笔名
            <input
              required
              minLength={2}
              maxLength={30}
              value={penName}
              onChange={(event) => setPenName(event.target.value)}
            />
          </label>
          <label>
            作者简介
            <textarea
              maxLength={500}
              value={bio}
              onChange={(event) => setBio(event.target.value)}
            />
          </label>
          <label>
            申请说明
            <textarea
              required
              minLength={20}
              maxLength={500}
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
            />
          </label>
          {localError && (
            <p className="auth-error" role="alert">
              {localError}
            </p>
          )}
          <button className="primary-link" type="submit" disabled={isLoading}>
            <Send size={16} aria-hidden />
            {isLoading ? '提交中...' : '提交申请'}
          </button>
        </form>
      )}
    </section>
  );
}

function AuthorProfilePanel({
  profile,
  fallbackPenName,
  disabled,
  onSave,
}: {
  profile?: AuthorProfile | null;
  fallbackPenName: string;
  disabled: boolean;
  onSave(payload: { penName: string; bio?: string }): Promise<void>;
}) {
  const [penName, setPenName] = useState('');
  const [bio, setBio] = useState('');
  const [localError, setLocalError] = useState<string>();

  useEffect(() => {
    setPenName(profile?.penName ?? fallbackPenName);
    setBio(profile?.bio ?? '');
    setLocalError(undefined);
  }, [fallbackPenName, profile?.id, profile?.updatedAt]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (penName.trim().length < 2) {
      setLocalError('笔名至少需要 2 个字符');
      return;
    }
    setLocalError(undefined);
    await onSave({ penName: penName.trim(), bio: bio.trim() || undefined });
  }

  return (
    <form className="panel author-form author-profile-form" onSubmit={submit}>
      <div className="section-title">
        <h2>作者资料</h2>
        <BadgeCheck size={18} aria-hidden />
      </div>
      <div className="author-profile-fields">
        <label>
          笔名
          <input
            required
            minLength={2}
            maxLength={30}
            value={penName}
            onChange={(event) => setPenName(event.target.value)}
          />
        </label>
        <label>
          作者简介
          <textarea maxLength={500} value={bio} onChange={(event) => setBio(event.target.value)} />
        </label>
      </div>
      {localError && (
        <p className="auth-error" role="alert">
          {localError}
        </p>
      )}
      <button className="ghost-button" type="submit" disabled={disabled}>
        <Save size={16} aria-hidden />
        保存作者资料
      </button>
    </form>
  );
}

function AuthorState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="empty-state author-gateway-state">
      <div className="author-gateway-mark" aria-hidden>
        <BookOpen size={30} />
      </div>
      <p className="eyebrow">AUTHOR STUDIO</p>
      <h1>{title}</h1>
      <p>在阅界创作中心管理作品、编排章节，并使用 AI 与知识库辅助长篇创作。</p>
      <div className="author-gateway-features" aria-hidden>
        <span><PencilLine size={14} />沉浸写作</span>
        <span><Sparkles size={14} />AI 辅助</span>
        <span><Database size={14} />作品知识库</span>
      </div>
      <div className="author-gateway-actions">{children}</div>
    </section>
  );
}

function validateNovelPayload(payload: NovelPayload) {
  const draftError = validateNovelDraftPayload(payload);
  if (draftError) {
    return draftError;
  }

  if (payload.summary.length < 10) {
    return '简介至少需要 10 个字';
  }

  return undefined;
}

function validateNovelDraftPayload(payload: NovelPayload) {
  if (payload.title.length < 2) {
    return '书名至少需要 2 个字';
  }

  if (!payload.categoryId) {
    return '请选择分类';
  }

  return undefined;
}

function displayReviewReason(reason?: string | null) {
  const normalized = reason?.trim();
  if (!normalized || /^[?\s]+$/.test(normalized)) {
    return '未填写具体原因';
  }

  return normalized;
}

function validateChapterPayload(payload: ChapterPayload) {
  const draftError = validateChapterDraftPayload(payload);
  if (draftError) {
    return draftError;
  }

  if (payload.content.length < 20) {
    return '正文至少需要 20 个字';
  }

  return undefined;
}

function validateChapterDraftPayload(payload: ChapterPayload) {
  if (payload.title.length < 1) {
    return '章节标题不能为空';
  }

  if (payload.scheduledAt && new Date(payload.scheduledAt).getTime() <= Date.now()) {
    return '定时发布时间必须晚于当前时间';
  }

  return undefined;
}

function normalizeTags(tags: string) {
  return tags
    .split(/[,，\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatDashboardNumber(value: number) {
  if (value >= 10000) {
    const unitValue = value / 10000;
    return `${unitValue >= 100 ? Math.round(unitValue) : unitValue.toFixed(1).replace(/\.0$/, '')} 万`;
  }
  return value.toLocaleString('zh-CN');
}

function statusText(status: string) {
  const statuses: Record<string, string> = {
    DRAFT: '草稿',
    REVIEWING: '审核中',
    REJECTED: '已驳回',
    SERIALIZING: '连载中',
    COMPLETED: '已完结',
    HIDDEN: '已隐藏',
    PUBLISHED: '已发布',
    SCHEDULED: '待定时发布',
  };
  return statuses[status] ?? status;
}

function chapterVersionSourceText(source: ChapterVersion['source']) {
  const sources: Record<ChapterVersion['source'], string> = {
    MANUAL: '手动保存前',
    AUTOSAVE: '自动保存前',
    SUBMIT: '提交审核前',
    RESTORE: '恢复历史前',
  };
  return sources[source];
}

function chapterVersionPreview(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '空白正文';
  }
  return normalized.length > 110 ? `${normalized.slice(0, 110)}...` : normalized;
}

function toDateTimeLocal(value?: string | null) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function minimumScheduleValue() {
  return toDateTimeLocal(new Date(Date.now() + 60_000).toISOString());
}

function formatScheduledAt(value: string) {
  return `计划 ${new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })} 发布`;
}

function formatAnnouncementTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function currentMonthValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function shiftCalendarMonth(month: string, delta: number) {
  const [year, monthNumber] = month.split('-').map(Number);
  const shifted = new Date(year, monthNumber - 1 + delta, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}`;
}

function formatCalendarMonth(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  return `${year} 年 ${monthNumber} 月`;
}

function defaultCalendarDateTime(month: string) {
  const now = new Date();
  const target =
    month === currentMonthValue()
      ? new Date(now.getTime() + 60 * 60 * 1000)
      : new Date(`${month}-01T10:00:00`);
  return toDateTimeLocal(target.toISOString());
}

function localDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;
}

function buildCalendarCells(month: string) {
  const [year, monthNumber] = month.split('-').map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const start = new Date(year, monthNumber - 1, 1 - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      key: localDateKey(date),
      day: date.getDate(),
      inMonth: date.getMonth() === monthNumber - 1,
    };
  });
}

function calendarSourceClass(source: AuthorCalendarEvent['source']) {
  const classes: Record<AuthorCalendarEvent['source'], string> = {
    PLAN: 'plan',
    CHAPTER_SCHEDULED: 'scheduled',
    CHAPTER_PUBLISHED: 'published',
  };
  return classes[source];
}

function calendarSourceText(
  source: AuthorCalendarEvent['source'],
  type: AuthorCalendarEvent['type'],
) {
  if (source === 'CHAPTER_SCHEDULED') {
    return '计划发布';
  }
  if (source === 'CHAPTER_PUBLISHED') {
    return '实际发布';
  }
  const types: Record<Exclude<AuthorCalendarEventType, 'CHAPTER'>, string> = {
    WRITING: '写作',
    REVISION: '修订',
    REMINDER: '提醒',
  };
  return type === 'CHAPTER' ? '章节' : types[type];
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(new Error('读取封面失败')));
    reader.readAsDataURL(file);
  });
}
