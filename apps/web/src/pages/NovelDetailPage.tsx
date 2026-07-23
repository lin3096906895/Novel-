import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowDownUp,
  BookMarked,
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Flag,
  Layers3,
  Megaphone,
  MessageCircle,
  Pin,
  Star,
} from 'lucide-react';
import { api } from '../api/client';
import type {
  ChapterSummary,
  Novel,
  NovelAnnouncement,
  NovelComment,
  NovelRatingSummary,
  PaginatedComments,
  ParagraphReportReason,
  ReadingHistory,
} from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { NovelCover } from '../components/NovelCover';
import { CommentReportForm } from '../components/CommentReportForm';
import type { CommentReportTarget } from '../components/CommentReportForm';
import { ContentReportForm } from '../components/ContentReportForm';
import { NovelCommentThread, updateNovelCommentItems } from '../components/NovelCommentThread';
import { formatWordCount } from '../utils/format';

const chapterPageSize = 20;

type ChapterOrder = 'asc' | 'desc';

const emptyRating: NovelRatingSummary = {
  average: 0,
  count: 0,
  distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  myScore: null,
};

export function NovelDetailPage() {
  const { id } = useParams();
  const { token, isAuthenticated, user } = useAuth();
  const [novel, setNovel] = useState<Novel>();
  const [chapters, setChapters] = useState<ChapterSummary[]>([]);
  const [announcements, setAnnouncements] = useState<NovelAnnouncement[]>([]);
  const [chapterOrder, setChapterOrder] = useState<ChapterOrder>('asc');
  const [chapterPage, setChapterPage] = useState(1);
  const [comments, setComments] = useState<PaginatedComments>({
    items: [],
    pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
  });
  const [history, setHistory] = useState<ReadingHistory | null>(null);
  const [rating, setRating] = useState<NovelRatingSummary>(emptyRating);
  const [hoveredRating, setHoveredRating] = useState<number>();
  const [isRatingSaving, setIsRatingSaving] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [replyingToId, setReplyingToId] = useState<string>();
  const [replyText, setReplyText] = useState('');
  const [isReplySubmitting, setIsReplySubmitting] = useState(false);
  const [commentActionId, setCommentActionId] = useState<string>();
  const [isInBookshelf, setIsInBookshelf] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isLoadingMoreComments, setIsLoadingMoreComments] = useState(false);
  const [reportingComment, setReportingComment] = useState<NovelComment>();
  const [commentReportTarget, setCommentReportTarget] = useState<CommentReportTarget>('comment');
  const [commentReportReason, setCommentReportReason] = useState<ParagraphReportReason>('SPAM');
  const [commentReportDetail, setCommentReportDetail] = useState('');
  const [isCommentReportSubmitting, setIsCommentReportSubmitting] = useState(false);
  const [isNovelReportOpen, setIsNovelReportOpen] = useState(false);
  const [novelReportReason, setNovelReportReason] = useState<ParagraphReportReason>('OTHER');
  const [novelReportDetail, setNovelReportDetail] = useState('');
  const [isNovelReportSubmitting, setIsNovelReportSubmitting] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  async function load(novelId: string, activeToken?: string) {
    setIsLoading(true);
    setError(undefined);
    try {
      const [
        detail,
        chapterList,
        announcementList,
        readingHistory,
        bookshelf,
        commentList,
        ratingSummary,
      ] = await Promise.all([
        api.getNovel(novelId),
        api.listChapters(novelId),
        api.listNovelAnnouncements(novelId),
        activeToken ? api.getReadingHistory(activeToken, novelId) : Promise.resolve(null),
        activeToken ? api.listBookshelf(activeToken) : Promise.resolve([]),
        api.listComments(novelId, { page: 1, pageSize: 10 }, activeToken),
        api.getNovelRating(novelId, activeToken),
      ]);
      setNovel(detail);
      setChapters(chapterList);
      setAnnouncements(announcementList);
      setHistory(readingHistory);
      setIsInBookshelf(bookshelf.some((item) => item.novelId === novelId));
      setComments(commentList);
      setRating(ratingSummary);
      setReplyingToId(undefined);
      setReplyText('');
      setChapterPage(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (id) {
      void load(id, token);
    }
  }, [id, token]);

  const orderedChapters = useMemo(() => {
    const next = [...chapters];
    return chapterOrder === 'asc' ? next : next.reverse();
  }, [chapters, chapterOrder]);

  const chapterTotalPages = Math.max(1, Math.ceil(orderedChapters.length / chapterPageSize));
  const visibleChapters = orderedChapters.slice(
    (chapterPage - 1) * chapterPageSize,
    chapterPage * chapterPageSize,
  );
  const visibleChapterGroups = visibleChapters.reduce<
    Array<{ key: string; title: string; chapters: ChapterSummary[] }>
  >((groups, chapter) => {
    const key = chapter.volumeId ?? 'ungrouped';
    const title = chapter.volume?.title ?? '未分卷';
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.key === key) {
      lastGroup.chapters.push(chapter);
    } else {
      groups.push({ key, title, chapters: [chapter] });
    }
    return groups;
  }, []);
  const firstChapter = chapters[0];
  const latestChapter = chapters[chapters.length - 1];
  const readingTarget = history?.chapter?.id ?? firstChapter?.id;
  const latestPublishedAt = latestChapter?.publishedAt ?? novel?.updatedAt;

  function changeChapterOrder() {
    setChapterOrder((current) => (current === 'asc' ? 'desc' : 'asc'));
    setChapterPage(1);
  }

  function updateBookshelfCount(delta: number) {
    setNovel((current) => {
      if (!current) {
        return current;
      }

      const currentCount = current._count?.bookshelf ?? 0;
      return {
        ...current,
        _count: {
          ...current._count,
          bookshelf: Math.max(0, currentCount + delta),
        },
      };
    });
  }

  async function addToBookshelf() {
    if (!token || !novel) {
      setMessage('请先登录后再加入书架');
      return;
    }

    setIsAdding(true);
    setMessage(undefined);
    try {
      if (isInBookshelf) {
        await api.removeFromBookshelf(token, novel.id);
        setIsInBookshelf(false);
        updateBookshelfCount(-1);
        setMessage('已移出书架');
      } else {
        await api.addToBookshelf(token, novel.id);
        setIsInBookshelf(true);
        updateBookshelfCount(1);
        setMessage('已加入书架');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '操作失败');
    } finally {
      setIsAdding(false);
    }
  }

  async function loadMoreComments() {
    if (!novel || isLoadingMoreComments) {
      return;
    }

    const nextPage = comments.pagination.page + 1;
    if (nextPage > comments.pagination.totalPages) {
      return;
    }

    setIsLoadingMoreComments(true);
    try {
      const nextComments = await api.listComments(
        novel.id,
        {
          page: nextPage,
          pageSize: comments.pagination.pageSize,
        },
        token,
      );
      setComments((current) => ({
        items: [...current.items, ...nextComments.items],
        pagination: nextComments.pagination,
      }));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '加载评论失败');
    } finally {
      setIsLoadingMoreComments(false);
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = commentText.trim();

    if (!token || !novel) {
      setMessage('请先登录后再发表评论');
      return;
    }

    if (content.length < 2) {
      setMessage('评论至少需要 2 个字');
      return;
    }

    setIsSubmittingComment(true);
    setMessage(undefined);
    try {
      const created = await api.createComment(token, novel.id, content);
      setComments((current) => ({
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
      setCommentText('');
      setMessage('评论已发布');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '评论失败');
    } finally {
      setIsSubmittingComment(false);
    }
  }

  function startReply(comment: NovelComment) {
    if (!token) {
      setMessage('登录后可以回复书评');
      return;
    }
    setReplyingToId(comment.id);
    setReplyText('');
  }

  async function submitReply(event: FormEvent<HTMLFormElement>, parent: NovelComment) {
    event.preventDefault();
    const content = replyText.trim();
    if (!token || !novel) {
      setMessage('登录后可以回复书评');
      return;
    }
    if (content.length < 2) {
      setMessage('回复至少需要 2 个字');
      return;
    }

    setIsReplySubmitting(true);
    setMessage(undefined);
    try {
      const created = await api.createComment(token, novel.id, content, parent.id);
      setComments((current) => ({
        ...current,
        items: current.items.map((comment) =>
          comment.id === parent.id
            ? { ...comment, replies: [...comment.replies, created] }
            : comment,
        ),
      }));
      setReplyingToId(undefined);
      setReplyText('');
      setMessage('回复已发布');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '回复发布失败');
    } finally {
      setIsReplySubmitting(false);
    }
  }

  async function toggleCommentLike(comment: NovelComment) {
    if (!token) {
      setMessage('登录后可以点赞评论');
      return;
    }

    setCommentActionId(comment.id);
    setMessage(undefined);
    try {
      const result = comment.isLiked
        ? await api.unlikeComment(token, comment.id)
        : await api.likeComment(token, comment.id);
      setComments((current) => ({
        ...current,
        items: updateNovelCommentItems(current.items, comment.id, (item) => ({
          ...item,
          isLiked: result.isLiked,
          likeCount: result.likeCount,
        })),
      }));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '点赞操作失败');
    } finally {
      setCommentActionId(undefined);
    }
  }

  async function saveRating(score: number) {
    if (!token || !novel) {
      setMessage('登录后可以为作品评分');
      return;
    }
    setIsRatingSaving(true);
    setMessage(undefined);
    try {
      setRating(await api.saveNovelRating(token, novel.id, score));
      setMessage(`已提交 ${score} 星评分`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '评分提交失败');
    } finally {
      setIsRatingSaving(false);
    }
  }

  async function removeRating() {
    if (!token || !novel) {
      return;
    }
    setIsRatingSaving(true);
    setMessage(undefined);
    try {
      setRating(await api.removeNovelRating(token, novel.id));
      setMessage('已取消评分');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '取消评分失败');
    } finally {
      setIsRatingSaving(false);
    }
  }

  function startCommentReport(comment: NovelComment) {
    if (!token) {
      setMessage('登录后可以举报评论');
      return;
    }
    if (comment.userId === user?.id) {
      setMessage('不能举报自己的评论');
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
    setMessage(undefined);
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
      setMessage(commentReportTarget === 'user' ? '用户举报已提交' : '评论举报已提交');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '举报提交失败');
    } finally {
      setIsCommentReportSubmitting(false);
    }
  }

  function startNovelReport() {
    if (!token) {
      setMessage('登录后可以举报作品');
      return;
    }
    if (novel?.author.id === user?.id) {
      setMessage('不能举报自己的作品');
      return;
    }
    setNovelReportReason('OTHER');
    setNovelReportDetail('');
    setIsNovelReportOpen(true);
  }

  async function submitNovelReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !novel) return;
    setIsNovelReportSubmitting(true);
    setMessage(undefined);
    try {
      await api.reportContent(token, 'NOVEL', novel.id, {
        reason: novelReportReason,
        ...(novelReportDetail.trim() ? { detail: novelReportDetail.trim() } : {}),
      });
      setIsNovelReportOpen(false);
      setNovelReportDetail('');
      setMessage('作品举报已提交，管理员会尽快处理');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '举报提交失败');
    } finally {
      setIsNovelReportSubmitting(false);
    }
  }

  if (isLoading) {
    return <DetailState text="加载中..." />;
  }

  if (error || !novel) {
    return <DetailState text={error ?? '作品不存在'} />;
  }

  return (
    <article className="detail-page">
      <header className="detail-hero">
        <NovelCover novel={novel} size="large" />
        <div className="detail-main">
          <p className="eyebrow">{novel.category.name}</p>
          <h1>{novel.title}</h1>
          <p className="detail-meta">
            <Link className="author-profile-link" to={`/authors/${novel.author.id}`}>
              {novel.author.authorProfile?.penName ?? novel.author.nickname}
            </Link>{' '}
            · {formatWordCount(novel.wordCount)} · {chapters.length}章 · {statusText(novel.status)}
          </p>
          <div className="detail-stats">
            <span>{comments.pagination.total} 条书评</span>
            <span>{novel._count?.bookshelf ?? 0} 人收藏</span>
            <span>
              <CalendarDays size={14} aria-hidden />
              {latestPublishedAt ? formatDate(latestPublishedAt) : '暂无更新'}
            </span>
          </div>
          <p className="detail-summary">{novel.summary}</p>
          <div className="tag-row">
            {novel.tags.length > 0 ? (
              novel.tags.map((tag) => <span key={tag.id}>{tag.name}</span>)
            ) : (
              <span>暂无标签</span>
            )}
          </div>
          <div className="action-row">
            {readingTarget && (
              <Link className="primary-link" to={`/chapters/${readingTarget}`}>
                <BookOpen size={18} aria-hidden />
                {history ? `继续阅读 ${history.progress}%` : '开始阅读'}
              </Link>
            )}
            <button
              className="ghost-button"
              type="button"
              onClick={addToBookshelf}
              disabled={isAdding}
            >
              <BookMarked size={18} aria-hidden />
              {isAdding ? '处理中...' : isInBookshelf ? '移出书架' : '加入书架'}
            </button>
            {novel.author.id !== user?.id && (
              <button className="ghost-button" type="button" onClick={startNovelReport}>
                <Flag size={17} aria-hidden />
                举报作品
              </button>
            )}
            {!isAuthenticated && <span className="inline-hint">登录后可同步书架、进度和评论</span>}
          </div>
          {isNovelReportOpen && (
            <ContentReportForm
              detail={novelReportDetail}
              isSubmitting={isNovelReportSubmitting}
              reason={novelReportReason}
              targetName={novel.title}
              title="举报作品"
              onCancel={() => setIsNovelReportOpen(false)}
              onDetailChange={setNovelReportDetail}
              onReasonChange={setNovelReportReason}
              onSubmit={submitNovelReport}
            />
          )}
          {history && (
            <p className="reading-hint">
              上次读到「{history.chapter.title}」，进度 {history.progress}%。
            </p>
          )}
          {message && <p className="auth-message detail-message">{message}</p>}
        </div>
      </header>

      <section className="panel novel-rating-panel">
        <div className="section-title">
          <div>
            <h2>作品评分</h2>
            <span className="muted">{rating.count} 人评分</span>
          </div>
        </div>
        <div className="novel-rating-layout">
          <div className="novel-rating-overview">
            <strong>{rating.count > 0 ? rating.average.toFixed(1) : '--'}</strong>
            <div className="rating-stars" aria-label={`平均评分 ${rating.average} 星`}>
              {[1, 2, 3, 4, 5].map((score) => (
                <Star
                  key={score}
                  size={19}
                  fill={score <= Math.round(rating.average) ? 'currentColor' : 'none'}
                  aria-hidden
                />
              ))}
            </div>
            <span>{rating.count > 0 ? '满分 5 星' : '暂时还没有评分'}</span>
          </div>

          <div className="rating-distribution" aria-label="评分分布">
            {[5, 4, 3, 2, 1].map((score) => (
              <div key={score}>
                <span>{score} 星</span>
                <i>
                  <b
                    style={{
                      width: `${rating.count > 0 ? (rating.distribution[score as 1 | 2 | 3 | 4 | 5] / rating.count) * 100 : 0}%`,
                    }}
                  />
                </i>
                <small>{rating.distribution[score as 1 | 2 | 3 | 4 | 5]}</small>
              </div>
            ))}
          </div>

          <div className="my-rating">
            <span>{rating.myScore ? `我的评分：${rating.myScore} 星` : '给这部作品评分'}</span>
            <div className="my-rating-stars" onMouseLeave={() => setHoveredRating(undefined)}>
              {[1, 2, 3, 4, 5].map((score) => {
                const activeScore = hoveredRating ?? rating.myScore ?? 0;
                return (
                  <button
                    key={score}
                    className={score <= activeScore ? 'active' : ''}
                    type="button"
                    disabled={isRatingSaving}
                    onMouseEnter={() => setHoveredRating(score)}
                    onFocus={() => setHoveredRating(score)}
                    onBlur={() => setHoveredRating(undefined)}
                    onClick={() => void saveRating(score)}
                    aria-label={`评 ${score} 星`}
                    title={`评 ${score} 星`}
                  >
                    <Star
                      size={25}
                      fill={score <= activeScore ? 'currentColor' : 'none'}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
            {rating.myScore ? (
              <button
                className="rating-remove-button"
                type="button"
                disabled={isRatingSaving}
                onClick={() => void removeRating()}
              >
                取消评分
              </button>
            ) : (
              <small>{isAuthenticated ? '点击星星即可提交' : '登录后可以评分'}</small>
            )}
          </div>
        </div>
      </section>

      {announcements.length > 0 && (
        <section className="panel novel-announcement-panel">
          <div className="section-title">
            <div>
              <h2>作品公告</h2>
              <span className="muted">{announcements.length} 条</span>
            </div>
            <Megaphone size={18} aria-hidden />
          </div>
          <div className="public-announcement-list">
            {announcements.map((announcement) => (
              <article className="public-announcement-item" key={announcement.id}>
                <div className="public-announcement-title">
                  <h3>{announcement.title}</h3>
                  {announcement.isPinned && (
                    <span>
                      <Pin size={13} aria-hidden />
                      置顶
                    </span>
                  )}
                  <time dateTime={announcement.publishedAt ?? undefined}>
                    {announcement.publishedAt ? formatDate(announcement.publishedAt) : ''}
                  </time>
                </div>
                <p>{announcement.content}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="section-title chapter-titlebar">
          <div>
            <h2>目录</h2>
            <span className="muted">{chapters.length} 章</span>
          </div>
          <div className="chapter-tools">
            <button type="button" onClick={changeChapterOrder}>
              <ArrowDownUp size={16} aria-hidden />
              {chapterOrder === 'asc' ? '正序' : '倒序'}
            </button>
          </div>
        </div>

        {visibleChapters.length === 0 ? (
          <p className="state-line">暂无已发布章节</p>
        ) : (
          <div className="chapter-volume-groups">
            {visibleChapterGroups.map((group) => (
              <section className="chapter-volume-group" key={group.key}>
                <div className="chapter-volume-heading">
                  <Layers3 size={16} aria-hidden />
                  <strong>{group.title}</strong>
                  <span>{group.chapters.length} 章</span>
                </div>
                <div className="chapter-list enhanced">
                  {group.chapters.map((chapter) => (
                    <Link key={chapter.id} to={`/chapters/${chapter.id}`}>
                      <span>
                        <strong>
                          {chapter.orderIndex}. {chapter.title}
                        </strong>
                        <small>
                          {formatWordCount(chapter.wordCount)} ·{' '}
                          {chapter.publishedAt ? formatDate(chapter.publishedAt) : '待发布'}
                        </small>
                      </span>
                      <ChevronRight size={16} aria-hidden />
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {chapterTotalPages > 1 && (
          <nav className="pagination-bar" aria-label="目录分页">
            <button
              type="button"
              disabled={chapterPage <= 1}
              onClick={() => setChapterPage((page) => page - 1)}
            >
              <ChevronLeft size={16} aria-hidden />
              上一页
            </button>
            <span>
              第 {chapterPage} / {chapterTotalPages} 页
            </span>
            <button
              type="button"
              disabled={chapterPage >= chapterTotalPages}
              onClick={() => setChapterPage((page) => page + 1)}
            >
              下一页
              <ChevronRight size={16} aria-hidden />
            </button>
          </nav>
        )}
      </section>

      <section className="panel">
        <div className="section-title">
          <h2>作品书评</h2>
          <span className="muted">{comments.pagination.total} 条</span>
        </div>

        <form className="comment-form" onSubmit={submitComment}>
          <textarea
            disabled={!isAuthenticated}
            minLength={2}
            maxLength={500}
            placeholder={
              isAuthenticated ? `${user?.nickname ?? '我'}，写下书评` : '登录后可以发表书评'
            }
            value={commentText}
            onChange={(event) => setCommentText(event.target.value)}
          />
          <button
            className="primary-link"
            type="submit"
            disabled={!isAuthenticated || isSubmittingComment || commentText.trim().length < 2}
          >
            <MessageCircle size={17} aria-hidden />
            {isSubmittingComment ? '发布中...' : '发表书评'}
          </button>
        </form>

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

        <div className="comment-list">
          {comments.items.length === 0 && <p className="state-line">暂无书评</p>}
          {comments.items.map((comment) => (
            <NovelCommentThread
              key={comment.id}
              comment={comment}
              currentUserId={user?.id}
              actionId={commentActionId}
              replyingToId={replyingToId}
              replyText={replyText}
              isReplySubmitting={isReplySubmitting}
              deletedText="该书评已删除"
              onReply={startReply}
              onReplyTextChange={setReplyText}
              onCancelReply={() => {
                setReplyingToId(undefined);
                setReplyText('');
              }}
              onSubmitReply={submitReply}
              onReport={startCommentReport}
              onToggleLike={(item) => void toggleCommentLike(item)}
            />
          ))}
        </div>

        {comments.pagination.page < comments.pagination.totalPages && (
          <div className="load-more-row">
            <button type="button" onClick={loadMoreComments} disabled={isLoadingMoreComments}>
              {isLoadingMoreComments ? '加载中...' : '加载更多评论'}
            </button>
          </div>
        )}
      </section>
    </article>
  );
}

function DetailState({ text }: { text: string }) {
  return (
    <section className="empty-state">
      <h1>{text}</h1>
      <Link to="/">返回书城</Link>
    </section>
  );
}

function statusText(status: Novel['status']) {
  const text: Record<Novel['status'], string> = {
    DRAFT: '草稿',
    REVIEWING: '审核中',
    REJECTED: '已驳回',
    SERIALIZING: '连载中',
    COMPLETED: '已完结',
    HIDDEN: '已隐藏',
  };
  return text[status];
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
