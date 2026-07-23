import type { FormEvent } from 'react';
import type { ParagraphReportReason } from '../api/types';
import { ContentReportForm } from './ContentReportForm';

export type CommentReportTarget = 'comment' | 'user';

export function CommentReportForm({
  detail,
  isSubmitting,
  reason,
  reportedUserName,
  target,
  onCancel,
  onDetailChange,
  onReasonChange,
  onSubmit,
  onTargetChange,
}: {
  detail: string;
  isSubmitting: boolean;
  reason: ParagraphReportReason;
  reportedUserName: string;
  target: CommentReportTarget;
  onCancel(): void;
  onDetailChange(value: string): void;
  onReasonChange(value: ParagraphReportReason): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  onTargetChange(value: CommentReportTarget): void;
}) {
  return (
    <ContentReportForm
      detail={detail}
      isSubmitting={isSubmitting}
      reason={reason}
      targetName={reportedUserName}
      title="提交举报"
      onCancel={onCancel}
      onDetailChange={onDetailChange}
      onReasonChange={onReasonChange}
      onSubmit={onSubmit}
    >
      <label>
        <span>举报对象</span>
        <select
          value={target}
          onChange={(event) => onTargetChange(event.target.value as CommentReportTarget)}
        >
          <option value="comment">评论内容</option>
          <option value="user">用户账号</option>
        </select>
      </label>
    </ContentReportForm>
  );
}
