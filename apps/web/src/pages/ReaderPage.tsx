import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  BookOpenCheck,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock3,
  Flag,
  Heart,
  Highlighter,
  List,
  MessageCircle,
  MessageSquareText,
  Minus,
  Plus,
  Reply,
  Save,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import type {
  AnnotationColor,
  Chapter,
  ChapterSummary,
  NovelComment,
  PaginatedComments,
  PaginatedParagraphComments,
  ParagraphComment,
  ParagraphCommentSummary,
  ParagraphReportReason,
  ReadingAnnotation,
  NovelReadStatus,
  ReadingPreference,
  ReadingTheme,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { CommentReportForm } from '../components/CommentReportForm';
import type { CommentReportTarget } from '../components/CommentReportForm';
import { ContentReportForm } from '../components/ContentReportForm';
import { NovelCommentThread, updateNovelCommentItems } from '../components/NovelCommentThread';
import { formatReadingDuration, formatWordCount } from '../utils/format';

const localPreferenceKey = 'novel-reading-preference';
const defaultPreference: ReadingPreference = {
  fontSize: 18,
  theme: 'LIGHT',
  lineHeight: 1.9,
  contentWidth: 760,
};
const defaultReadStatus: NovelReadStatus = {
  currentChapterId: null,
  currentProgress: 0,
  completedChapterIds: [],
  completedCount: 0,
  totalChapters: 0,
  isCaughtUp: false,
  lastCompletedAt: null,
};
const lineHeightOptions = [1.6, 1.9, 2.2] as const;
const contentWidthOptions = [680, 760, 880] as const;
const themeOptions: Array<{ value: ReadingTheme; label: string }> = [
  { value: 'LIGHT', label: '浅色' },
  { value: 'SEPIA', label: '护眼' },
  { value: 'DARK', label: '深色' },
];
const annotationColorOptions: Array<{ value: AnnotationColor; label: string }> = [
  { value: 'YELLOW', label: '黄色' },
  { value: 'GREEN', label: '绿色' },
  { value: 'BLUE', label: '蓝色' },
  { value: 'PINK', label: '粉色' },
];
const paragraphReportOptions: Array<{ value: ParagraphReportReason; label: string }> = [
  { value: 'SPAM', label: '垃圾广告' },
  { value: 'ABUSE', label: '攻击辱骂' },
  { value: 'SPOILER', label: '恶意剧透' },
  { value: 'OTHER', label: '其他问题' },
];

type PreferenceStatus = 'idle' | 'saving' | 'saved' | 'local' | 'error';
type ReaderDrawerView = 'chapters' | 'annotations';

interface SelectionDraft {
  paragraphIndex: number;
  startOffset: number;
  endOffset: number;
  selectedText: string;
}

export function ReaderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, isAuthenticated, user } = useAuth();
  const [chapter, setChapter] = useState<Chapter>();
  const [chapters, setChapters] = useState<ChapterSummary[]>([]);
  const [preference, setPreference] = useState<ReadingPreference>(defaultPreference);
  const [isPreferenceReady, setIsPreferenceReady] = useState(false);
  const [preferenceStatus, setPreferenceStatus] = useState<PreferenceStatus>('idle');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogOrder, setCatalogOrder] = useState<'asc' | 'desc'>('asc');
  const [drawerView, setDrawerView] = useState<ReaderDrawerView>('chapters');
  const [progress, setProgress] = useState(0);
  const [readStatus, setReadStatus] = useState<NovelReadStatus>(defaultReadStatus);
  const [restoreProgress, setRestoreProgress] = useState<number>();
  const [hasRestoredProgress, setHasRestoredProgress] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [lastSavedProgress, setLastSavedProgress] = useState<number>();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [totalReadingSeconds, setTotalReadingSeconds] = useState(0);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isBookmarkSaving, setIsBookmarkSaving] = useState(false);
  const [chapterComments, setChapterComments] = useState<PaginatedComments>(() => emptyComments());
  const [chapterCommentText, setChapterCommentText] = useState('');
  const [chapterReplyingToId, setChapterReplyingToId] = useState<string>();
  const [chapterReplyText, setChapterReplyText] = useState('');
  const [isChapterReplySubmitting, setIsChapterReplySubmitting] = useState(false);
  const [chapterCommentActionId, setChapterCommentActionId] = useState<string>();
  const [isSubmittingChapterComment, setIsSubmittingChapterComment] = useState(false);
  const [isLoadingMoreChapterComments, setIsLoadingMoreChapterComments] = useState(false);
  const [chapterCommentMessage, setChapterCommentMessage] = useState<string>();
  const [reportingComment, setReportingComment] = useState<NovelComment>();
  const [commentReportTarget, setCommentReportTarget] = useState<CommentReportTarget>('comment');
  const [commentReportReason, setCommentReportReason] = useState<ParagraphReportReason>('SPAM');
  const [commentReportDetail, setCommentReportDetail] = useState('');
  const [isCommentReportSubmitting, setIsCommentReportSubmitting] = useState(false);
  const [isChapterReportOpen, setIsChapterReportOpen] = useState(false);
  const [chapterReportReason, setChapterReportReason] = useState<ParagraphReportReason>('OTHER');
  const [chapterReportDetail, setChapterReportDetail] = useState('');
  const [isChapterReportSubmitting, setIsChapterReportSubmitting] = useState(false);
  const [paragraphCommentSummary, setParagraphCommentSummary] = useState<ParagraphCommentSummary>({
    items: [],
    total: 0,
  });
  const [paragraphComments, setParagraphComments] = useState<PaginatedParagraphComments>();
  const [activeParagraphIndex, setActiveParagraphIndex] = useState<number>();
  const [isParagraphCommentsOpen, setIsParagraphCommentsOpen] = useState(false);
  const [isParagraphCommentsLoading, setIsParagraphCommentsLoading] = useState(false);
  const [isParagraphCommentsLoadingMore, setIsParagraphCommentsLoadingMore] = useState(false);
  const [paragraphCommentText, setParagraphCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<ParagraphComment>();
  const [isParagraphCommentSubmitting, setIsParagraphCommentSubmitting] = useState(false);
  const [paragraphCommentMessage, setParagraphCommentMessage] = useState<string>();
  const [paragraphCommentActionId, setParagraphCommentActionId] = useState<string>();
  const [paragraphCommentDeletePendingId, setParagraphCommentDeletePendingId] = useState<string>();
  const [reportingParagraphComment, setReportingParagraphComment] = useState<ParagraphComment>();
  const [paragraphReportReason, setParagraphReportReason] = useState<ParagraphReportReason>('SPAM');
  const [paragraphReportDetail, setParagraphReportDetail] = useState('');
  const [isParagraphReportSubmitting, setIsParagraphReportSubmitting] = useState(false);
  const [annotations, setAnnotations] = useState<ReadingAnnotation[]>([]);
  const [selectionDraft, setSelectionDraft] = useState<SelectionDraft>();
  const [annotationColor, setAnnotationColor] = useState<AnnotationColor>('YELLOW');
  const [annotationNote, setAnnotationNote] = useState('');
  const [editingAnnotation, setEditingAnnotation] = useState<ReadingAnnotation>();
  const [isAnnotationEditorOpen, setIsAnnotationEditorOpen] = useState(false);
  const [isAnnotationSaving, setIsAnnotationSaving] = useState(false);
  const [isAnnotationDeletePending, setIsAnnotationDeletePending] = useState(false);
  const [annotationMessage, setAnnotationMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const lastSyncedPreference = useRef(serializePreference(defaultPreference));
  const readerContentRef = useRef<HTMLDivElement>(null);
  const catalogButtonRef = useRef<HTMLButtonElement>(null);
  const catalogPanelRef = useRef<HTMLElement>(null);
  const catalogSearchRef = useRef<HTMLInputElement>(null);
  const catalogListRef = useRef<HTMLDivElement>(null);
  const currentChapterRef = useRef<HTMLAnchorElement>(null);
  const annotationEditorRef = useRef<HTMLFormElement>(null);
  const paragraphCommentsPanelRef = useRef<HTMLElement>(null);
  const paragraphCommentInputRef = useRef<HTMLTextAreaElement>(null);
  const progressRef = useRef(0);
  const pendingReadingSecondsRef = useRef(0);
  const isReadingTimeSavingRef = useRef(false);
  const activeReadingChapterIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!id) {
      return;
    }

    const chapterId = id;
    let isMounted = true;

    async function load() {
      setIsLoading(true);
      setIsPreferenceReady(false);
      setHasRestoredProgress(false);
      setRestoreProgress(undefined);
      setError(undefined);
      try {
        const data = await api.getChapter(chapterId);
        const [
          chapterList,
          loadedPreference,
          history,
          novelReadStatus,
          bookmark,
          commentList,
          annotationList,
          paragraphSummary,
        ] = await Promise.all([
          api.listChapters(data.novel.id),
          token ? api.getReadingPreference(token) : Promise.resolve(readLocalPreference()),
          token ? api.getReadingHistory(token, data.novel.id) : Promise.resolve(null),
          token ? api.getNovelReadStatus(token, data.novel.id) : Promise.resolve(undefined),
          token ? api.getChapterBookmark(token, chapterId) : Promise.resolve(null),
          api
            .listChapterComments(chapterId, { page: 1, pageSize: 8 }, token)
            .catch(() => emptyComments()),
          token ? api.listChapterAnnotations(token, chapterId) : Promise.resolve([]),
          api
            .getParagraphCommentSummary(chapterId)
            .catch(() => ({ items: [], total: 0 }) as ParagraphCommentSummary),
        ]);

        if (isMounted) {
          const normalizedPreference = normalizePreference(loadedPreference);
          const savedProgress = history?.chapterId === chapterId ? history.progress : 0;

          setChapter(data);
          setChapters(chapterList);
          setPreference(normalizedPreference);
          lastSyncedPreference.current = serializePreference(normalizedPreference);
          window.localStorage.setItem(localPreferenceKey, JSON.stringify(normalizedPreference));
          setPreferenceStatus(token ? 'saved' : 'local');
          setIsPreferenceReady(true);
          setProgress(savedProgress);
          setReadStatus(
            novelReadStatus ?? {
              ...defaultReadStatus,
              totalChapters: chapterList.length,
            },
          );
          setLastSavedProgress(history?.chapterId === chapterId ? savedProgress : undefined);
          setSessionSeconds(0);
          setTotalReadingSeconds(history?.readingSeconds ?? 0);
          setRestoreProgress(savedProgress);
          setSaveStatus('idle');
          setIsBookmarked(Boolean(bookmark));
          setChapterComments(commentList);
          setChapterReplyingToId(undefined);
          setChapterReplyText('');
          setAnnotations(annotationList);
          setParagraphCommentSummary(paragraphSummary);
          setParagraphComments(undefined);
          setActiveParagraphIndex(undefined);
          setIsParagraphCommentsOpen(false);
          setParagraphCommentText('');
          setReplyingTo(undefined);
          setReportingParagraphComment(undefined);
          setParagraphReportDetail('');
          setParagraphCommentMessage(undefined);
          setSelectionDraft(undefined);
          setEditingAnnotation(undefined);
          setIsAnnotationEditorOpen(false);
          setAnnotationMessage(undefined);
          setChapterCommentText('');
          setChapterCommentMessage(undefined);
          setReportingComment(undefined);
          setCommentReportDetail('');
          setMessage(undefined);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : '加载失败');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [id, token]);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    setIsCatalogOpen(false);
    setCatalogQuery('');
  }, [id]);

  useEffect(() => {
    if (!isCatalogOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      if (drawerView === 'chapters') {
        catalogSearchRef.current?.focus();
      } else {
        catalogPanelRef.current
          ?.querySelector<HTMLElement>(
            '.reader-drawer-annotation-list button, .reader-drawer-tabs button',
          )
          ?.focus();
      }
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCatalog();
        return;
      }

      if (event.key !== 'Tab' || !catalogPanelRef.current) {
        return;
      }

      const focusable = Array.from(
        catalogPanelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled])',
        ),
      ).filter((element) => !element.hasAttribute('hidden'));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerView, isCatalogOpen]);

  useEffect(() => {
    if (!isAnnotationEditorOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleEditorKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeAnnotationTools();
        return;
      }

      if (event.key !== 'Tab' || !annotationEditorRef.current) {
        return;
      }

      const focusable = Array.from(
        annotationEditorRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled])',
        ),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleEditorKeyDown);
    return () => {
      document.removeEventListener('keydown', handleEditorKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isAnnotationEditorOpen]);

  useEffect(() => {
    if (!isParagraphCommentsOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      const focusTarget = isAuthenticated
        ? paragraphCommentInputRef.current
        : paragraphCommentsPanelRef.current?.querySelector<HTMLElement>('button');
      focusTarget?.focus();
    });

    function handleParagraphPanelKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeParagraphComments();
        return;
      }

      if (event.key !== 'Tab' || !paragraphCommentsPanelRef.current) {
        return;
      }

      const focusable = Array.from(
        paragraphCommentsPanelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), textarea:not([disabled])',
        ),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        return;
      }

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleParagraphPanelKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleParagraphPanelKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isAuthenticated, isParagraphCommentsOpen]);

  useEffect(() => {
    if (!chapter) {
      return;
    }

    const paragraphParam = new URLSearchParams(window.location.search).get('paragraph');
    if (paragraphParam === null) {
      return;
    }

    const paragraphIndex = Number(paragraphParam);
    if (
      Number.isInteger(paragraphIndex) &&
      paragraphIndex >= 0 &&
      paragraphIndex < chapter.content.split(/\n+/).length
    ) {
      void openParagraphComments(paragraphIndex);
    }
  }, [chapter?.id]);

  useEffect(() => {
    if (isLoading || !chapter || restoreProgress === undefined) {
      return;
    }

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const range = getReadingScrollRange(readerContentRef.current);
        const top =
          restoreProgress > 0
            ? range.start + (range.end - range.start) * (restoreProgress / 100)
            : 0;
        window.scrollTo({ top, behavior: 'auto' });
        setProgress(restoreProgress);
        setHasRestoredProgress(true);
        setRestoreProgress(undefined);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [chapter, isLoading, restoreProgress]);

  useEffect(() => {
    if (!chapter || !hasRestoredProgress) {
      return;
    }

    function updateProgress() {
      const range = getReadingScrollRange(readerContentRef.current);
      if (range.end <= range.start) {
        return;
      }
      setProgress(
        Math.max(
          0,
          Math.min(
            100,
            Math.round(((window.scrollY - range.start) / (range.end - range.start)) * 100),
          ),
        ),
      );
    }

    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);

    return () => {
      window.removeEventListener('scroll', updateProgress);
      window.removeEventListener('resize', updateProgress);
    };
  }, [
    chapter,
    hasRestoredProgress,
    preference.contentWidth,
    preference.fontSize,
    preference.lineHeight,
  ]);

  useEffect(() => {
    if (!isPreferenceReady) {
      return;
    }

    const serialized = serializePreference(preference);
    if (serialized === lastSyncedPreference.current) {
      return;
    }

    window.localStorage.setItem(localPreferenceKey, JSON.stringify(preference));
    if (!token) {
      lastSyncedPreference.current = serialized;
      setPreferenceStatus('local');
      return;
    }

    setPreferenceStatus('saving');
    const timer = window.setTimeout(() => {
      api
        .updateReadingPreference(token, preference)
        .then(() => {
          lastSyncedPreference.current = serialized;
          setPreferenceStatus('saved');
        })
        .catch(() => setPreferenceStatus('error'));
    }, 650);

    return () => window.clearTimeout(timer);
  }, [isPreferenceReady, preference, token]);

  const adjacentChapters = useMemo(() => {
    if (!chapter) {
      return { previous: undefined, next: undefined };
    }

    const index = chapters.findIndex((item) => item.id === chapter.id);
    return {
      previous: index > 0 ? chapters[index - 1] : undefined,
      next: index >= 0 && index < chapters.length - 1 ? chapters[index + 1] : undefined,
    };
  }, [chapter, chapters]);

  const completedChapterIds = useMemo(
    () => new Set(readStatus.completedChapterIds),
    [readStatus.completedChapterIds],
  );
  const isCurrentChapterCompleted = chapter ? completedChapterIds.has(chapter.id) : false;

  const markChapterCompletedLocally = useCallback((chapterId: string) => {
    setReadStatus((current) => {
      if (current.completedChapterIds.includes(chapterId)) {
        return {
          ...current,
          currentChapterId: chapterId,
          currentProgress: 100,
        };
      }

      const completedChapterIds = [...current.completedChapterIds, chapterId];
      const completedCount = completedChapterIds.length;
      return {
        ...current,
        currentChapterId: chapterId,
        currentProgress: 100,
        completedChapterIds,
        completedCount,
        isCaughtUp: current.totalChapters > 0 && completedCount >= current.totalChapters,
        lastCompletedAt: new Date().toISOString(),
      };
    });
  }, []);

  const filteredChapters = useMemo(() => {
    const query = catalogQuery.trim().toLocaleLowerCase('zh-CN');
    const matches = query
      ? chapters.filter(
          (item) =>
            item.title.toLocaleLowerCase('zh-CN').includes(query) ||
            item.volume?.title.toLocaleLowerCase('zh-CN').includes(query) ||
            String(item.orderIndex).includes(query),
        )
      : chapters;

    return catalogOrder === 'asc' ? matches : [...matches].reverse();
  }, [catalogOrder, catalogQuery, chapters]);

  const sortedAnnotations = useMemo(
    () =>
      [...annotations].sort(
        (left, right) =>
          left.paragraphIndex - right.paragraphIndex || left.startOffset - right.startOffset,
      ),
    [annotations],
  );

  const annotationsByParagraph = useMemo(() => {
    const grouped = new Map<number, ReadingAnnotation[]>();
    sortedAnnotations.forEach((annotation) => {
      const current = grouped.get(annotation.paragraphIndex) ?? [];
      current.push(annotation);
      grouped.set(annotation.paragraphIndex, current);
    });
    return grouped;
  }, [sortedAnnotations]);

  const paragraphCommentCounts = useMemo(
    () =>
      new Map(
        paragraphCommentSummary.items.map((item) => [item.paragraphIndex, item.count] as const),
      ),
    [paragraphCommentSummary],
  );

  useEffect(() => {
    if (
      !isCatalogOpen ||
      drawerView !== 'chapters' ||
      catalogQuery.trim() ||
      !currentChapterRef.current
    ) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const list = catalogListRef.current;
      const current = currentChapterRef.current;
      if (list && current) {
        list.scrollTop = Math.max(
          0,
          current.offsetTop - list.clientHeight / 2 + current.clientHeight / 2,
        );
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [catalogOrder, catalogQuery, chapter?.id, drawerView, isCatalogOpen]);

  const persistProgress = useCallback(
    async (progressValue: number, options: { silent?: boolean } = {}) => {
      if (!token || !chapter) {
        if (!options.silent) {
          setMessage('登录后可保存阅读进度');
        }
        return false;
      }

      setIsSaving(true);
      setSaveStatus('saving');
      if (!options.silent) {
        setMessage(undefined);
      }
      try {
        await api.saveReadingHistory(token, {
          novelId: chapter.novel.id,
          chapterId: chapter.id,
          progress: progressValue,
        });
        setLastSavedProgress(progressValue);
        setSaveStatus('saved');
        if (progressValue === 100) {
          markChapterCompletedLocally(chapter.id);
        } else {
          setReadStatus((current) => ({
            ...current,
            currentChapterId: chapter.id,
            currentProgress: progressValue,
          }));
        }
        if (!options.silent) {
          setMessage('阅读进度已保存');
        }
        return true;
      } catch (err) {
        setSaveStatus('idle');
        if (!options.silent) {
          setMessage(err instanceof Error ? err.message : '保存失败');
        }
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [chapter, markChapterCompletedLocally, token],
  );

  const flushReadingTime = useCallback(
    async (keepalive = false) => {
      if (!token || !chapter || isReadingTimeSavingRef.current) {
        return;
      }

      const seconds = Math.min(300, pendingReadingSecondsRef.current);
      if (seconds <= 0) {
        return;
      }

      const chapterId = chapter.id;
      pendingReadingSecondsRef.current -= seconds;
      isReadingTimeSavingRef.current = true;
      try {
        const history = await api.saveReadingSession(
          token,
          {
            novelId: chapter.novel.id,
            chapterId,
            progress: progressRef.current,
            seconds,
          },
          keepalive,
        );
        setTotalReadingSeconds((current) => Math.max(current, history.readingSeconds));
        setLastSavedProgress(history.progress);
        setSaveStatus('saved');
        if (history.isChapterCompleted) {
          markChapterCompletedLocally(chapterId);
        }
      } catch {
        if (activeReadingChapterIdRef.current === chapterId) {
          pendingReadingSecondsRef.current += seconds;
        }
      } finally {
        isReadingTimeSavingRef.current = false;
      }
    },
    [chapter, markChapterCompletedLocally, token],
  );

  useEffect(() => {
    if (!chapter) {
      return;
    }

    activeReadingChapterIdRef.current = chapter.id;
    pendingReadingSecondsRef.current = 0;
    setSessionSeconds(0);

    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || !document.hasFocus()) {
        return;
      }

      pendingReadingSecondsRef.current += 1;
      setSessionSeconds((current) => current + 1);
      setTotalReadingSeconds((current) => current + 1);
      if (token && pendingReadingSecondsRef.current >= 30) {
        void flushReadingTime();
      }
    }, 1000);

    function flushWhenHidden() {
      if (document.visibilityState === 'hidden') {
        void flushReadingTime(true);
      }
    }

    function flushBeforeLeaving() {
      void flushReadingTime(true);
    }

    document.addEventListener('visibilitychange', flushWhenHidden);
    window.addEventListener('pagehide', flushBeforeLeaving);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      window.removeEventListener('pagehide', flushBeforeLeaving);
      void flushReadingTime(true);
    };
  }, [chapter, flushReadingTime, token]);

  useEffect(() => {
    if (!token || !chapter || !hasRestoredProgress || progress === lastSavedProgress) {
      return;
    }

    const timer = window.setTimeout(() => {
      void persistProgress(progress, { silent: true });
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [chapter, hasRestoredProgress, lastSavedProgress, persistProgress, progress, token]);

  async function saveProgress() {
    await persistProgress(progress);
  }

  function saveBeforeNavigation(completed = false) {
    const progressToSave = completed ? 100 : progress;
    void flushReadingTime();
    if (token && chapter && progressToSave !== lastSavedProgress) {
      void persistProgress(progressToSave, { silent: true });
    }
  }

  async function completeCurrentChapter() {
    if (!chapter || !token) {
      setMessage('登录后可记录章节已读状态');
      return;
    }

    setIsCompleting(true);
    setProgress(100);
    try {
      await flushReadingTime();
      const saved = await persistProgress(100, { silent: true });
      if (saved) {
        setMessage('本章已读，已追到最新章节');
      }
    } finally {
      setIsCompleting(false);
    }
  }

  async function completeAndGoNext() {
    if (!chapter || !adjacentChapters.next) {
      return;
    }

    const nextChapterId = adjacentChapters.next.id;
    setIsCompleting(true);
    setProgress(100);
    try {
      await flushReadingTime();
      if (token) {
        await persistProgress(100, { silent: true });
      }
      navigate(`/chapters/${nextChapterId}`);
    } finally {
      setIsCompleting(false);
    }
  }

  function toggleCatalog() {
    if (isCatalogOpen) {
      closeCatalog();
      return;
    }

    setIsSettingsOpen(false);
    closeParagraphComments();
    setIsCatalogOpen(true);
  }

  function closeCatalog(restoreFocus = true) {
    setIsCatalogOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => catalogButtonRef.current?.focus());
    }
  }

  async function toggleBookmark() {
    if (!token || !chapter) {
      setMessage('登录后可添加章节书签');
      return;
    }

    setIsBookmarkSaving(true);
    setMessage(undefined);
    try {
      if (isBookmarked) {
        await api.removeChapterBookmark(token, chapter.id);
        setIsBookmarked(false);
        setMessage('章节书签已移除');
      } else {
        await api.addChapterBookmark(token, chapter.id);
        setIsBookmarked(true);
        setMessage('章节书签已添加');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '书签操作失败');
    } finally {
      setIsBookmarkSaving(false);
    }
  }

  function startChapterReport() {
    if (!token) {
      setMessage('登录后可以举报章节');
      return;
    }
    if (chapter?.novel.author.id === user?.id) {
      setMessage('不能举报自己的章节');
      return;
    }
    setChapterReportReason('OTHER');
    setChapterReportDetail('');
    setIsChapterReportOpen(true);
  }

  async function submitChapterReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !chapter) return;
    setIsChapterReportSubmitting(true);
    setMessage(undefined);
    try {
      await api.reportContent(token, 'CHAPTER', chapter.id, {
        reason: chapterReportReason,
        ...(chapterReportDetail.trim() ? { detail: chapterReportDetail.trim() } : {}),
      });
      setIsChapterReportOpen(false);
      setChapterReportDetail('');
      setMessage('章节举报已提交，管理员会尽快处理');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '举报提交失败');
    } finally {
      setIsChapterReportSubmitting(false);
    }
  }

  function captureTextSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return;
    }

    if (!token) {
      setMessage('登录后可保存划线和批注');
      return;
    }

    const range = selection.getRangeAt(0);
    const startParagraph = findParagraphElement(range.startContainer);
    const endParagraph = findParagraphElement(range.endContainer);
    if (!startParagraph || startParagraph !== endParagraph) {
      setMessage('一次只能选择同一段落中的文字');
      return;
    }

    const paragraphIndex = Number(startParagraph.dataset.paragraphIndex);
    const startOffset = getTextOffset(startParagraph, range.startContainer, range.startOffset);
    const endOffset = getTextOffset(startParagraph, range.endContainer, range.endOffset);
    const paragraphText = startParagraph.textContent ?? '';
    const selectedText = paragraphText.slice(startOffset, endOffset);
    if (!Number.isInteger(paragraphIndex) || !selectedText || selectedText.length > 1000) {
      return;
    }

    closeParagraphComments();
    setSelectionDraft({ paragraphIndex, startOffset, endOffset, selectedText });
    setAnnotationColor('YELLOW');
    setAnnotationNote('');
    setEditingAnnotation(undefined);
    setIsAnnotationEditorOpen(false);
    setAnnotationMessage(undefined);
    selection.removeAllRanges();
  }

  async function createSelectedAnnotation(note?: string) {
    if (!token || !chapter || !selectionDraft) {
      return;
    }

    setIsAnnotationSaving(true);
    setAnnotationMessage(undefined);
    try {
      const created = await api.createAnnotation(token, chapter.id, {
        ...selectionDraft,
        color: annotationColor,
        ...(note?.trim() ? { note: note.trim() } : {}),
      });
      setAnnotations((current) => [...current, created]);
      setSelectionDraft(undefined);
      setIsAnnotationEditorOpen(false);
      setAnnotationNote('');
      setMessage(note?.trim() ? '批注已保存' : '划线已保存');
    } catch (err) {
      setAnnotationMessage(err instanceof Error ? err.message : '划线保存失败');
    } finally {
      setIsAnnotationSaving(false);
    }
  }

  function openNewAnnotationEditor() {
    closeParagraphComments();
    setEditingAnnotation(undefined);
    setAnnotationNote('');
    setIsAnnotationDeletePending(false);
    setIsAnnotationEditorOpen(true);
  }

  function openExistingAnnotation(annotation: ReadingAnnotation) {
    closeParagraphComments();
    setSelectionDraft(undefined);
    setEditingAnnotation(annotation);
    setAnnotationColor(annotation.color);
    setAnnotationNote(annotation.note ?? '');
    setAnnotationMessage(undefined);
    setIsAnnotationDeletePending(false);
    setIsAnnotationEditorOpen(true);
  }

  async function saveAnnotationEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }

    if (!editingAnnotation) {
      await createSelectedAnnotation(annotationNote);
      return;
    }

    setIsAnnotationSaving(true);
    setAnnotationMessage(undefined);
    try {
      const updated = await api.updateAnnotation(token, editingAnnotation.id, {
        note: annotationNote,
        color: annotationColor,
      });
      setAnnotations((current) =>
        current.map((annotation) => (annotation.id === updated.id ? updated : annotation)),
      );
      setEditingAnnotation(updated);
      setMessage('批注已更新');
      setIsAnnotationEditorOpen(false);
    } catch (err) {
      setAnnotationMessage(err instanceof Error ? err.message : '批注更新失败');
    } finally {
      setIsAnnotationSaving(false);
    }
  }

  async function removeAnnotation(annotation: ReadingAnnotation) {
    if (!token) {
      return;
    }

    setIsAnnotationSaving(true);
    setAnnotationMessage(undefined);
    try {
      await api.removeAnnotation(token, annotation.id);
      setAnnotations((current) => current.filter((item) => item.id !== annotation.id));
      setEditingAnnotation(undefined);
      setIsAnnotationEditorOpen(false);
      setMessage('划线已删除');
    } catch (err) {
      setAnnotationMessage(err instanceof Error ? err.message : '删除失败');
    } finally {
      setIsAnnotationSaving(false);
    }
  }

  function closeAnnotationTools() {
    setSelectionDraft(undefined);
    setEditingAnnotation(undefined);
    setIsAnnotationEditorOpen(false);
    setAnnotationNote('');
    setAnnotationMessage(undefined);
    setIsAnnotationDeletePending(false);
  }

  function jumpToAnnotation(annotation: ReadingAnnotation) {
    closeCatalog(false);
    openExistingAnnotation(annotation);
    window.requestAnimationFrame(() => {
      document
        .querySelector(`[data-annotation-id="${annotation.id}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  async function loadMoreChapterComments() {
    if (!chapter || isLoadingMoreChapterComments) {
      return;
    }

    const nextPage = chapterComments.pagination.page + 1;
    if (nextPage > chapterComments.pagination.totalPages) {
      return;
    }

    setIsLoadingMoreChapterComments(true);
    setChapterCommentMessage(undefined);
    try {
      const nextComments = await api.listChapterComments(
        chapter.id,
        {
          page: nextPage,
          pageSize: chapterComments.pagination.pageSize,
        },
        token,
      );
      setChapterComments((current) => ({
        items: [...current.items, ...nextComments.items],
        pagination: nextComments.pagination,
      }));
    } catch (err) {
      setChapterCommentMessage(err instanceof Error ? err.message : '加载章节评论失败');
    } finally {
      setIsLoadingMoreChapterComments(false);
    }
  }

  function startChapterReply(comment: NovelComment) {
    if (!token) {
      setChapterCommentMessage('登录后可以回复章节评论');
      return;
    }
    setChapterReplyingToId(comment.id);
    setChapterReplyText('');
  }

  async function submitChapterReply(event: FormEvent<HTMLFormElement>, parent: NovelComment) {
    event.preventDefault();
    const content = chapterReplyText.trim();
    if (!token || !chapter) {
      setChapterCommentMessage('登录后可以回复章节评论');
      return;
    }
    if (content.length < 2) {
      setChapterCommentMessage('回复至少需要 2 个字');
      return;
    }

    setIsChapterReplySubmitting(true);
    setChapterCommentMessage(undefined);
    try {
      const created = await api.createChapterComment(token, chapter.id, content, parent.id);
      setChapterComments((current) => ({
        ...current,
        items: current.items.map((comment) =>
          comment.id === parent.id
            ? { ...comment, replies: [...comment.replies, created] }
            : comment,
        ),
      }));
      setChapterReplyingToId(undefined);
      setChapterReplyText('');
      setChapterCommentMessage('回复已发布');
    } catch (err) {
      setChapterCommentMessage(err instanceof Error ? err.message : '回复发布失败');
    } finally {
      setIsChapterReplySubmitting(false);
    }
  }

  async function toggleChapterCommentLike(comment: NovelComment) {
    if (!token) {
      setChapterCommentMessage('登录后可以点赞评论');
      return;
    }

    setChapterCommentActionId(comment.id);
    setChapterCommentMessage(undefined);
    try {
      const result = comment.isLiked
        ? await api.unlikeComment(token, comment.id)
        : await api.likeComment(token, comment.id);
      setChapterComments((current) => ({
        ...current,
        items: updateNovelCommentItems(current.items, comment.id, (item) => ({
          ...item,
          isLiked: result.isLiked,
          likeCount: result.likeCount,
        })),
      }));
    } catch (err) {
      setChapterCommentMessage(err instanceof Error ? err.message : '点赞操作失败');
    } finally {
      setChapterCommentActionId(undefined);
    }
  }

  async function submitChapterComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = chapterCommentText.trim();
    if (!token || !chapter) {
      setChapterCommentMessage('登录后可参与章节讨论');
      return;
    }
    if (content.length < 2) {
      setChapterCommentMessage('评论至少需要 2 个字');
      return;
    }

    setIsSubmittingChapterComment(true);
    setChapterCommentMessage(undefined);
    try {
      const created = await api.createChapterComment(token, chapter.id, content);
      setChapterComments((current) => ({
        items: [created, ...current.items],
        pagination: {
          ...current.pagination,
          total: current.pagination.total + 1,
          totalPages: Math.max(
            1,
            Math.ceil((current.pagination.total + 1) / current.pagination.pageSize),
          ),
        },
      }));
      setChapterCommentText('');
      setChapterCommentMessage('章节评论已发布');
    } catch (err) {
      setChapterCommentMessage(err instanceof Error ? err.message : '评论发布失败');
    } finally {
      setIsSubmittingChapterComment(false);
    }
  }

  function startCommentReport(comment: NovelComment) {
    if (!token) {
      setChapterCommentMessage('登录后可以举报评论');
      return;
    }
    if (comment.userId === user?.id) {
      setChapterCommentMessage('不能举报自己的评论');
      return;
    }
    setReportingComment(comment);
    setCommentReportTarget('comment');
    setCommentReportReason('SPAM');
    setCommentReportDetail('');
  }

  async function submitCommentReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !reportingComment) {
      return;
    }
    setIsCommentReportSubmitting(true);
    setChapterCommentMessage(undefined);
    try {
      const payload = {
        reason: commentReportReason,
        ...(commentReportDetail.trim() ? { detail: commentReportDetail.trim() } : {}),
      };
      if (commentReportTarget === 'user') {
        await api.reportContent(token, 'USER', reportingComment.userId, payload);
      } else {
        await api.reportComment(token, reportingComment.id, payload);
      }
      setReportingComment(undefined);
      setCommentReportDetail('');
      setChapterCommentMessage(
        commentReportTarget === 'user' ? '用户举报已提交' : '评论举报已提交',
      );
    } catch (err) {
      setChapterCommentMessage(err instanceof Error ? err.message : '举报提交失败');
    } finally {
      setIsCommentReportSubmitting(false);
    }
  }

  async function openParagraphComments(paragraphIndex: number) {
    if (!chapter) {
      return;
    }

    closeCatalog(false);
    closeAnnotationTools();
    setActiveParagraphIndex(paragraphIndex);
    setIsParagraphCommentsOpen(true);
    setIsParagraphCommentsLoading(true);
    setParagraphComments(undefined);
    setParagraphCommentText('');
    setReplyingTo(undefined);
    setReportingParagraphComment(undefined);
    setParagraphReportReason('SPAM');
    setParagraphReportDetail('');
    setParagraphCommentMessage(undefined);
    setParagraphCommentDeletePendingId(undefined);
    try {
      const result = await api.listParagraphComments(
        chapter.id,
        paragraphIndex,
        { page: 1, pageSize: 10 },
        token,
      );
      setParagraphComments(result);
    } catch (err) {
      setParagraphCommentMessage(err instanceof Error ? err.message : '段评加载失败');
    } finally {
      setIsParagraphCommentsLoading(false);
    }
  }

  function closeParagraphComments() {
    setIsParagraphCommentsOpen(false);
    setParagraphCommentText('');
    setReplyingTo(undefined);
    setReportingParagraphComment(undefined);
    setParagraphReportDetail('');
    setParagraphCommentMessage(undefined);
    setParagraphCommentDeletePendingId(undefined);
  }

  async function loadMoreParagraphComments() {
    if (!chapter || activeParagraphIndex === undefined || !paragraphComments) {
      return;
    }

    const nextPage = paragraphComments.pagination.page + 1;
    if (isParagraphCommentsLoadingMore || nextPage > paragraphComments.pagination.totalPages) {
      return;
    }

    setIsParagraphCommentsLoadingMore(true);
    setParagraphCommentMessage(undefined);
    try {
      const next = await api.listParagraphComments(
        chapter.id,
        activeParagraphIndex,
        { page: nextPage, pageSize: paragraphComments.pagination.pageSize },
        token,
      );
      setParagraphComments((current) =>
        current
          ? {
              ...next,
              items: [...current.items, ...next.items],
            }
          : next,
      );
    } catch (err) {
      setParagraphCommentMessage(err instanceof Error ? err.message : '加载更多段评失败');
    } finally {
      setIsParagraphCommentsLoadingMore(false);
    }
  }

  async function submitParagraphComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = paragraphCommentText.trim();
    if (!token || !chapter || activeParagraphIndex === undefined) {
      setParagraphCommentMessage('登录后可参与段评讨论');
      return;
    }
    if (content.length < 2) {
      setParagraphCommentMessage('段评至少需要 2 个字');
      return;
    }

    setIsParagraphCommentSubmitting(true);
    setParagraphCommentMessage(undefined);
    try {
      const created = await api.createParagraphComment(
        token,
        chapter.id,
        activeParagraphIndex,
        content,
        replyingTo?.id,
      );
      setParagraphComments((current) => {
        if (!current) {
          return current;
        }

        if (replyingTo) {
          return {
            ...current,
            items: current.items.map((comment) =>
              comment.id === replyingTo.id
                ? { ...comment, replies: [...comment.replies, created] }
                : comment,
            ),
            totalComments: current.totalComments + 1,
          };
        }

        const total = current.pagination.total + 1;
        return {
          ...current,
          items: [created, ...current.items],
          totalComments: current.totalComments + 1,
          pagination: {
            ...current.pagination,
            total,
            totalPages: Math.max(1, Math.ceil(total / current.pagination.pageSize)),
          },
        };
      });
      updateParagraphCommentSummary(activeParagraphIndex, 1);
      setParagraphCommentText('');
      setReplyingTo(undefined);
      setParagraphCommentMessage(replyingTo ? '回复已发布' : '段评已发布');
    } catch (err) {
      setParagraphCommentMessage(err instanceof Error ? err.message : '段评发布失败');
    } finally {
      setIsParagraphCommentSubmitting(false);
    }
  }

  function startParagraphReply(comment: ParagraphComment) {
    setReportingParagraphComment(undefined);
    setReplyingTo(comment);
    setParagraphCommentText('');
    setParagraphCommentMessage(undefined);
    window.requestAnimationFrame(() => paragraphCommentInputRef.current?.focus());
  }

  function startParagraphReport(comment: ParagraphComment) {
    if (!token) {
      setParagraphCommentMessage('登录后可以举报段评');
      return;
    }
    setReplyingTo(undefined);
    setReportingParagraphComment(comment);
    setParagraphReportReason('SPAM');
    setParagraphReportDetail('');
    setParagraphCommentMessage(undefined);
  }

  async function submitParagraphReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !reportingParagraphComment) {
      return;
    }

    setIsParagraphReportSubmitting(true);
    setParagraphCommentMessage(undefined);
    try {
      await api.reportParagraphComment(token, reportingParagraphComment.id, {
        reason: paragraphReportReason,
        ...(paragraphReportDetail.trim() ? { detail: paragraphReportDetail.trim() } : {}),
      });
      setReportingParagraphComment(undefined);
      setParagraphReportDetail('');
      setParagraphCommentMessage('举报已提交，管理员会尽快处理');
    } catch (err) {
      setParagraphCommentMessage(err instanceof Error ? err.message : '举报提交失败');
    } finally {
      setIsParagraphReportSubmitting(false);
    }
  }

  async function toggleParagraphCommentLike(comment: ParagraphComment) {
    if (!token) {
      setParagraphCommentMessage('登录后可以点赞段评');
      return;
    }

    setParagraphCommentActionId(comment.id);
    setParagraphCommentMessage(undefined);
    try {
      const result = comment.isLiked
        ? await api.unlikeParagraphComment(token, comment.id)
        : await api.likeParagraphComment(token, comment.id);
      setParagraphComments((current) =>
        current
          ? {
              ...current,
              items: updateParagraphCommentItems(current.items, comment.id, (item) => ({
                ...item,
                isLiked: result.liked,
                likeCount: result.likeCount,
              })),
            }
          : current,
      );
    } catch (err) {
      setParagraphCommentMessage(err instanceof Error ? err.message : '点赞操作失败');
    } finally {
      setParagraphCommentActionId(undefined);
    }
  }

  async function removeParagraphComment(comment: ParagraphComment) {
    if (!token || user?.id !== comment.userId) {
      return;
    }
    if (paragraphCommentDeletePendingId !== comment.id) {
      setParagraphCommentDeletePendingId(comment.id);
      return;
    }

    setParagraphCommentActionId(comment.id);
    setParagraphCommentMessage(undefined);
    try {
      const result = await api.removeParagraphComment(token, comment.id);
      setParagraphComments((current) => {
        if (!current) {
          return current;
        }

        const isRoot = !comment.parentId;
        const total =
          isRoot && !result.softDeleted
            ? Math.max(0, current.pagination.total - 1)
            : current.pagination.total;
        return {
          ...current,
          items: result.softDeleted
            ? updateParagraphCommentItems(current.items, comment.id, (item) => ({
                ...item,
                content: null,
                isDeleted: true,
              }))
            : removeParagraphCommentItem(current.items, comment.id),
          totalComments: Math.max(0, current.totalComments - 1),
          pagination: {
            ...current.pagination,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / current.pagination.pageSize),
          },
        };
      });
      if (activeParagraphIndex !== undefined) {
        updateParagraphCommentSummary(activeParagraphIndex, -1);
      }
      if (replyingTo?.id === comment.id) {
        setReplyingTo(undefined);
      }
      if (reportingParagraphComment?.id === comment.id) {
        setReportingParagraphComment(undefined);
      }
      setParagraphCommentDeletePendingId(undefined);
      setParagraphCommentMessage('段评已删除');
    } catch (err) {
      setParagraphCommentMessage(err instanceof Error ? err.message : '段评删除失败');
    } finally {
      setParagraphCommentActionId(undefined);
    }
  }

  function updateParagraphCommentSummary(paragraphIndex: number, delta: number) {
    setParagraphCommentSummary((current) => {
      const previous =
        current.items.find((item) => item.paragraphIndex === paragraphIndex)?.count ?? 0;
      const count = Math.max(0, previous + delta);
      const items = current.items.filter((item) => item.paragraphIndex !== paragraphIndex);
      if (count > 0) {
        items.push({ paragraphIndex, count });
        items.sort((left, right) => left.paragraphIndex - right.paragraphIndex);
      }
      return {
        items,
        total: Math.max(0, current.total + delta),
      };
    });
  }

  function updatePreference(patch: Partial<ReadingPreference>) {
    setPreference((current) => ({ ...current, ...patch }));
  }

  if (isLoading) {
    return <ReaderState text="加载中..." />;
  }

  if (error || !chapter) {
    return <ReaderState text={error ?? '章节不存在'} />;
  }

  const readerWidth = preference.contentWidth + 84;
  const themeClass = preference.theme.toLowerCase();

  return (
    <article className={`reader-page reader-theme-${themeClass}`}>
      <header className="reader-toolbar">
        <Link to={`/novels/${chapter.novel.id}`} onClick={() => saveBeforeNavigation()}>
          <ArrowLeft size={18} aria-hidden />
          {chapter.novel.title}
        </Link>
        <div className="reader-actions">
          <button
            ref={catalogButtonRef}
            className={`ghost-button${isCatalogOpen ? ' active' : ''}`}
            type="button"
            onClick={toggleCatalog}
            aria-expanded={isCatalogOpen}
            aria-controls="reader-catalog"
          >
            <List size={16} aria-hidden />
            目录
          </button>
          <button
            className={`ghost-button${isSettingsOpen ? ' active' : ''}`}
            type="button"
            onClick={() => {
              setIsCatalogOpen(false);
              setIsSettingsOpen((current) => !current);
            }}
            aria-expanded={isSettingsOpen}
          >
            <SlidersHorizontal size={16} aria-hidden />
            阅读设置
          </button>
          <button
            className={`ghost-button reader-bookmark-button${isBookmarked ? ' active' : ''}`}
            type="button"
            onClick={() => void toggleBookmark()}
            disabled={isBookmarkSaving}
          >
            {isBookmarked ? (
              <BookmarkCheck size={16} aria-hidden />
            ) : (
              <Bookmark size={16} aria-hidden />
            )}
            {isBookmarked ? '已加书签' : '加入书签'}
          </button>
          <button className="ghost-button" type="button" onClick={saveProgress} disabled={isSaving}>
            <Save size={16} aria-hidden />
            {isSaving ? '保存中...' : `保存 ${progress}%`}
          </button>
          {chapter.novel.author.id !== user?.id && (
            <button className="ghost-button" type="button" onClick={startChapterReport}>
              <Flag size={16} aria-hidden />
              举报章节
            </button>
          )}
          {token && saveStatus === 'saved' && lastSavedProgress !== undefined && (
            <span className="reader-save-status">已自动保存 {lastSavedProgress}%</span>
          )}
          <span className="reader-reading-time" title="仅统计前台活跃阅读时间">
            <Clock3 size={14} aria-hidden />
            本次 {formatReadingDuration(sessionSeconds)}
            {token ? ` · 本书 ${formatReadingDuration(totalReadingSeconds)}` : ''}
          </span>
        </div>
      </header>

      <div
        className="reader-progress-track"
        role="progressbar"
        aria-label="阅读进度"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <span style={{ width: `${progress}%` }} />
      </div>

      {isChapterReportOpen && (
        <div className="reader-content-report">
          <ContentReportForm
            detail={chapterReportDetail}
            isSubmitting={isChapterReportSubmitting}
            reason={chapterReportReason}
            targetName={chapter.title}
            title="举报章节"
            onCancel={() => setIsChapterReportOpen(false)}
            onDetailChange={setChapterReportDetail}
            onReasonChange={setChapterReportReason}
            onSubmit={submitChapterReport}
          />
        </div>
      )}

      {isCatalogOpen && (
        <>
          <button
            className="reader-catalog-backdrop"
            type="button"
            onClick={() => closeCatalog()}
            aria-label="关闭章节目录"
            tabIndex={-1}
          />
          <aside
            ref={catalogPanelRef}
            id="reader-catalog"
            className="reader-catalog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reader-catalog-title"
          >
            <header className="reader-catalog-header">
              <div>
                <span>{chapter.novel.title}</span>
                <h2 id="reader-catalog-title">阅读导航</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => closeCatalog()}
                aria-label="关闭章节目录"
                title="关闭"
              >
                <X size={18} aria-hidden />
              </button>
            </header>

            <div className="segmented-control reader-drawer-tabs" aria-label="阅读导航视图">
              <button
                className={drawerView === 'chapters' ? 'active' : ''}
                type="button"
                onClick={() => setDrawerView('chapters')}
              >
                章节
              </button>
              <button
                className={drawerView === 'annotations' ? 'active' : ''}
                type="button"
                onClick={() => setDrawerView('annotations')}
              >
                批注 {annotations.length}
              </button>
            </div>

            {drawerView === 'chapters' ? (
              <>
                <div className="reader-catalog-search">
                  <Search size={17} aria-hidden />
                  <input
                    ref={catalogSearchRef}
                    type="search"
                    aria-label="搜索章节"
                    value={catalogQuery}
                    onChange={(event) => setCatalogQuery(event.target.value)}
                    placeholder="搜索章节名或序号"
                  />
                  {catalogQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setCatalogQuery('');
                        catalogSearchRef.current?.focus();
                      }}
                      aria-label="清除章节搜索"
                      title="清除"
                    >
                      <X size={15} aria-hidden />
                    </button>
                  )}
                </div>

                <div className="reader-catalog-toolbar">
                  <span>
                    {filteredChapters.length} / {chapters.length} 章
                  </span>
                  <div className="segmented-control" aria-label="章节排序">
                    <button
                      className={catalogOrder === 'asc' ? 'active' : ''}
                      type="button"
                      onClick={() => setCatalogOrder('asc')}
                    >
                      正序
                    </button>
                    <button
                      className={catalogOrder === 'desc' ? 'active' : ''}
                      type="button"
                      onClick={() => setCatalogOrder('desc')}
                    >
                      倒序
                    </button>
                  </div>
                </div>

                <div ref={catalogListRef} className="reader-catalog-list">
                  {filteredChapters.length === 0 && (
                    <p className="reader-catalog-empty">没有找到匹配章节</p>
                  )}
                  {filteredChapters.map((item) => {
                    const isCurrent = item.id === chapter.id;
                    const isCompleted = completedChapterIds.has(item.id);
                    const savedItemProgress =
                      item.id === chapter.id
                        ? progress
                        : item.id === readStatus.currentChapterId
                          ? readStatus.currentProgress
                          : 0;
                    return (
                      <Link
                        ref={isCurrent ? currentChapterRef : undefined}
                        key={item.id}
                        className={`${isCurrent ? 'active' : ''}${isCompleted ? ' completed' : ''}`.trim()}
                        to={`/chapters/${item.id}`}
                        aria-current={isCurrent ? 'page' : undefined}
                        onClick={() => {
                          saveBeforeNavigation();
                          closeCatalog(false);
                        }}
                      >
                        <span>{item.volume?.title ?? '未分卷'}</span>
                        <strong>{item.title}</strong>
                        {isCompleted ? (
                          <small className="completed">
                            <CircleCheck size={14} aria-hidden />
                            已读
                          </small>
                        ) : savedItemProgress > 0 ? (
                          <small>{savedItemProgress}%</small>
                        ) : (
                          <small>{formatWordCount(item.wordCount)}</small>
                        )}
                      </Link>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="reader-annotation-drawer-summary">
                  <Highlighter size={17} aria-hidden />
                  <span>当前章节共 {annotations.length} 条划线与批注</span>
                </div>
                <div className="reader-catalog-toolbar">
                  <span>按正文顺序排列</span>
                </div>
                <div className="reader-drawer-annotation-list">
                  {sortedAnnotations.length === 0 && (
                    <p className="reader-catalog-empty">选中文字即可添加划线或批注</p>
                  )}
                  {sortedAnnotations.map((annotation) => (
                    <button
                      key={annotation.id}
                      type="button"
                      onClick={() => jumpToAnnotation(annotation)}
                    >
                      <i
                        className={`annotation-color-dot annotation-${annotation.color.toLowerCase()}`}
                      />
                      <span>
                        <strong>{annotation.selectedText}</strong>
                        <small>
                          第 {annotation.paragraphIndex + 1} 段
                          {annotation.note ? ` · ${annotation.note}` : ' · 仅划线'}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </aside>
        </>
      )}

      {isSettingsOpen && (
        <section className="reader-preferences" aria-label="阅读设置">
          <div className="reader-preference-group">
            <span>字号</span>
            <div className="font-tools" aria-label="字号">
              <button
                type="button"
                onClick={() =>
                  updatePreference({ fontSize: Math.max(15, preference.fontSize - 1) })
                }
                aria-label="减小字号"
                title="减小字号"
              >
                <Minus size={16} aria-hidden />
              </button>
              <strong>{preference.fontSize}</strong>
              <button
                type="button"
                onClick={() =>
                  updatePreference({ fontSize: Math.min(24, preference.fontSize + 1) })
                }
                aria-label="增大字号"
                title="增大字号"
              >
                <Plus size={16} aria-hidden />
              </button>
            </div>
          </div>

          <div className="reader-preference-group">
            <span>主题</span>
            <div className="reader-option-row reader-theme-options">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  className={preference.theme === option.value ? 'active' : ''}
                  type="button"
                  onClick={() => updatePreference({ theme: option.value })}
                >
                  <i className={`theme-swatch theme-swatch-${option.value.toLowerCase()}`} />
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="reader-preference-group">
            <span>行距</span>
            <div className="reader-option-row">
              {lineHeightOptions.map((value) => (
                <button
                  key={value}
                  className={preference.lineHeight === value ? 'active' : ''}
                  type="button"
                  onClick={() => updatePreference({ lineHeight: value })}
                >
                  {value.toFixed(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="reader-preference-group">
            <span>版心</span>
            <div className="reader-option-row">
              {contentWidthOptions.map((value, index) => (
                <button
                  key={value}
                  className={preference.contentWidth === value ? 'active' : ''}
                  type="button"
                  onClick={() => updatePreference({ contentWidth: value })}
                >
                  {['窄', '标准', '宽'][index]}
                </button>
              ))}
            </div>
          </div>

          <span className={`preference-status ${preferenceStatus}`}>
            {preferenceStatusText(preferenceStatus, Boolean(token))}
          </span>
        </section>
      )}

      {message && <p className="auth-message reader-message">{message}</p>}

      <section className="reader-sheet" style={{ maxWidth: readerWidth }}>
        <p className="eyebrow">{chapter.novel.author.nickname}</p>
        <h1>{chapter.title}</h1>
        <p className="reader-chapter-meta">
          第 {chapter.orderIndex} 章 · {formatWordCount(chapter.wordCount)}
          {chapter.publishedAt ? ` · ${formatDate(chapter.publishedAt)}` : ''}
        </p>
        <div
          ref={readerContentRef}
          className="reader-content"
          style={{ fontSize: preference.fontSize, lineHeight: preference.lineHeight }}
          onMouseUp={captureTextSelection}
          onTouchEnd={() => window.requestAnimationFrame(captureTextSelection)}
        >
          {chapter.content.split(/\n+/).map((paragraph, index) => {
            const paragraphCommentCount = paragraphCommentCounts.get(index) ?? 0;
            return (
              <div className="reader-paragraph" key={`${index}-${paragraph.slice(0, 8)}`}>
                <p data-paragraph-index={index}>
                  {renderAnnotatedParagraph(
                    paragraph,
                    annotationsByParagraph.get(index) ?? [],
                    openExistingAnnotation,
                  )}
                </p>
                <button
                  className={`reader-paragraph-comment-trigger${paragraphCommentCount > 0 ? ' active' : ''}`}
                  type="button"
                  onClick={() => void openParagraphComments(index)}
                  aria-label={`查看第 ${index + 1} 段段评，${paragraphCommentCount} 条`}
                  title="查看段评"
                >
                  <MessageCircle size={15} aria-hidden />
                  <span>{paragraphCommentCount > 0 ? paragraphCommentCount : '评'}</span>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {isParagraphCommentsOpen && activeParagraphIndex !== undefined && (
        <>
          <button
            className="reader-paragraph-comments-backdrop"
            type="button"
            onClick={closeParagraphComments}
            aria-label="关闭段评"
            tabIndex={-1}
          />
          <aside
            ref={paragraphCommentsPanelRef}
            className="reader-paragraph-comments-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="paragraph-comments-title"
          >
            <header className="reader-paragraph-comments-header">
              <div>
                <span>第 {activeParagraphIndex + 1} 段</span>
                <h2 id="paragraph-comments-title">
                  段评 {paragraphComments ? `· ${paragraphComments.totalComments}` : ''}
                </h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={closeParagraphComments}
                aria-label="关闭段评"
                title="关闭"
              >
                <X size={18} aria-hidden />
              </button>
            </header>

            <blockquote className="reader-paragraph-comments-excerpt">
              {paragraphComments?.paragraph ?? chapter.content.split(/\n+/)[activeParagraphIndex]}
            </blockquote>

            <form className="paragraph-comment-form" onSubmit={submitParagraphComment}>
              {replyingTo && (
                <div className="paragraph-reply-target">
                  <span>回复 {replyingTo.user.nickname}</span>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => setReplyingTo(undefined)}
                    aria-label="取消回复"
                    title="取消回复"
                  >
                    <X size={14} aria-hidden />
                  </button>
                </div>
              )}
              <textarea
                ref={paragraphCommentInputRef}
                disabled={!isAuthenticated}
                minLength={2}
                maxLength={500}
                value={paragraphCommentText}
                onChange={(event) => setParagraphCommentText(event.target.value)}
                placeholder={
                  isAuthenticated
                    ? replyingTo
                      ? `回复 ${replyingTo.user.nickname}`
                      : '说说你对这一段的看法'
                    : '登录后可参与段评'
                }
              />
              <div className="paragraph-comment-form-footer">
                <span>{paragraphCommentText.length} / 500</span>
                <button
                  className="primary-link"
                  type="submit"
                  disabled={
                    !isAuthenticated ||
                    isParagraphCommentSubmitting ||
                    paragraphCommentText.trim().length < 2
                  }
                >
                  <Send size={16} aria-hidden />
                  {isParagraphCommentSubmitting ? '发布中...' : replyingTo ? '回复' : '发布段评'}
                </button>
              </div>
            </form>

            {paragraphCommentMessage && (
              <p className="auth-message paragraph-comment-message">{paragraphCommentMessage}</p>
            )}

            {reportingParagraphComment && (
              <form className="paragraph-report-form" onSubmit={submitParagraphReport}>
                <div className="paragraph-report-header">
                  <div>
                    <span>举报段评</span>
                    <strong>{reportingParagraphComment.user.nickname}</strong>
                  </div>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => setReportingParagraphComment(undefined)}
                    aria-label="取消举报"
                    title="取消举报"
                  >
                    <X size={15} aria-hidden />
                  </button>
                </div>
                <label>
                  <span>举报原因</span>
                  <select
                    value={paragraphReportReason}
                    onChange={(event) =>
                      setParagraphReportReason(event.target.value as ParagraphReportReason)
                    }
                  >
                    {paragraphReportOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>补充说明</span>
                  <textarea
                    maxLength={500}
                    value={paragraphReportDetail}
                    onChange={(event) => setParagraphReportDetail(event.target.value)}
                    placeholder="可选，补充说明具体问题"
                  />
                </label>
                <div className="paragraph-report-actions">
                  <span>{paragraphReportDetail.length} / 500</span>
                  <button
                    className="primary-link"
                    type="submit"
                    disabled={isParagraphReportSubmitting}
                  >
                    <Flag size={15} aria-hidden />
                    {isParagraphReportSubmitting ? '提交中...' : '提交举报'}
                  </button>
                </div>
              </form>
            )}

            <div className="reader-paragraph-comment-list">
              {isParagraphCommentsLoading && <p className="state-line">段评加载中...</p>}
              {!isParagraphCommentsLoading && paragraphComments?.items.length === 0 && (
                <div className="reader-discussion-empty">
                  <MessageCircle size={22} aria-hidden />
                  <p>还没有段评，来留下第一条看法</p>
                </div>
              )}
              {paragraphComments?.items.map((comment) => (
                <ParagraphCommentItem
                  key={comment.id}
                  comment={comment}
                  currentUserId={user?.id}
                  actionId={paragraphCommentActionId}
                  deletePendingId={paragraphCommentDeletePendingId}
                  onReply={startParagraphReply}
                  onReport={startParagraphReport}
                  onToggleLike={(item) => void toggleParagraphCommentLike(item)}
                  onDelete={(item) => void removeParagraphComment(item)}
                />
              ))}
            </div>

            {paragraphComments &&
              paragraphComments.pagination.page < paragraphComments.pagination.totalPages && (
                <div className="load-more-row">
                  <button
                    type="button"
                    onClick={() => void loadMoreParagraphComments()}
                    disabled={isParagraphCommentsLoadingMore}
                  >
                    {isParagraphCommentsLoadingMore ? '加载中...' : '加载更多段评'}
                  </button>
                </div>
              )}
          </aside>
        </>
      )}

      {selectionDraft && !isAnnotationEditorOpen && (
        <div className="reader-selection-toolbar" role="toolbar" aria-label="划线与批注">
          <span className="reader-selection-preview">{selectionDraft.selectedText}</span>
          <div className="annotation-color-options" aria-label="划线颜色">
            {annotationColorOptions.map((option) => (
              <button
                key={option.value}
                className={`${annotationColor === option.value ? 'active ' : ''}annotation-${option.value.toLowerCase()}`}
                type="button"
                onClick={() => setAnnotationColor(option.value)}
                aria-label={option.label}
                title={option.label}
              />
            ))}
          </div>
          <button
            className="ghost-button"
            type="button"
            onClick={() => void createSelectedAnnotation()}
            disabled={isAnnotationSaving}
          >
            <Highlighter size={16} aria-hidden />
            仅划线
          </button>
          <button
            className="primary-link"
            type="button"
            onClick={openNewAnnotationEditor}
            disabled={isAnnotationSaving}
          >
            <MessageSquareText size={16} aria-hidden />
            添加批注
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={closeAnnotationTools}
            aria-label="取消划线"
            title="取消"
          >
            <X size={16} aria-hidden />
          </button>
          {annotationMessage && <span className="annotation-error">{annotationMessage}</span>}
        </div>
      )}

      {isAnnotationEditorOpen && (editingAnnotation || selectionDraft) && (
        <>
          <button
            className="reader-annotation-backdrop"
            type="button"
            onClick={closeAnnotationTools}
            aria-label="关闭批注编辑"
            tabIndex={-1}
          />
          <form
            ref={annotationEditorRef}
            className="reader-annotation-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="annotation-editor-title"
            onSubmit={saveAnnotationEditor}
          >
            <header>
              <div>
                <span>{editingAnnotation ? '编辑已有标记' : '所选文字'}</span>
                <h2 id="annotation-editor-title">{editingAnnotation ? '编辑批注' : '添加批注'}</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={closeAnnotationTools}
                aria-label="关闭批注编辑"
                title="关闭"
              >
                <X size={17} aria-hidden />
              </button>
            </header>

            <blockquote>
              {editingAnnotation?.selectedText ?? selectionDraft?.selectedText}
            </blockquote>

            <div className="annotation-editor-field">
              <span>标记颜色</span>
              <div className="annotation-color-options" aria-label="标记颜色">
                {annotationColorOptions.map((option) => (
                  <button
                    key={option.value}
                    className={`${annotationColor === option.value ? 'active ' : ''}annotation-${option.value.toLowerCase()}`}
                    type="button"
                    onClick={() => setAnnotationColor(option.value)}
                    aria-label={option.label}
                    title={option.label}
                  />
                ))}
              </div>
            </div>

            <label className="annotation-editor-field">
              <span>批注内容</span>
              <textarea
                autoFocus
                maxLength={1000}
                value={annotationNote}
                onChange={(event) => setAnnotationNote(event.target.value)}
                placeholder="记录此刻的想法，可留空作为单纯划线"
              />
              <small>{annotationNote.length} / 1000</small>
            </label>

            {annotationMessage && <p className="auth-error">{annotationMessage}</p>}

            <div className="annotation-editor-actions">
              {editingAnnotation && (
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => {
                    if (isAnnotationDeletePending) {
                      void removeAnnotation(editingAnnotation);
                    } else {
                      setIsAnnotationDeletePending(true);
                    }
                  }}
                  disabled={isAnnotationSaving}
                >
                  <Trash2 size={16} aria-hidden />
                  {isAnnotationDeletePending ? '确认删除' : '删除标记'}
                </button>
              )}
              <button className="ghost-button" type="button" onClick={closeAnnotationTools}>
                取消
              </button>
              <button className="primary-link" type="submit" disabled={isAnnotationSaving}>
                <Save size={16} aria-hidden />
                {isAnnotationSaving ? '保存中...' : '保存'}
              </button>
            </div>
          </form>
        </>
      )}

      <nav className="reader-nav" aria-label="章节导航" style={{ maxWidth: readerWidth }}>
        {adjacentChapters.previous ? (
          <Link
            to={`/chapters/${adjacentChapters.previous.id}`}
            onClick={() => saveBeforeNavigation()}
          >
            <ChevronLeft size={18} aria-hidden />
            <span>{adjacentChapters.previous.title}</span>
          </Link>
        ) : (
          <span>已经是第一章</span>
        )}
        {adjacentChapters.next ? (
          <button
            className="reader-next-button"
            type="button"
            disabled={isCompleting}
            onClick={() => void completeAndGoNext()}
          >
            <span>
              {isCompleting ? '正在保存...' : `读完并进入 ${adjacentChapters.next.title}`}
            </span>
            <ChevronRight size={18} aria-hidden />
          </button>
        ) : isCurrentChapterCompleted ? (
          <span className="reader-caught-up">
            <BookOpenCheck size={18} aria-hidden />
            <span>
              <strong>已追平</strong>
              <small>等待作者更新</small>
            </span>
          </span>
        ) : token ? (
          <button
            className="reader-complete-button"
            type="button"
            disabled={isCompleting}
            onClick={() => void completeCurrentChapter()}
          >
            <CircleCheck size={18} aria-hidden />
            <span>{isCompleting ? '正在保存...' : '标记本章读完'}</span>
          </button>
        ) : (
          <span>已经是最新章节</span>
        )}
      </nav>

      <section className="reader-discussion" style={{ maxWidth: readerWidth }}>
        <div className="section-title">
          <div>
            <p className="eyebrow">当前章节</p>
            <h2>章节讨论</h2>
          </div>
          <span className="muted">{chapterComments.pagination.total} 条</span>
        </div>

        <form className="comment-form reader-comment-form" onSubmit={submitChapterComment}>
          <textarea
            disabled={!isAuthenticated}
            minLength={2}
            maxLength={500}
            placeholder={
              isAuthenticated ? `${user?.nickname ?? '我'}，聊聊这一章` : '登录后可参与章节讨论'
            }
            value={chapterCommentText}
            onChange={(event) => setChapterCommentText(event.target.value)}
          />
          <div className="reader-comment-form-footer">
            <span>{chapterCommentText.length} / 500</span>
            <button
              className="primary-link"
              type="submit"
              disabled={
                !isAuthenticated ||
                isSubmittingChapterComment ||
                chapterCommentText.trim().length < 2
              }
            >
              <Send size={16} aria-hidden />
              {isSubmittingChapterComment ? '发布中...' : '发表讨论'}
            </button>
          </div>
        </form>

        {chapterCommentMessage && <p className="auth-message">{chapterCommentMessage}</p>}

        {reportingComment && (
          <CommentReportForm
            detail={commentReportDetail}
            isSubmitting={isCommentReportSubmitting}
            reason={commentReportReason}
            reportedUserName={reportingComment.user.nickname}
            target={commentReportTarget}
            onCancel={() => setReportingComment(undefined)}
            onDetailChange={setCommentReportDetail}
            onReasonChange={setCommentReportReason}
            onSubmit={submitCommentReport}
            onTargetChange={setCommentReportTarget}
          />
        )}

        <div className="comment-list reader-comment-list">
          {chapterComments.items.length === 0 && (
            <div className="reader-discussion-empty">
              <MessageCircle size={22} aria-hidden />
              <p>还没有人讨论这一章</p>
            </div>
          )}
          {chapterComments.items.map((comment) => (
            <NovelCommentThread
              key={comment.id}
              comment={comment}
              currentUserId={user?.id}
              actionId={chapterCommentActionId}
              replyingToId={chapterReplyingToId}
              replyText={chapterReplyText}
              isReplySubmitting={isChapterReplySubmitting}
              deletedText="该章节评论已删除"
              onReply={startChapterReply}
              onReplyTextChange={setChapterReplyText}
              onCancelReply={() => {
                setChapterReplyingToId(undefined);
                setChapterReplyText('');
              }}
              onSubmitReply={submitChapterReply}
              onReport={startCommentReport}
              onToggleLike={(item) => void toggleChapterCommentLike(item)}
            />
          ))}
        </div>

        {chapterComments.pagination.page < chapterComments.pagination.totalPages && (
          <div className="load-more-row">
            <button
              type="button"
              onClick={() => void loadMoreChapterComments()}
              disabled={isLoadingMoreChapterComments}
            >
              {isLoadingMoreChapterComments ? '加载中...' : '加载更多讨论'}
            </button>
          </div>
        )}
      </section>
    </article>
  );
}

interface ParagraphCommentItemProps {
  comment: ParagraphComment;
  currentUserId?: string;
  actionId?: string;
  deletePendingId?: string;
  isReply?: boolean;
  onReply: (comment: ParagraphComment) => void;
  onReport: (comment: ParagraphComment) => void;
  onToggleLike: (comment: ParagraphComment) => void;
  onDelete: (comment: ParagraphComment) => void;
}

function ParagraphCommentItem({
  comment,
  currentUserId,
  actionId,
  deletePendingId,
  isReply = false,
  onReply,
  onReport,
  onToggleLike,
  onDelete,
}: ParagraphCommentItemProps) {
  return (
    <article className={`paragraph-comment-item${isReply ? ' reply' : ''}`}>
      <div className="paragraph-comment-avatar">{comment.user.nickname.slice(0, 1)}</div>
      <div className="paragraph-comment-body">
        <div className="paragraph-comment-meta">
          <strong>{comment.user.nickname}</strong>
          {comment.isAuthor && <span className="paragraph-author-badge">作者</span>}
          <time>{new Date(comment.createdAt).toLocaleString('zh-CN')}</time>
        </div>
        <p className={comment.isDeleted ? 'deleted' : ''}>{comment.content ?? '该段评已删除'}</p>
        <div className="paragraph-comment-actions">
          <button
            className={comment.isLiked ? 'active' : ''}
            type="button"
            onClick={() => onToggleLike(comment)}
            disabled={comment.isDeleted || actionId === comment.id}
            aria-label={comment.isLiked ? '取消点赞' : '点赞'}
            title={comment.isLiked ? '取消点赞' : '点赞'}
          >
            <Heart size={15} fill={comment.isLiked ? 'currentColor' : 'none'} aria-hidden />
            <span>{comment.likeCount || '赞'}</span>
          </button>
          {!isReply && !comment.isDeleted && (
            <button
              type="button"
              onClick={() => onReply(comment)}
              aria-label={`回复 ${comment.user.nickname}`}
            >
              <Reply size={15} aria-hidden />
              <span>回复</span>
            </button>
          )}
          {currentUserId !== comment.userId && !comment.isDeleted && (
            <button
              type="button"
              onClick={() => onReport(comment)}
              aria-label={`举报 ${comment.user.nickname} 的段评`}
            >
              <Flag size={15} aria-hidden />
              <span>举报</span>
            </button>
          )}
          {currentUserId === comment.userId && !comment.isDeleted && (
            <button
              className={deletePendingId === comment.id ? 'danger pending' : 'danger'}
              type="button"
              onClick={() => onDelete(comment)}
              disabled={actionId === comment.id}
              aria-label={deletePendingId === comment.id ? '确认删除段评' : '删除段评'}
            >
              <Trash2 size={15} aria-hidden />
              <span>{deletePendingId === comment.id ? '确认删除' : '删除'}</span>
            </button>
          )}
        </div>

        {!isReply && comment.replies.length > 0 && (
          <div className="paragraph-comment-replies">
            {comment.replies.map((reply) => (
              <ParagraphCommentItem
                key={reply.id}
                comment={reply}
                currentUserId={currentUserId}
                actionId={actionId}
                deletePendingId={deletePendingId}
                isReply
                onReply={onReply}
                onReport={onReport}
                onToggleLike={onToggleLike}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function updateParagraphCommentItems(
  items: ParagraphComment[],
  commentId: string,
  update: (comment: ParagraphComment) => ParagraphComment,
) {
  return items.map((comment) => {
    if (comment.id === commentId) {
      return update(comment);
    }
    return {
      ...comment,
      replies: comment.replies.map((reply) => (reply.id === commentId ? update(reply) : reply)),
    };
  });
}

function removeParagraphCommentItem(items: ParagraphComment[], commentId: string) {
  return items
    .filter((comment) => comment.id !== commentId)
    .map((comment) => ({
      ...comment,
      replies: comment.replies.filter((reply) => reply.id !== commentId),
    }));
}

function renderAnnotatedParagraph(
  paragraph: string,
  annotations: ReadingAnnotation[],
  onOpen: (annotation: ReadingAnnotation) => void,
) {
  const parts: ReactNode[] = [];
  let cursor = 0;

  annotations.forEach((annotation) => {
    if (annotation.startOffset > cursor) {
      parts.push(paragraph.slice(cursor, annotation.startOffset));
    }
    parts.push(
      <mark
        key={annotation.id}
        className={`reader-annotation-mark annotation-${annotation.color.toLowerCase()}`}
        data-annotation-id={annotation.id}
        role="button"
        tabIndex={0}
        title={annotation.note ?? '点击编辑划线'}
        onClick={(event) => {
          event.stopPropagation();
          onOpen(annotation);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen(annotation);
          }
        }}
      >
        {paragraph.slice(annotation.startOffset, annotation.endOffset)}
      </mark>,
    );
    cursor = annotation.endOffset;
  });

  if (cursor < paragraph.length) {
    parts.push(paragraph.slice(cursor));
  }

  return parts;
}

function findParagraphElement(node: Node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  return element?.closest<HTMLParagraphElement>('p[data-paragraph-index]') ?? null;
}

function getTextOffset(paragraph: HTMLParagraphElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  range.setEnd(node, offset);
  return range.toString().length;
}

function ReaderState({ text }: { text: string }) {
  return (
    <section className="empty-state">
      <h1>{text}</h1>
      <Link to="/">返回书城</Link>
    </section>
  );
}

function emptyComments(): PaginatedComments {
  return {
    items: [],
    pagination: { page: 1, pageSize: 8, total: 0, totalPages: 0 },
  };
}

function getReadingScrollRange(element: HTMLDivElement | null) {
  if (!element) {
    return { start: 0, end: 0 };
  }

  const contentTop = element.getBoundingClientRect().top + window.scrollY;
  const topOffset = window.innerWidth > 720 ? 86 : 24;
  const start = Math.max(0, contentTop - topOffset);
  const end = Math.max(start, contentTop + element.scrollHeight - window.innerHeight + 48);
  return { start, end };
}

function readLocalPreference() {
  try {
    const saved = window.localStorage.getItem(localPreferenceKey);
    return saved
      ? normalizePreference(JSON.parse(saved) as Partial<ReadingPreference>)
      : defaultPreference;
  } catch {
    return defaultPreference;
  }
}

function normalizePreference(value: Partial<ReadingPreference>): ReadingPreference {
  const fontSize = Number(value.fontSize);
  const lineHeight = Number(value.lineHeight);
  const contentWidth = Number(value.contentWidth);
  const theme = themeOptions.some((option) => option.value === value.theme)
    ? (value.theme as ReadingTheme)
    : defaultPreference.theme;

  return {
    fontSize: Number.isInteger(fontSize) && fontSize >= 15 && fontSize <= 24 ? fontSize : 18,
    theme,
    lineHeight: lineHeightOptions.includes(lineHeight as (typeof lineHeightOptions)[number])
      ? lineHeight
      : 1.9,
    contentWidth: contentWidthOptions.includes(contentWidth as (typeof contentWidthOptions)[number])
      ? contentWidth
      : 760,
  };
}

function serializePreference(preference: ReadingPreference) {
  return JSON.stringify({
    fontSize: preference.fontSize,
    theme: preference.theme,
    lineHeight: preference.lineHeight,
    contentWidth: preference.contentWidth,
  });
}

function preferenceStatusText(status: PreferenceStatus, isAuthenticated: boolean) {
  if (status === 'saving') {
    return '正在同步...';
  }
  if (status === 'error') {
    return '同步失败，当前偏好已保存在本机';
  }
  if (!isAuthenticated || status === 'local') {
    return '偏好已保存在本机';
  }
  return '偏好已同步到账号';
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
