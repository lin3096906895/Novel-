import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BookOpen, Flag, Library, PenLine, UserCheck, UserPlus, UsersRound } from 'lucide-react';
import { api } from '../api/client';
import type { Novel, ParagraphReportReason, PublicAuthorProfile } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ContentReportForm } from '../components/ContentReportForm';
import { NovelCover } from '../components/NovelCover';
import { formatWordCount } from '../utils/format';

export function AuthorProfilePage() {
  const { id } = useParams();
  const { token } = useAuth();
  const [profile, setProfile] = useState<PublicAuthorProfile>();
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdatingFollow, setIsUpdatingFollow] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<ParagraphReportReason>('OTHER');
  const [reportDetail, setReportDetail] = useState('');
  const [isReportSubmitting, setIsReportSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    let isMounted = true;
    if (!id) {
      setError('作者不存在');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(undefined);
    api
      .getPublicAuthor(id, token)
      .then((result) => {
        if (isMounted) {
          setProfile(result);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err instanceof Error ? err.message : '作者主页加载失败');
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [id, token]);

  async function toggleFollow() {
    if (!profile) {
      return;
    }
    if (!token) {
      setMessage('登录后可以关注作者');
      return;
    }

    setIsUpdatingFollow(true);
    setMessage(undefined);
    try {
      const result = profile.isFollowing
        ? await api.unfollowAuthor(token, profile.id)
        : await api.followAuthor(token, profile.id);
      setProfile((current) =>
        current
          ? {
              ...current,
              isFollowing: result.isFollowing,
              stats: { ...current.stats, followers: result.followerCount },
            }
          : current,
      );
      setMessage(result.isFollowing ? '已关注作者' : '已取消关注');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '关注操作失败');
    } finally {
      setIsUpdatingFollow(false);
    }
  }

  function startAuthorReport() {
    if (!token) {
      setMessage('登录后可以举报作者');
      return;
    }
    setReportReason('OTHER');
    setReportDetail('');
    setIsReportOpen(true);
  }

  async function submitAuthorReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !profile) return;
    setIsReportSubmitting(true);
    setMessage(undefined);
    try {
      await api.reportContent(token, 'AUTHOR', profile.id, {
        reason: reportReason,
        ...(reportDetail.trim() ? { detail: reportDetail.trim() } : {}),
      });
      setIsReportOpen(false);
      setReportDetail('');
      setMessage('作者举报已提交，管理员会尽快处理');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : '举报提交失败');
    } finally {
      setIsReportSubmitting(false);
    }
  }

  if (isLoading) {
    return <AuthorProfileState text="正在加载作者主页..." />;
  }

  if (error || !profile) {
    return <AuthorProfileState text={error ?? '作者不存在'} />;
  }

  return (
    <article className="public-author-page">
      <header className="public-author-hero">
        <div className="public-author-avatar" aria-hidden>
          {profile.penName.slice(0, 1)}
        </div>
        <div className="public-author-copy">
          <p className="eyebrow">原创作者</p>
          <h1>{profile.penName}</h1>
          <span className="public-author-nickname">账号昵称：{profile.nickname}</span>
          <p>{profile.bio || '这位作者还没有填写个人简介。'}</p>
          <small>自 {formatMonth(profile.authorSince)} 开始创作</small>
        </div>
        <div className="public-author-actions">
          {profile.isSelf ? (
            <Link className="primary-link" to="/author">
              <PenLine size={17} aria-hidden />
              管理我的作品
            </Link>
          ) : (
            <>
              <button
                className={profile.isFollowing ? 'ghost-button' : 'primary-link'}
                type="button"
                disabled={isUpdatingFollow}
                onClick={() => void toggleFollow()}
              >
                {profile.isFollowing ? (
                  <UserCheck size={17} aria-hidden />
                ) : (
                  <UserPlus size={17} aria-hidden />
                )}
                {isUpdatingFollow ? '处理中...' : profile.isFollowing ? '已关注' : '关注作者'}
              </button>
              <button className="ghost-button" type="button" onClick={startAuthorReport}>
                <Flag size={17} aria-hidden />
                举报作者
              </button>
            </>
          )}
          {message && <span>{message}</span>}
        </div>
      </header>

      {isReportOpen && (
        <div className="public-author-report">
          <ContentReportForm
            detail={reportDetail}
            isSubmitting={isReportSubmitting}
            reason={reportReason}
            targetName={profile.penName}
            title="举报作者"
            onCancel={() => setIsReportOpen(false)}
            onDetailChange={setReportDetail}
            onReasonChange={setReportReason}
            onSubmit={submitAuthorReport}
          />
        </div>
      )}

      <section className="public-author-stats" aria-label="作者数据">
        <article>
          <UsersRound size={18} aria-hidden />
          <strong>{profile.stats.followers.toLocaleString('zh-CN')}</strong>
          <span>关注者</span>
        </article>
        <article>
          <Library size={18} aria-hidden />
          <strong>{profile.stats.works}</strong>
          <span>公开作品</span>
        </article>
        <article>
          <PenLine size={18} aria-hidden />
          <strong>{formatWordCount(profile.stats.words)}</strong>
          <span>累计字数</span>
        </article>
        <article>
          <BookOpen size={18} aria-hidden />
          <strong>{profile.stats.chapters}</strong>
          <span>已发章节</span>
        </article>
      </section>

      <section className="panel public-author-works">
        <div className="section-title">
          <h2>作者作品</h2>
          <span className="muted">{profile.novels.length} 本</span>
        </div>
        {profile.novels.length === 0 && <p className="state-line">暂无公开作品</p>}
        <div className="public-author-work-list">
          {profile.novels.map((novel) => (
            <AuthorWorkRow novel={novel} key={novel.id} />
          ))}
        </div>
      </section>
    </article>
  );
}

function AuthorWorkRow({ novel }: { novel: Novel }) {
  return (
    <article className="public-author-work-row">
      <Link to={`/novels/${novel.id}`}>
        <NovelCover novel={novel} size="mini" />
      </Link>
      <div>
        <Link to={`/novels/${novel.id}`}>
          <h3>{novel.title}</h3>
        </Link>
        <p>{novel.summary}</p>
        <small>
          {novel.category.name} · {novel.status === 'COMPLETED' ? '已完结' : '连载中'} ·{' '}
          {formatWordCount(novel.wordCount)} · {novel._count?.bookshelf ?? 0} 人收藏
        </small>
        <div className="tag-row">
          {novel.tags.map((tag) => (
            <span key={tag.id}>{tag.name}</span>
          ))}
        </div>
      </div>
      <Link className="ghost-button" to={`/novels/${novel.id}`}>
        查看作品
      </Link>
    </article>
  );
}

function AuthorProfileState({ text }: { text: string }) {
  return (
    <section className="empty-state">
      <h1>{text}</h1>
      <Link to="/">返回书城</Link>
    </section>
  );
}

function formatMonth(value: string) {
  return new Date(value).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
  });
}
