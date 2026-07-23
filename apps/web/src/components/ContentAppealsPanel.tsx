import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, RefreshCcw, RotateCcw, Send, X } from 'lucide-react';
import { api } from '../api/client';
import type {
  ContentAppeal,
  ContentAppealStatus,
  ContentAppealTarget,
  ContentAppealTargetType,
} from '../api/types';

export function ContentAppealsPanel({ token }: { token: string }) {
  const [targets, setTargets] = useState<ContentAppealTarget[]>([]);
  const [appeals, setAppeals] = useState<ContentAppeal[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<ContentAppealTarget>();
  const [reason, setReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);
    try {
      const [eligibleTargets, history] = await Promise.all([
        api.listContentAppealTargets(token),
        api.listMyContentAppeals(token, { page: 1, pageSize: 20 }),
      ]);
      setTargets(eligibleTargets);
      setAppeals(history.items);
      setSelectedTarget((current) =>
        current
          ? eligibleTargets.find(
              (target) =>
                target.targetType === current.targetType && target.targetId === current.targetId,
            )
          : undefined,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '内容申诉加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitAppeal() {
    if (!selectedTarget || !reason.trim()) return;
    setIsSubmitting(true);
    setError(undefined);
    setMessage(undefined);
    try {
      await api.createContentAppeal(
        token,
        selectedTarget.targetType,
        selectedTarget.targetId,
        reason.trim(),
      );
      setSelectedTarget(undefined);
      setReason('');
      setMessage('申诉已提交');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '申诉提交失败');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="content-appeals-panel" aria-busy={isLoading}>
      <header className="content-appeals-header">
        <div>
          <h2>内容申诉</h2>
          <span className="muted">可申诉 {targets.length} 项</span>
        </div>
        <button
          className="icon-button"
          type="button"
          title="刷新内容申诉"
          aria-label="刷新内容申诉"
          disabled={isLoading}
          onClick={() => void load()}
        >
          <RefreshCcw size={17} aria-hidden />
        </button>
      </header>

      {(error || message) && (
        <div className={error ? 'auth-error' : 'auth-message'} role={error ? 'alert' : 'status'}>
          {error || message}
        </div>
      )}

      <div className="content-appeals-layout">
        <div className="content-appeals-column">
          <h3>可申诉内容</h3>
          {targets.length === 0 && (
            <p className="state-line">{isLoading ? '正在加载...' : '暂无可申诉内容'}</p>
          )}
          <div className="content-appeal-list">
            {targets.map((target) => (
              <article
                className="content-appeal-row"
                key={`${target.targetType}:${target.targetId}`}
              >
                <div className="content-appeal-main">
                  <span className="content-appeal-type">{targetTypeText(target.targetType)}</span>
                  <strong>{target.targetTitle}</strong>
                  <small>
                    {target.restrictionReason || '内容安全处置'} · {formatDate(target.restrictedAt)}
                  </small>
                </div>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => {
                    setSelectedTarget(target);
                    setReason('');
                    setMessage(undefined);
                  }}
                >
                  <RotateCcw size={16} aria-hidden />
                  申诉
                </button>
              </article>
            ))}
          </div>
        </div>

        <div className="content-appeals-column">
          <h3>申诉记录</h3>
          {appeals.length === 0 && (
            <p className="state-line">{isLoading ? '正在加载...' : '暂无申诉记录'}</p>
          )}
          <div className="content-appeal-list">
            {appeals.map((appeal) => (
              <article className="content-appeal-history-row" key={appeal.id}>
                <div>
                  <strong>{appeal.targetTitle}</strong>
                  <small>{formatDate(appeal.createdAt)}</small>
                </div>
                <span className={`content-appeal-status status-${appeal.status.toLowerCase()}`}>
                  {appealStatusText(appeal.status)}
                </span>
                <p>{appeal.resolution || appeal.reason}</p>
              </article>
            ))}
          </div>
        </div>
      </div>

      {selectedTarget && (
        <form
          className="content-appeal-form"
          onSubmit={(event) => {
            event.preventDefault();
            void submitAppeal();
          }}
        >
          <div className="content-appeal-form-heading">
            <div>
              <CircleAlert size={18} aria-hidden />
              <strong>{selectedTarget.targetTitle}</strong>
            </div>
            <button
              className="icon-button"
              type="button"
              title="关闭申诉表单"
              aria-label="关闭申诉表单"
              onClick={() => setSelectedTarget(undefined)}
            >
              <X size={17} aria-hidden />
            </button>
          </div>
          <label>
            申诉理由
            <textarea
              required
              maxLength={1000}
              rows={5}
              value={reason}
              placeholder="说明内容已整改或处置有误的依据"
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <button className="primary-link" type="submit" disabled={isSubmitting || !reason.trim()}>
            <Send size={16} aria-hidden />
            {isSubmitting ? '提交中...' : '提交申诉'}
          </button>
        </form>
      )}
    </section>
  );
}

function targetTypeText(targetType: ContentAppealTargetType) {
  return targetType === 'NOVEL' ? '作品' : '章节';
}

function appealStatusText(status: ContentAppealStatus) {
  return { PENDING: '待审核', APPROVED: '已通过', REJECTED: '未通过' }[status];
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}
