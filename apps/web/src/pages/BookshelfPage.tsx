import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpDown,
  BellOff,
  BellRing,
  Bookmark,
  BookmarkX,
  BookOpen,
  Clock3,
  History,
  LibraryBig,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { api } from '../api/client';
import type { BookshelfItem, ChapterBookmark } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { NovelCover } from '../components/NovelCover';
import { formatReadingDuration } from '../utils/format';

type BookshelfSort = 'updated' | 'unread' | 'recent' | 'added' | 'title';

const sortOptions: Array<{ value: BookshelfSort; label: string }> = [
  { value: 'updated', label: '最新更新' },
  { value: 'unread', label: '有更新优先' },
  { value: 'recent', label: '最近阅读' },
  { value: 'added', label: '最近收藏' },
  { value: 'title', label: '书名排序' },
];

export function BookshelfPage() {
  const { token, isAuthenticated, isReady } = useAuth();
  const [items, setItems] = useState<BookshelfItem[]>([]);
  const [bookmarks, setBookmarks] = useState<ChapterBookmark[]>([]);
  const [sort, setSort] = useState<BookshelfSort>('updated');
  const [isLoading, setIsLoading] = useState(false);
  const [removingNovelId, setRemovingNovelId] = useState<string>();
  const [updatingNotificationId, setUpdatingNotificationId] = useState<string>();
  const [removingBookmarkId, setRemovingBookmarkId] = useState<string>();
  const [pendingRemoveId, setPendingRemoveId] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  async function load() {
    if (!token) {
      return;
    }

    setIsLoading(true);
    setMessage(undefined);
    setError(undefined);
    try {
      const [bookshelfItems, chapterBookmarks] = await Promise.all([
        api.listBookshelf(token),
        api.listBookmarks(token),
      ]);
      setItems(bookshelfItems);
      setBookmarks(chapterBookmarks);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      void load();
    }
  }, [token]);

  const sortedItems = useMemo(() => {
    return [...items].sort((left, right) => {
      if (sort === 'title') {
        return left.novel.title.localeCompare(right.novel.title, 'zh-CN');
      }
      if (sort === 'unread') {
        return (
          Number(right.hasUpdate) - Number(left.hasUpdate) ||
          right.unreadCount - left.unreadCount ||
          dateValue(right.lastUpdatedAt) - dateValue(left.lastUpdatedAt)
        );
      }
      if (sort === 'recent') {
        return (
          dateValue(right.lastReadAt) - dateValue(left.lastReadAt) ||
          dateValue(right.createdAt) - dateValue(left.createdAt)
        );
      }
      if (sort === 'added') {
        return dateValue(right.createdAt) - dateValue(left.createdAt);
      }

      return (
        dateValue(right.lastUpdatedAt) - dateValue(left.lastUpdatedAt) ||
        left.novel.title.localeCompare(right.novel.title, 'zh-CN')
      );
    });
  }, [items, sort]);

  const updatedBooks = items.filter((item) => item.hasUpdate).length;
  const readingBooks = items.filter((item) => item.lastReadAt).length;
  const totalUnreadChapters = items.reduce((total, item) => total + item.unreadCount, 0);

  async function remove(novelId: string) {
    if (!token) {
      return;
    }

    if (pendingRemoveId !== novelId) {
      setPendingRemoveId(novelId);
      setMessage('再次点击确认移出书架');
      return;
    }

    setRemovingNovelId(novelId);
    setMessage(undefined);
    setError(undefined);
    try {
      await api.removeFromBookshelf(token, novelId);
      setItems((current) => current.filter((item) => item.novel.id !== novelId));
      setPendingRemoveId(undefined);
      setMessage('已移出书架');
    } catch (err) {
      setError(err instanceof Error ? err.message : '移出书架失败');
    } finally {
      setRemovingNovelId(undefined);
    }
  }

  async function toggleUpdateNotification(item: BookshelfItem) {
    if (!token) {
      return;
    }

    const enabled = !item.notifyOnUpdate;
    setUpdatingNotificationId(item.novelId);
    setMessage(undefined);
    setError(undefined);
    try {
      await api.updateBookshelfNotification(token, item.novelId, enabled);
      setItems((current) =>
        current.map((entry) =>
          entry.id === item.id ? { ...entry, notifyOnUpdate: enabled } : entry,
        ),
      );
      setMessage(`${enabled ? '已开启' : '已关闭'}《${item.novel.title}》更新提醒`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新提醒设置失败');
    } finally {
      setUpdatingNotificationId(undefined);
    }
  }

  async function removeBookmark(bookmark: ChapterBookmark) {
    if (!token) {
      return;
    }

    setRemovingBookmarkId(bookmark.id);
    setMessage(undefined);
    setError(undefined);
    try {
      await api.removeChapterBookmark(token, bookmark.chapterId);
      setBookmarks((current) => current.filter((item) => item.id !== bookmark.id));
      setMessage('章节书签已移除');
    } catch (err) {
      setError(err instanceof Error ? err.message : '移除书签失败');
    } finally {
      setRemovingBookmarkId(undefined);
    }
  }

  if (!isReady) {
    return <BookshelfState title="正在恢复登录状态..." />;
  }

  if (!isAuthenticated) {
    return (
      <BookshelfState title="请先登录">
        <Link className="primary-link" to="/login">
          去登录
        </Link>
      </BookshelfState>
    );
  }

  return (
    <section className="bookshelf-page">
      <header className="topbar">
        <div>
          <p className="eyebrow">我的阅读</p>
          <h1>书架</h1>
        </div>
        <button className="ghost-button" type="button" onClick={() => load()} disabled={isLoading}>
          <RefreshCw size={16} aria-hidden />
          刷新
        </button>
      </header>

      {error && <p className="auth-error">{error}</p>}
      {message && <p className="auth-message">{message}</p>}

      <section className="layout-grid">
        <div className="main-column">
          <section className="panel">
            <div className="section-title bookshelf-section-title">
              <div>
                <h2>收藏作品</h2>
                <span className="muted">{items.length} 本</span>
              </div>
              <label className="bookshelf-sort-control">
                <ArrowUpDown size={15} aria-hidden />
                <span>排序</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as BookshelfSort)}
                >
                  {sortOptions.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {isLoading && <p className="state-line">加载中...</p>}
            {!isLoading && items.length === 0 && <p className="state-line">书架还是空的</p>}
            <div className="bookshelf-list">
              {sortedItems.map((item) => (
                <article
                  className={`bookshelf-row${item.hasUpdate ? ' has-update' : ''}`}
                  key={item.id}
                >
                  <Link className="bookshelf-cover-link" to={`/novels/${item.novel.id}`}>
                    <NovelCover novel={item.novel} size="mini" />
                  </Link>
                  <div className="bookshelf-copy">
                    <div className="bookshelf-title-line">
                      <Link to={`/novels/${item.novel.id}`}>
                        <h3>{item.novel.title}</h3>
                      </Link>
                      {item.hasUpdate && (
                        <span className="bookshelf-update-badge">更新 {item.unreadCount}</span>
                      )}
                    </div>
                    <p className="bookshelf-summary">{item.novel.summary}</p>
                    <small className="bookshelf-meta">
                      {item.novel.category.name} · {item.novel.author.nickname}
                    </small>
                    <div className="bookshelf-reading-state">
                      <BookOpen size={15} aria-hidden />
                      {item.lastReadAt && item.continueChapter ? (
                        <span>
                          读至{' '}
                          <Link to={`/chapters/${item.continueChapter.id}`}>
                            {item.continueChapter.title}
                          </Link>{' '}
                          · {item.readingProgress}% · 已读{' '}
                          {formatReadingDuration(item.readingSeconds)}
                        </span>
                      ) : (
                        <span>尚未开始</span>
                      )}
                    </div>
                    <div className="bookshelf-latest-line">
                      <Clock3 size={15} aria-hidden />
                      {item.latestChapter ? (
                        <>
                          <span>最新</span>
                          <Link to={`/chapters/${item.latestChapter.id}`}>
                            {item.latestChapter.title}
                          </Link>
                          <small>{formatUpdateDate(item.lastUpdatedAt)}</small>
                        </>
                      ) : (
                        <span>暂无已发布章节</span>
                      )}
                    </div>
                  </div>
                  <div className="bookshelf-actions">
                    {item.continueChapter && (
                      <Link className="primary-link" to={`/chapters/${item.continueChapter.id}`}>
                        {item.lastReadAt ? (
                          <BookOpen size={16} aria-hidden />
                        ) : (
                          <Play size={16} aria-hidden />
                        )}
                        {item.lastReadAt ? '继续阅读' : '从头开始'}
                      </Link>
                    )}
                    <Link className="ghost-button" to={`/novels/${item.novel.id}`}>
                      作品详情
                    </Link>
                    <div className="bookshelf-action-icons">
                      <button
                        className={`icon-button notification-toggle${item.notifyOnUpdate ? ' active' : ''}`}
                        type="button"
                        disabled={updatingNotificationId === item.novelId}
                        onClick={() => void toggleUpdateNotification(item)}
                        aria-label={item.notifyOnUpdate ? '关闭更新提醒' : '开启更新提醒'}
                        title={item.notifyOnUpdate ? '关闭更新提醒' : '开启更新提醒'}
                      >
                        {item.notifyOnUpdate ? (
                          <BellRing size={17} aria-hidden />
                        ) : (
                          <BellOff size={17} aria-hidden />
                        )}
                      </button>
                      <button
                        className={`icon-button remove-button${pendingRemoveId === item.novel.id ? ' pending' : ''}`}
                        type="button"
                        disabled={removingNovelId === item.novel.id}
                        onClick={() => remove(item.novel.id)}
                        aria-label={pendingRemoveId === item.novel.id ? '确认移出书架' : '移出书架'}
                        title={pendingRemoveId === item.novel.id ? '确认移出' : '移出书架'}
                      >
                        <Trash2 size={17} aria-hidden />
                        {pendingRemoveId === item.novel.id && <span>确认</span>}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="side-column">
          <section className="panel bookshelf-overview">
            <h2>追更概览</h2>
            <div className="bookshelf-overview-list">
              <article>
                <BellRing size={18} aria-hidden />
                <span>
                  <strong>{updatedBooks} 本有更新</strong>
                  <small>{totalUnreadChapters} 章待读</small>
                </span>
              </article>
              <article>
                <History size={18} aria-hidden />
                <span>
                  <strong>{readingBooks} 本阅读中</strong>
                  <small>{items.length - readingBooks} 本尚未开始</small>
                </span>
              </article>
              <article>
                <LibraryBig size={18} aria-hidden />
                <span>
                  <strong>{items.length} 本收藏</strong>
                  <small>{bookmarks.length} 个章节书签</small>
                </span>
              </article>
            </div>
          </section>

          <section className="panel">
            <div className="section-title">
              <h2>章节书签</h2>
              <span className="muted">{bookmarks.length} 个</span>
            </div>
            {bookmarks.length === 0 && <p className="state-line">暂无章节书签</p>}
            <div className="bookmark-list">
              {bookmarks.map((bookmark) => (
                <article key={bookmark.id}>
                  <Link to={`/chapters/${bookmark.chapter.id}`}>
                    <Bookmark size={17} aria-hidden />
                    <span>
                      <strong>{bookmark.chapter.novel.title}</strong>
                      <small>{bookmark.chapter.title}</small>
                    </span>
                  </Link>
                  <button
                    className="icon-button"
                    type="button"
                    disabled={removingBookmarkId === bookmark.id}
                    onClick={() => void removeBookmark(bookmark)}
                    aria-label={`移除《${bookmark.chapter.novel.title}》${bookmark.chapter.title}的书签`}
                    title="移除书签"
                  >
                    <BookmarkX size={16} aria-hidden />
                  </button>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </section>
  );
}

function BookshelfState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="empty-state">
      <h1>{title}</h1>
      {children}
    </section>
  );
}

function dateValue(value?: string | null) {
  return value ? new Date(value).getTime() : 0;
}

function formatUpdateDate(value?: string | null) {
  if (!value) {
    return '';
  }

  return new Date(value).toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  });
}
