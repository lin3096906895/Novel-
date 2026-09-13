import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, RefreshCw, UserMinus, UsersRound } from 'lucide-react';
import { api } from '../api/client';
import type { FollowedAuthor } from '../api/types';
import { useAuth } from '../auth/AuthContext';

export function FollowingPage() {
  const { token, isAuthenticated, isReady } = useAuth();
  const [items, setItems] = useState<FollowedAuthor[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [updatingAuthorId, setUpdatingAuthorId] = useState('');
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  async function load() {
    if (!token) {
      return;
    }
    setIsLoading(true);
    setError(undefined);
    try {
      setItems(await api.listFollowedAuthors(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : '关注列表加载失败');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (token) {
      void load();
    }
  }, [token]);

  async function unfollow(item: FollowedAuthor) {
    if (!token) {
      return;
    }
    setUpdatingAuthorId(item.author.id);
    setMessage(undefined);
    setError(undefined);
    try {
      await api.unfollowAuthor(token, item.author.id);
      setItems((current) => current.filter((entry) => entry.author.id !== item.author.id));
      setMessage(`已取消关注 ${item.author.penName}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消关注失败');
    } finally {
      setUpdatingAuthorId('');
    }
  }

  if (!isReady) {
    return <FollowingState title="正在恢复登录状态..." />;
  }
  if (!isAuthenticated) {
    return (
      <FollowingState title="请先登录">
        <Link className="primary-link" to="/login">
          去登录
        </Link>
      </FollowingState>
    );
  }

  return (
    <section className="following-page">
      <header className="topbar product-page-header following-page-header">
        <div>
          <p className="eyebrow">我的关注</p>
          <h1>关注的作者</h1>
        </div>
        <button className="ghost-button" type="button" disabled={isLoading} onClick={() => load()}>
          <RefreshCw size={16} aria-hidden />
          刷新
        </button>
      </header>

      {error && <p className="auth-error">{error}</p>}
      {message && <p className="auth-message">{message}</p>}

      <section className="panel">
        <div className="section-title">
          <h2>作者列表</h2>
          <span className="muted">{items.length} 位</span>
        </div>
        {isLoading && <p className="state-line">正在加载...</p>}
        {!isLoading && items.length === 0 && (
          <p className="state-line">还没有关注作者，可以从作品详情进入作者主页</p>
        )}
        <div className="followed-author-list">
          {items.map((item) => (
            <article className="followed-author-row" key={item.author.id}>
              <Link className="followed-author-avatar" to={`/authors/${item.author.id}`}>
                {item.author.penName.slice(0, 1)}
              </Link>
              <div className="followed-author-copy">
                <Link to={`/authors/${item.author.id}`}>
                  <h3>{item.author.penName}</h3>
                </Link>
                <p>{item.author.bio || '作者暂未填写简介。'}</p>
                <small>
                  <UsersRound size={14} aria-hidden />
                  {item.author.followers} 位关注者 · {item.author.works} 本公开作品 · 关注于{' '}
                  {new Date(item.followedAt).toLocaleDateString('zh-CN')}
                </small>
                <div className="followed-author-latest">
                  <BookOpen size={14} aria-hidden />
                  {item.latestNovels.length > 0 ? (
                    item.latestNovels.map((novel) => (
                      <Link key={novel.id} to={`/novels/${novel.id}`}>
                        {novel.title}
                      </Link>
                    ))
                  ) : (
                    <span>暂无公开作品</span>
                  )}
                </div>
              </div>
              <button
                className="ghost-button"
                type="button"
                disabled={updatingAuthorId === item.author.id}
                onClick={() => void unfollow(item)}
              >
                <UserMinus size={16} aria-hidden />
                取消关注
              </button>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function FollowingState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className="empty-state">
      <h1>{title}</h1>
      {children}
    </section>
  );
}
