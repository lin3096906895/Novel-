import type { FormEvent, ReactNode } from 'react';
import { Flag, X } from 'lucide-react';
import type { ParagraphReportReason } from '../api/types';

export const reportReasonOptions: Array<{ value: ParagraphReportReason; label: string }> = [
  { value: 'SPAM', label: '垃圾广告' },
  { value: 'ABUSE', label: '攻击辱骂' },
  { value: 'SPOILER', label: '恶意剧透' },
  { value: 'OTHER', label: '其他问题' },
];

export function ContentReportForm({
  detail,
  isSubmitting,
  reason,
  targetName,
  title,
  children,
  onCancel,
  onDetailChange,
  onReasonChange,
  onSubmit,
}: {
  detail: string;
  isSubmitting: boolean;
  reason: ParagraphReportReason;
  targetName: string;
  title: string;
  children?: ReactNode;
  onCancel(): void;
  onDetailChange(value: string): void;
  onReasonChange(value: ParagraphReportReason): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
}) {
  return (
    <form className="paragraph-report-form content-report-form" onSubmit={onSubmit}>
      <div className="paragraph-report-header">
        <div>
          <span>{title}</span>
          <strong>{targetName}</strong>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={onCancel}
          aria-label="取消举报"
          title="取消举报"
        >
          <X size={15} aria-hidden />
        </button>
      </div>
      {children}
      <label>
        <span>举报原因</span>
        <select
          value={reason}
          onChange={(event) => onReasonChange(event.target.value as ParagraphReportReason)}
        >
          {reportReasonOptions.map((option) => (
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
          value={detail}
          onChange={(event) => onDetailChange(event.target.value)}
          placeholder="可选，补充说明具体问题"
        />
      </label>
      <div className="paragraph-report-actions">
        <span>{detail.length} / 500</span>
        <button className="primary-link" type="submit" disabled={isSubmitting}>
          <Flag size={15} aria-hidden />
          {isSubmitting ? '提交中...' : '提交举报'}
        </button>
      </div>
    </form>
  );
}
