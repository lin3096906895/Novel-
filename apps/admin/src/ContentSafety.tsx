import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
} from '@ant-design/icons';
import {
  Button,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Key } from 'react';
import {
  AdminContentAppeal,
  AdminContentReport,
  api,
  ContentAppealStatus,
  ContentAppealTargetType,
  ContentReportStats,
  ContentReportTargetType,
  PaginatedContentAppeals,
  PaginatedContentReports,
  ParagraphReportReason,
  ParagraphReportStatsPeriod,
  ParagraphReportStatus,
} from './api/client';

const { Text, Paragraph, Title } = Typography;
const emptyReports: PaginatedContentReports = {
  items: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};
const emptyAppeals: PaginatedContentAppeals = {
  items: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};
type ReviewAction = 'dismiss' | 'restrict';
type AppealReviewAction = 'approve' | 'reject';

export function ContentSafety({ token }: { token: string }) {
  const [reports, setReports] = useState<PaginatedContentReports>(emptyReports);
  const [status, setStatus] = useState<ParagraphReportStatus | undefined>('PENDING');
  const [targetType, setTargetType] = useState<ContentReportTargetType>();
  const [keyword, setKeyword] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<Key[]>([]);
  const [selectedReport, setSelectedReport] = useState<AdminContentReport>();
  const [review, setReview] = useState<{
    action: ReviewAction;
    ids: string[];
    singleId?: string;
  }>();
  const [reviewNote, setReviewNote] = useState('');
  const [stats, setStats] = useState<ContentReportStats>();
  const [statsDays, setStatsDays] = useState<ParagraphReportStatsPeriod>(7);
  const [appeals, setAppeals] = useState<PaginatedContentAppeals>(emptyAppeals);
  const [appealStatus, setAppealStatus] = useState<ContentAppealStatus | undefined>('PENDING');
  const [appealTargetType, setAppealTargetType] = useState<ContentAppealTargetType>();
  const [appealKeyword, setAppealKeyword] = useState('');
  const [selectedAppeal, setSelectedAppeal] = useState<AdminContentAppeal>();
  const [appealReview, setAppealReview] = useState<{
    appeal: AdminContentAppeal;
    action: AppealReviewAction;
  }>();
  const [appealReviewNote, setAppealReviewNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStatsLoading, setIsStatsLoading] = useState(false);
  const [isAppealsLoading, setIsAppealsLoading] = useState(false);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isAppealReviewing, setIsAppealReviewing] = useState(false);

  const loadReports = useCallback(
    async (
      options: {
        page?: number;
        pageSize?: number;
        status?: ParagraphReportStatus | null;
        targetType?: ContentReportTargetType | null;
        keyword?: string;
      } = {},
    ) => {
      setIsLoading(true);
      try {
        const nextStatus = Object.prototype.hasOwnProperty.call(options, 'status')
          ? (options.status ?? undefined)
          : status;
        const nextType = Object.prototype.hasOwnProperty.call(options, 'targetType')
          ? (options.targetType ?? undefined)
          : targetType;
        const nextKeyword = Object.prototype.hasOwnProperty.call(options, 'keyword')
          ? (options.keyword ?? '')
          : keyword;
        setReports(
          await api.listContentReports(token, {
            page: options.page ?? reports.pagination.page,
            pageSize: options.pageSize ?? reports.pagination.pageSize,
            status: nextStatus,
            targetType: nextType,
            keyword: nextKeyword,
          }),
        );
      } catch (error) {
        message.error(error instanceof Error ? error.message : '内容举报加载失败');
      } finally {
        setIsLoading(false);
      }
    },
    [keyword, reports.pagination.page, reports.pagination.pageSize, status, targetType, token],
  );

  const loadStats = useCallback(
    async (days: ParagraphReportStatsPeriod = statsDays) => {
      setIsStatsLoading(true);
      try {
        setStats(await api.getContentReportStats(token, days));
      } catch (error) {
        message.error(error instanceof Error ? error.message : '内容安全统计加载失败');
      } finally {
        setIsStatsLoading(false);
      }
    },
    [statsDays, token],
  );

  const loadAppeals = useCallback(
    async (
      options: {
        page?: number;
        pageSize?: number;
        status?: ContentAppealStatus | null;
        targetType?: ContentAppealTargetType | null;
        keyword?: string;
      } = {},
    ) => {
      setIsAppealsLoading(true);
      try {
        const nextStatus = Object.prototype.hasOwnProperty.call(options, 'status')
          ? (options.status ?? undefined)
          : appealStatus;
        const nextType = Object.prototype.hasOwnProperty.call(options, 'targetType')
          ? (options.targetType ?? undefined)
          : appealTargetType;
        const nextKeyword = Object.prototype.hasOwnProperty.call(options, 'keyword')
          ? (options.keyword ?? '')
          : appealKeyword;
        setAppeals(
          await api.listContentAppeals(token, {
            page: options.page ?? appeals.pagination.page,
            pageSize: options.pageSize ?? appeals.pagination.pageSize,
            status: nextStatus,
            targetType: nextType,
            keyword: nextKeyword,
          }),
        );
      } catch (error) {
        message.error(error instanceof Error ? error.message : '内容申诉加载失败');
      } finally {
        setIsAppealsLoading(false);
      }
    },
    [
      appealKeyword,
      appealStatus,
      appealTargetType,
      appeals.pagination.page,
      appeals.pagination.pageSize,
      token,
    ],
  );

  useEffect(() => {
    void Promise.all([loadReports({ page: 1 }), loadStats(), loadAppeals({ page: 1 })]);
  }, [token]);

  function openReview(action: ReviewAction, ids: string[], singleId?: string) {
    setReview({ action, ids, singleId });
    setReviewNote('');
  }

  async function submitReview() {
    if (!review) return;
    setIsReviewing(true);
    try {
      const payload = {
        action: review.action,
        ...(reviewNote.trim() ? { note: reviewNote.trim() } : {}),
      };
      if (review.singleId) {
        await api.reviewContentReport(token, review.singleId, payload);
        message.success(review.action === 'dismiss' ? '举报已驳回' : '目标已限制');
      } else {
        const result = await api.reviewContentReportsBatch(token, { ids: review.ids, ...payload });
        if (result.failed > 0) {
          message.warning(`批量处理完成：成功 ${result.succeeded} 条，失败 ${result.failed} 条`);
        } else {
          message.success(`已处理 ${result.succeeded} 条举报`);
        }
      }
      setReview(undefined);
      setSelectedKeys([]);
      await Promise.all([loadReports(), loadStats()]);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '举报处理失败');
    } finally {
      setIsReviewing(false);
    }
  }

  function openAppealReview(appeal: AdminContentAppeal, action: AppealReviewAction) {
    setAppealReview({ appeal, action });
    setAppealReviewNote('');
  }

  async function submitAppealReview() {
    if (!appealReview) return;
    if (appealReview.action === 'reject' && !appealReviewNote.trim()) {
      message.warning('驳回申诉时需要填写处理说明');
      return;
    }
    setIsAppealReviewing(true);
    try {
      await api.reviewContentAppeal(token, appealReview.appeal.id, {
        action: appealReview.action,
        ...(appealReviewNote.trim() ? { note: appealReviewNote.trim() } : {}),
      });
      message.success(appealReview.action === 'approve' ? '申诉已通过，内容已恢复' : '申诉已驳回');
      setAppealReview(undefined);
      await loadAppeals();
    } catch (error) {
      message.error(error instanceof Error ? error.message : '申诉处理失败');
    } finally {
      setIsAppealReviewing(false);
    }
  }

  const reportColumns: ColumnsType<AdminContentReport> = [
    {
      title: '举报目标',
      key: 'target',
      width: 280,
      render: (_, row) => (
        <div className="content-report-target">
          <Space size={6}>
            <Tag color={targetTypeColor(row.targetType)}>{targetTypeText(row.targetType)}</Tag>
            <Text strong>{row.targetTitle}</Text>
          </Space>
          <Text type="secondary" ellipsis copyable={{ text: row.targetId }}>
            {row.targetId}
          </Text>
        </div>
      ),
    },
    {
      title: '原因',
      key: 'reason',
      width: 230,
      render: (_, row) => (
        <div className="content-report-reason">
          <Tag>{reasonText(row.reason)}</Tag>
          <Paragraph ellipsis={{ rows: 2 }} title={row.detail ?? undefined}>
            {row.detail || '未补充说明'}
          </Paragraph>
        </div>
      ),
    },
    {
      title: '举报人',
      key: 'reporter',
      width: 190,
      render: (_, row) => (
        <div>
          <div>{row.reporter.nickname}</div>
          <Text type="secondary">{row.reporter.email}</Text>
        </div>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (value: ParagraphReportStatus) => (
        <Tag color={reportStatusColor(value)}>{reportStatusText(value)}</Tag>
      ),
    },
    {
      title: '提交时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: formatDate,
    },
    {
      title: '操作',
      key: 'actions',
      width: 250,
      fixed: 'right',
      render: (_, row) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setSelectedReport(row)}>
            详情
          </Button>
          {row.status === 'PENDING' && (
            <>
              <Button size="small" onClick={() => openReview('dismiss', [row.id], row.id)}>
                驳回
              </Button>
              <Button
                size="small"
                danger
                icon={<StopOutlined />}
                onClick={() => openReview('restrict', [row.id], row.id)}
              >
                {restrictionText(row.targetType)}
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  const appealColumns: ColumnsType<AdminContentAppeal> = [
    {
      title: '申诉目标',
      width: 290,
      render: (_, row) => (
        <div className="content-report-target">
          <Space size={6}>
            <Tag color={targetTypeColor(row.targetType)}>{targetTypeText(row.targetType)}</Tag>
            <Text strong>{row.targetTitle}</Text>
          </Space>
          <Text type="secondary" ellipsis copyable={{ text: row.targetId }}>
            {row.targetId}
          </Text>
        </div>
      ),
    },
    {
      title: '申诉人',
      width: 210,
      render: (_, row) => (
        <div>
          <div>{row.appellant.nickname}</div>
          <Text type="secondary">{row.appellant.email}</Text>
        </div>
      ),
    },
    {
      title: '申诉理由',
      render: (_, row) => (
        <Paragraph ellipsis={{ rows: 2 }} title={row.reason}>
          {row.reason}
        </Paragraph>
      ),
    },
    {
      title: '状态',
      width: 100,
      render: (_, row) => (
        <Tag color={appealStatusColor(row.status)}>{appealStatusText(row.status)}</Tag>
      ),
    },
    { title: '提交时间', dataIndex: 'createdAt', width: 170, render: formatDate },
    {
      title: '操作',
      width: 250,
      fixed: 'right',
      render: (_, row) => (
        <Space>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setSelectedAppeal(row)}>
            详情
          </Button>
          {row.status === 'PENDING' && (
            <>
              <Button
                size="small"
                icon={<CheckCircleOutlined />}
                onClick={() => openAppealReview(row, 'approve')}
              >
                通过并恢复
              </Button>
              <Button
                size="small"
                danger
                icon={<CloseCircleOutlined />}
                onClick={() => openAppealReview(row, 'reject')}
              >
                驳回
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  const pendingSelectedIds = selectedKeys.map(String);

  return (
    <>
      <ContentReportOverview
        isLoading={isStatsLoading}
        stats={stats}
        days={statsDays}
        onDaysChange={(days) => {
          setStatsDays(days);
          void loadStats(days);
        }}
      />

      <section className="admin-panel">
        <div className="panel-heading">
          <div>
            <Title level={4}>内容安全处置</Title>
            <Text type="secondary">举报限制和申诉恢复均写入操作审计。</Text>
          </div>
          <Button
            icon={<ReloadOutlined />}
            loading={isLoading || isAppealsLoading || isStatsLoading}
            onClick={() => void Promise.all([loadReports(), loadStats(), loadAppeals()])}
          >
            刷新
          </Button>
        </div>

        <Tabs
          items={[
            {
              key: 'reports',
              label: `举报处置（${reports.pagination.total}）`,
              children: (
                <>
                  <div className="content-safety-toolbar">
                    <Input.Search
                      allowClear
                      value={keyword}
                      placeholder="搜索标题、目标 ID、举报人或说明"
                      onChange={(event) => setKeyword(event.target.value)}
                      onSearch={(value) => {
                        setKeyword(value);
                        void loadReports({ page: 1, keyword: value });
                      }}
                    />
                    <Select
                      value={status ?? 'ALL'}
                      options={[
                        { value: 'ALL', label: '全部状态' },
                        { value: 'PENDING', label: '待处理' },
                        { value: 'RESOLVED', label: '已限制' },
                        { value: 'DISMISSED', label: '已驳回' },
                      ]}
                      onChange={(value) => {
                        const next = value === 'ALL' ? undefined : (value as ParagraphReportStatus);
                        setStatus(next);
                        setSelectedKeys([]);
                        void loadReports({ page: 1, status: next ?? null });
                      }}
                    />
                    <Select
                      value={targetType ?? 'ALL'}
                      options={[
                        { value: 'ALL', label: '全部目标' },
                        { value: 'NOVEL', label: '作品' },
                        { value: 'CHAPTER', label: '章节' },
                        { value: 'AUTHOR', label: '作者' },
                        { value: 'USER', label: '用户' },
                      ]}
                      onChange={(value) => {
                        const next =
                          value === 'ALL' ? undefined : (value as ContentReportTargetType);
                        setTargetType(next);
                        setSelectedKeys([]);
                        void loadReports({ page: 1, targetType: next ?? null });
                      }}
                    />
                    <Space>
                      <Button
                        disabled={pendingSelectedIds.length === 0}
                        onClick={() => openReview('dismiss', pendingSelectedIds)}
                      >
                        批量驳回
                      </Button>
                      <Button
                        danger
                        icon={<SafetyCertificateOutlined />}
                        disabled={pendingSelectedIds.length === 0}
                        onClick={() => openReview('restrict', pendingSelectedIds)}
                      >
                        批量限制
                      </Button>
                    </Space>
                  </div>

                  <Table
                    rowKey="id"
                    columns={reportColumns}
                    dataSource={reports.items}
                    loading={isLoading}
                    scroll={{ x: 1220 }}
                    rowSelection={{
                      selectedRowKeys: selectedKeys,
                      onChange: setSelectedKeys,
                      getCheckboxProps: (row) => ({ disabled: row.status !== 'PENDING' }),
                    }}
                    pagination={{
                      current: reports.pagination.page,
                      pageSize: reports.pagination.pageSize,
                      total: reports.pagination.total,
                      showSizeChanger: true,
                      onChange: (page, pageSize) => void loadReports({ page, pageSize }),
                    }}
                  />
                </>
              ),
            },
            {
              key: 'appeals',
              label: `申诉审核（${appeals.pagination.total}）`,
              children: (
                <>
                  <div className="content-safety-toolbar appeal-safety-toolbar">
                    <Input.Search
                      allowClear
                      value={appealKeyword}
                      placeholder="搜索目标、作者或申诉理由"
                      onChange={(event) => setAppealKeyword(event.target.value)}
                      onSearch={(value) => {
                        setAppealKeyword(value);
                        void loadAppeals({ page: 1, keyword: value });
                      }}
                    />
                    <Select
                      value={appealStatus ?? 'ALL'}
                      options={[
                        { value: 'ALL', label: '全部状态' },
                        { value: 'PENDING', label: '待审核' },
                        { value: 'APPROVED', label: '已通过' },
                        { value: 'REJECTED', label: '未通过' },
                      ]}
                      onChange={(value) => {
                        const next = value === 'ALL' ? undefined : (value as ContentAppealStatus);
                        setAppealStatus(next);
                        void loadAppeals({ page: 1, status: next ?? null });
                      }}
                    />
                    <Select
                      value={appealTargetType ?? 'ALL'}
                      options={[
                        { value: 'ALL', label: '全部目标' },
                        { value: 'NOVEL', label: '作品' },
                        { value: 'CHAPTER', label: '章节' },
                      ]}
                      onChange={(value) => {
                        const next =
                          value === 'ALL' ? undefined : (value as ContentAppealTargetType);
                        setAppealTargetType(next);
                        void loadAppeals({ page: 1, targetType: next ?? null });
                      }}
                    />
                  </div>

                  <Table
                    rowKey="id"
                    columns={appealColumns}
                    dataSource={appeals.items}
                    loading={isAppealsLoading}
                    scroll={{ x: 1200 }}
                    pagination={{
                      current: appeals.pagination.page,
                      pageSize: appeals.pagination.pageSize,
                      total: appeals.pagination.total,
                      showSizeChanger: true,
                      onChange: (page, pageSize) => void loadAppeals({ page, pageSize }),
                    }}
                  />
                </>
              ),
            },
          ]}
        />

        <Modal
          title={review?.action === 'restrict' ? '确认限制目标' : '确认驳回举报'}
          open={Boolean(review)}
          okText={review?.action === 'restrict' ? '确认限制' : '确认驳回'}
          okButtonProps={{ danger: review?.action === 'restrict' }}
          confirmLoading={isReviewing}
          onCancel={() => setReview(undefined)}
          onOk={() => void submitReview()}
        >
          <Paragraph type="secondary">
            {review?.action === 'restrict'
              ? '作品会被隐藏、章节会被下架，作者或用户账号会被封禁并撤销登录会话。'
              : '同一目标下的其他待处理举报也会一并结案。'}
          </Paragraph>
          <Input.TextArea
            value={reviewNote}
            maxLength={500}
            rows={4}
            placeholder="可选，填写处理说明"
            onChange={(event) => setReviewNote(event.target.value)}
          />
        </Modal>

        <Modal
          title={appealReview?.action === 'approve' ? '通过申诉并恢复内容' : '驳回内容申诉'}
          open={Boolean(appealReview)}
          okText={appealReview?.action === 'approve' ? '通过并恢复' : '确认驳回'}
          okButtonProps={{ danger: appealReview?.action === 'reject' }}
          confirmLoading={isAppealReviewing}
          onCancel={() => setAppealReview(undefined)}
          onOk={() => void submitAppealReview()}
        >
          <Paragraph strong>{appealReview?.appeal.targetTitle}</Paragraph>
          <Paragraph type="secondary">{appealReview?.appeal.reason}</Paragraph>
          <Input.TextArea
            value={appealReviewNote}
            maxLength={500}
            rows={4}
            placeholder={
              appealReview?.action === 'reject' ? '必填，说明未通过原因' : '可选，填写恢复说明'
            }
            onChange={(event) => setAppealReviewNote(event.target.value)}
          />
        </Modal>

        <ContentReportDrawer report={selectedReport} onClose={() => setSelectedReport(undefined)} />
        <ContentAppealDrawer appeal={selectedAppeal} onClose={() => setSelectedAppeal(undefined)} />
      </section>
    </>
  );
}

function ContentReportOverview({
  stats,
  days,
  isLoading,
  onDaysChange,
}: {
  stats?: ContentReportStats;
  days: ParagraphReportStatsPeriod;
  isLoading: boolean;
  onDaysChange(days: ParagraphReportStatsPeriod): void;
}) {
  const reasonMax = Math.max(1, ...(stats?.reasonBreakdown.map((item) => item.count) ?? [0]));
  const targetMax = Math.max(1, ...(stats?.targetBreakdown.map((item) => item.count) ?? [0]));
  const trendMax = Math.max(
    1,
    ...(stats?.trend.flatMap((item) => [item.created, item.restricted, item.dismissed]) ?? [0]),
  );
  return (
    <section className="admin-panel report-overview-panel" aria-busy={isLoading}>
      <div className="panel-heading">
        <div>
          <Title level={4}>内容安全概览</Title>
          <Text type="secondary">周期数据按北京时间统计，待处理数为当前全部积压。</Text>
        </div>
        <Segmented
          value={days}
          options={[
            { value: 7, label: '近 7 天' },
            { value: 14, label: '近 14 天' },
            { value: 30, label: '近 30 天' },
          ]}
          onChange={(value) => onDaysChange(Number(value) as ParagraphReportStatsPeriod)}
        />
      </div>
      {stats ? (
        <>
          <div className="report-metric-strip">
            <ReportMetric label="周期新增" value={stats.overview.created} />
            <ReportMetric label="当前待处理" value={stats.overview.pending} />
            <ReportMetric label="周期内已限制" value={stats.overview.restricted} />
            <ReportMetric label="周期内已驳回" value={stats.overview.dismissed} />
            <ReportMetric label="新增处理率" value={`${stats.overview.resolutionRate}%`} />
            <ReportMetric
              label="平均处理时长"
              value={formatResolutionDuration(stats.overview.averageResolutionMinutes)}
            />
          </div>

          <div className="report-insights-grid">
            <div className="report-reason-breakdown">
              <div className="report-breakdown-group">
                <Text strong>目标类型分布</Text>
                <div className="report-reason-list">
                  {stats.targetBreakdown.map((item) => (
                    <BreakdownRow
                      key={item.targetType}
                      label={targetTypeText(item.targetType)}
                      count={item.count}
                      max={targetMax}
                      className={`target-${item.targetType.toLowerCase()}`}
                    />
                  ))}
                </div>
              </div>
              <div className="report-breakdown-group">
                <Text strong>举报原因分布</Text>
                <div className="report-reason-list">
                  {stats.reasonBreakdown.map((item) => (
                    <BreakdownRow
                      key={item.reason}
                      label={reasonText(item.reason)}
                      count={item.count}
                      max={reasonMax}
                      className={`reason-${item.reason.toLowerCase()}`}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="report-trend-section">
              <div className="report-trend-heading">
                <Text strong>每日趋势</Text>
                <div className="report-trend-legend">
                  <span>
                    <i className="trend-created" />
                    新增
                  </span>
                  <span>
                    <i className="trend-resolved" />
                    限制
                  </span>
                  <span>
                    <i className="trend-dismissed" />
                    驳回
                  </span>
                </div>
              </div>
              <div className="report-trend-scroll">
                <div
                  className="report-trend-chart"
                  style={{ minWidth: Math.max(320, stats.trend.length * 34) }}
                >
                  {stats.trend.map((item) => (
                    <div className="report-trend-day" key={item.date}>
                      <div className="report-trend-bars">
                        <span
                          className="trend-created"
                          style={{ height: `${(item.created / trendMax) * 100}%` }}
                          title={`${item.date} 新增 ${item.created}`}
                        />
                        <span
                          className="trend-resolved"
                          style={{ height: `${(item.restricted / trendMax) * 100}%` }}
                          title={`${item.date} 限制 ${item.restricted}`}
                        />
                        <span
                          className="trend-dismissed"
                          style={{ height: `${(item.dismissed / trendMax) * 100}%` }}
                          title={`${item.date} 驳回 ${item.dismissed}`}
                        />
                      </div>
                      <small>{item.date.slice(5)}</small>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无内容安全统计" />
      )}
    </section>
  );
}

function BreakdownRow({
  label,
  count,
  max,
  className,
}: {
  label: string;
  count: number;
  max: number;
  className: string;
}) {
  return (
    <div className="report-reason-row">
      <Text>{label}</Text>
      <div className="report-reason-track" aria-hidden="true">
        <span
          className={`report-reason-fill ${className}`}
          style={{ width: `${(count / max) * 100}%` }}
        />
      </div>
      <strong>{count}</strong>
    </div>
  );
}

function ReportMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <Text type="secondary">{label}</Text>
      <strong>{value}</strong>
    </div>
  );
}

function ContentReportDrawer({
  report,
  onClose,
}: {
  report?: AdminContentReport;
  onClose(): void;
}) {
  return (
    <Drawer
      size="large"
      title={report ? `举报详情：${report.targetTitle}` : '举报详情'}
      open={Boolean(report)}
      onClose={onClose}
    >
      {report && (
        <Space direction="vertical" size={18} style={{ width: '100%' }}>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="目标类型">
              {targetTypeText(report.targetType)}
            </Descriptions.Item>
            <Descriptions.Item label="目标 ID">{report.targetId}</Descriptions.Item>
            <Descriptions.Item label="举报原因">{reasonText(report.reason)}</Descriptions.Item>
            <Descriptions.Item label="补充说明">{report.detail || '无'}</Descriptions.Item>
            <Descriptions.Item label="举报人">
              {report.reporter.nickname} · {report.reporter.email}
            </Descriptions.Item>
            <Descriptions.Item label="状态">{reportStatusText(report.status)}</Descriptions.Item>
            <Descriptions.Item label="处理说明">
              {report.resolution || '尚未处理'}
            </Descriptions.Item>
            <Descriptions.Item label="处理人">
              {report.reviewer?.nickname || '尚未处理'}
            </Descriptions.Item>
          </Descriptions>
          <div>
            <Text strong>举报时内容快照</Text>
            <pre className="audit-json">{JSON.stringify(report.targetSnapshot, null, 2)}</pre>
          </div>
        </Space>
      )}
    </Drawer>
  );
}

function ContentAppealDrawer({
  appeal,
  onClose,
}: {
  appeal?: AdminContentAppeal;
  onClose(): void;
}) {
  return (
    <Drawer
      size="large"
      title={appeal ? `申诉详情：${appeal.targetTitle}` : '申诉详情'}
      open={Boolean(appeal)}
      onClose={onClose}
    >
      {appeal && (
        <Space direction="vertical" size={18} style={{ width: '100%' }}>
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="目标类型">
              {targetTypeText(appeal.targetType)}
            </Descriptions.Item>
            <Descriptions.Item label="目标 ID">{appeal.targetId}</Descriptions.Item>
            <Descriptions.Item label="申诉人">
              {appeal.appellant.nickname} · {appeal.appellant.email}
            </Descriptions.Item>
            <Descriptions.Item label="申诉理由">{appeal.reason}</Descriptions.Item>
            <Descriptions.Item label="状态">{appealStatusText(appeal.status)}</Descriptions.Item>
            <Descriptions.Item label="审核说明">
              {appeal.resolution || '尚未审核'}
            </Descriptions.Item>
            <Descriptions.Item label="审核人">
              {appeal.reviewer?.nickname || '尚未审核'}
            </Descriptions.Item>
            <Descriptions.Item label="原处置说明">
              {appeal.sourceReport?.resolution || '未填写'}
            </Descriptions.Item>
          </Descriptions>
          <div>
            <Text strong>举报时内容快照</Text>
            <pre className="audit-json">
              {JSON.stringify(appeal.sourceReport?.targetSnapshot ?? {}, null, 2)}
            </pre>
          </div>
          <div>
            <Text strong>处置前状态</Text>
            <pre className="audit-json">{JSON.stringify(appeal.sourceAudit.before, null, 2)}</pre>
          </div>
        </Space>
      )}
    </Drawer>
  );
}

function targetTypeText(value: ContentReportTargetType | ContentAppealTargetType) {
  return { NOVEL: '作品', CHAPTER: '章节', AUTHOR: '作者', USER: '用户' }[value];
}

function targetTypeColor(value: ContentReportTargetType | ContentAppealTargetType) {
  return { NOVEL: 'blue', CHAPTER: 'cyan', AUTHOR: 'purple', USER: 'geekblue' }[value];
}

function restrictionText(value: ContentReportTargetType) {
  return value === 'NOVEL' ? '隐藏作品' : value === 'CHAPTER' ? '下架章节' : '封禁账号';
}

function reasonText(value: ParagraphReportReason) {
  return { SPAM: '垃圾广告', ABUSE: '攻击辱骂', SPOILER: '恶意剧透', OTHER: '其他问题' }[value];
}

function reportStatusText(value: ParagraphReportStatus) {
  return { PENDING: '待处理', RESOLVED: '已限制', DISMISSED: '已驳回' }[value];
}

function reportStatusColor(value: ParagraphReportStatus) {
  return { PENDING: 'gold', RESOLVED: 'red', DISMISSED: 'default' }[value];
}

function appealStatusText(value: ContentAppealStatus) {
  return { PENDING: '待审核', APPROVED: '已通过', REJECTED: '未通过' }[value];
}

function appealStatusColor(value: ContentAppealStatus) {
  return { PENDING: 'gold', APPROVED: 'green', REJECTED: 'default' }[value];
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}

function formatResolutionDuration(minutes: number | null) {
  if (minutes === null) return '暂无';
  if (minutes < 60) return `${minutes} 分钟`;
  if (minutes < 1440) return `${Math.round((minutes / 60) * 10) / 10} 小时`;
  return `${Math.round((minutes / 1440) * 10) / 10} 天`;
}
