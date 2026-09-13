import { useEffect, useState } from 'react';
import {
  Bell,
  BookOpenCheck,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ListFilter,
  MessageCircle,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Notification, NotificationListResponse, NotificationType } from '../api/types';
import { useAuth } from '../auth/AuthContext';

export function NotificationsPage() {
  const { token, isReady, isAuthenticated } = useAuth();
  const [data, setData] = useState<NotificationListResponse>();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [type, setType] = useState<NotificationType | 'ALL'>('ALL');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!token) {
      setData(undefined);
      return;
    }

    let active = true;
    setIsLoading(true);
    setError(undefined);
    api
      .listNotifications(token, {
        page,
        pageSize: 12,
        unreadOnly,
        type: type === 'ALL' ? undefined : type,
      })
      .then((result) => {
        if (active) {
          setData(result);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : '通知加载失败');
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [page, token, type, unreadOnly]);

  async function markRead(notificationId: string) {
    if (!token) {
      return;
    }
    try {
      await api.markNotificationRead(token, notificationId);
      setData((current) =>
        current
          ? {
              ...current,
              unreadCount: Math.max(0, current.unreadCount - 1),
              pagination: unreadOnly
                ? {
                    ...current.pagination,
                    total: Math.max(0, current.pagination.total - 1),
                    totalPages: Math.ceil(
                      Math.max(0, current.pagination.total - 1) / current.pagination.pageSize,
                    ),
                  }
                : current.pagination,
              items: unreadOnly
                ? current.items.filter((item) => item.id !== notificationId)
                : current.items.map((item) =>
                    item.id === notificationId ? { ...item, isRead: true } : item,
                  ),
            }
          : current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  }

  async function markAllRead() {
    if (!token) {
      return;
    }
    try {
      await api.markAllNotificationsRead(token);
      setData((current) =>
        current
          ? {
              ...current,
              unreadCount: 0,
              pagination: unreadOnly
                ? { ...current.pagination, total: 0, totalPages: 0 }
                : current.pagination,
              items: unreadOnly ? [] : current.items.map((item) => ({ ...item, isRead: true })),
            }
          : current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败');
    }
  }

  if (!isReady) {
    return <p className="state-line">正在恢复登录状态...</p>;
  }

  if (!isAuthenticated) {
    return (
      <section className="notifications-page notifications-empty">
        <Bell size={28} aria-hidden />
        <h1>通知</h1>
        <p>登录后可接收审核结果和作品互动消息。</p>
        <Link className="primary-link" to="/login">
          <UserRound size={16} aria-hidden />
          登录
        </Link>
      </section>
    );
  }

  return (
    <section className="notifications-page">
      <header className="topbar product-page-header notifications-page-header">
        <div>
          <p className="eyebrow">消息中心</p>
          <h1>通知</h1>
        </div>
        <button
          className="ghost-button"
          type="button"
          disabled={!data?.unreadCount}
          onClick={() => void markAllRead()}
        >
          <CheckCheck size={16} aria-hidden />
          全部已读
        </button>
      </header>

      {error && <p className="auth-error">{error}</p>}

      <div className="notifications-toolbar">
        <div className="notification-filter-controls">
          <div className="segmented-control" aria-label="通知筛选">
            <button
              className={!unreadOnly ? 'active' : ''}
              type="button"
              onClick={() => {
                setUnreadOnly(false);
                setPage(1);
              }}
            >
              全部
            </button>
            <button
              className={unreadOnly ? 'active' : ''}
              type="button"
              onClick={() => {
                setUnreadOnly(true);
                setPage(1);
              }}
            >
              未读 {data?.unreadCount ?? 0}
            </button>
          </div>
          <label className="notification-type-filter">
            <ListFilter size={15} aria-hidden />
            <span>类型</span>
            <select
              aria-label="通知类型"
              value={type}
              onChange={(event) => {
                setType(event.target.value as NotificationType | 'ALL');
                setPage(1);
              }}
            >
              <option value="ALL">全部类型</option>
              <option value="UPDATE">作品更新</option>
              <option value="COMMENT">互动消息</option>
              <option value="REVIEW">审核消息</option>
              <option value="SYSTEM">系统消息</option>
            </select>
          </label>
        </div>
        <span className="muted">共 {data?.pagination.total ?? 0} 条</span>
      </div>

      {isLoading && <p className="state-line">通知加载中...</p>}
      {!isLoading && data?.items.length === 0 && <p className="state-line">暂无通知</p>}
      <div className="notification-list">
        {data?.items.map((item) => (
          <NotificationRow item={item} key={item.id} onMarkRead={markRead} />
        ))}
      </div>

      {(data?.pagination.totalPages ?? 0) > 1 && (
        <div className="pagination-row">
          <button
            className="ghost-button"
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            <ChevronLeft size={16} aria-hidden />
            上一页
          </button>
          <span>
            {page} / {data?.pagination.totalPages}
          </span>
          <button
            className="ghost-button"
            type="button"
            disabled={page >= (data?.pagination.totalPages ?? 1)}
            onClick={() => setPage((current) => current + 1)}
          >
            下一页
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
      )}
    </section>
  );
}

function NotificationRow({
  item,
  onMarkRead,
}: {
  item: Notification;
  onMarkRead(notificationId: string): Promise<void>;
}) {
  const icon =
    item.type === 'REVIEW' ? (
      <ShieldCheck size={19} aria-hidden />
    ) : item.type === 'COMMENT' ? (
      <MessageCircle size={19} aria-hidden />
    ) : item.type === 'UPDATE' ? (
      <BookOpenCheck size={19} aria-hidden />
    ) : (
      <Bell size={19} aria-hidden />
    );

  return (
    <article className={`notification-row${item.isRead ? '' : ' unread'}`}>
      <div className="notification-icon">{icon}</div>
      <div className="notification-content">
        <div>
          <strong>{item.title}</strong>
          <small>{new Date(item.createdAt).toLocaleString('zh-CN')}</small>
        </div>
        <p>{item.content}</p>
        {item.link && (
          <Link to={item.link} onClick={() => !item.isRead && void onMarkRead(item.id)}>
            查看详情
          </Link>
        )}
      </div>
      {!item.isRead && (
        <button
          className="icon-button"
          type="button"
          aria-label="标记为已读"
          title="标记为已读"
          onClick={() => void onMarkRead(item.id)}
        >
          <Check size={16} aria-hidden />
        </button>
      )}
    </article>
  );
}
