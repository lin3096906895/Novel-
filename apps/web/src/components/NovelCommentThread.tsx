import type { FormEvent } from 'react';
import { Flag, Heart, Reply, Send, X } from 'lucide-react';
import type { NovelComment } from '../api/types';

interface NovelCommentThreadProps {
  comment: NovelComment;
  currentUserId?: string;
  actionId?: string;
  replyingToId?: string;
  replyText: string;
  isReplySubmitting: boolean;
  deletedText: string;
  onReply: (comment: NovelComment) => void;
  onReplyTextChange: (value: string) => void;
  onCancelReply: () => void;
  onSubmitReply: (event: FormEvent<HTMLFormElement>, comment: NovelComment) => void;
  onReport: (comment: NovelComment) => void;
  onToggleLike: (comment: NovelComment) => void;
}

export function NovelCommentThread({
  comment,
  currentUserId,
  actionId,
  replyingToId,
  replyText,
  isReplySubmitting,
  deletedText,
  onReply,
  onReplyTextChange,
  onCancelReply,
  onSubmitReply,
  onReport,
  onToggleLike,
}: NovelCommentThreadProps) {
  return (
    <article className="comment-item comment-thread-item">
      <div className="comment-avatar">{comment.user.nickname.slice(0, 1)}</div>
      <div className="comment-thread-body">
        <div className="comment-meta">
          <strong>{comment.user.nickname}</strong>
          {comment.isAuthor && <span className="comment-author-badge">作者</span>}
          <time>{new Date(comment.createdAt).toLocaleString('zh-CN')}</time>
        </div>
        <p className={comment.isDeleted ? 'deleted' : ''}>{comment.content ?? deletedText}</p>
        <div className="comment-actions">
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
          {!comment.isDeleted && (
            <button type="button" onClick={() => onReply(comment)}>
              <Reply size={15} aria-hidden />
              <span>回复</span>
            </button>
          )}
          {comment.userId !== currentUserId && !comment.isDeleted && (
            <button type="button" onClick={() => onReport(comment)}>
              <Flag size={15} aria-hidden />
              <span>举报</span>
            </button>
          )}
        </div>

        {replyingToId === comment.id && (
          <form className="comment-reply-form" onSubmit={(event) => onSubmitReply(event, comment)}>
            <div className="comment-reply-heading">
              <span>回复 {comment.user.nickname}</span>
              <button type="button" onClick={onCancelReply} aria-label="取消回复" title="取消回复">
                <X size={16} aria-hidden />
              </button>
            </div>
            <textarea
              autoFocus
              minLength={2}
              maxLength={500}
              value={replyText}
              onChange={(event) => onReplyTextChange(event.target.value)}
              placeholder="写下你的回复"
            />
            <div className="comment-reply-footer">
              <span>{replyText.length} / 500</span>
              <button
                className="primary-link"
                type="submit"
                disabled={isReplySubmitting || replyText.trim().length < 2}
              >
                <Send size={15} aria-hidden />
                {isReplySubmitting ? '发布中...' : '发布回复'}
              </button>
            </div>
          </form>
        )}

        {comment.replies.length > 0 && (
          <div className="comment-replies">
            {comment.replies.map((reply) => (
              <ReplyItem
                key={reply.id}
                comment={reply}
                currentUserId={currentUserId}
                actionId={actionId}
                deletedText={deletedText}
                onReport={onReport}
                onToggleLike={onToggleLike}
              />
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function ReplyItem({
  comment,
  currentUserId,
  actionId,
  deletedText,
  onReport,
  onToggleLike,
}: Pick<
  NovelCommentThreadProps,
  'comment' | 'currentUserId' | 'actionId' | 'deletedText' | 'onReport' | 'onToggleLike'
>) {
  return (
    <article className="comment-reply-item">
      <div className="comment-avatar">{comment.user.nickname.slice(0, 1)}</div>
      <div className="comment-thread-body">
        <div className="comment-meta">
          <strong>{comment.user.nickname}</strong>
          {comment.isAuthor && <span className="comment-author-badge">作者</span>}
          <time>{new Date(comment.createdAt).toLocaleString('zh-CN')}</time>
        </div>
        <p className={comment.isDeleted ? 'deleted' : ''}>{comment.content ?? deletedText}</p>
        <div className="comment-actions">
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
          {comment.userId !== currentUserId && !comment.isDeleted && (
            <button type="button" onClick={() => onReport(comment)}>
              <Flag size={15} aria-hidden />
              <span>举报</span>
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function updateNovelCommentItems(
  items: NovelComment[],
  commentId: string,
  update: (comment: NovelComment) => NovelComment,
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
