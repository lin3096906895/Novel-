import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ChapterStatus,
  NovelStatus,
  ParagraphReportReason,
  ParagraphReportStatus,
  Prisma,
} from '@prisma/client';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { RequestUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateParagraphCommentReportDto } from './dto/create-paragraph-comment-report.dto';
import { BatchReviewParagraphCommentReportsDto } from './dto/batch-review-paragraph-comment-reports.dto';
import { ListParagraphCommentReportsDto } from './dto/list-paragraph-comment-reports.dto';
import { ParagraphCommentReportStatsDto } from './dto/paragraph-comment-report-stats.dto';
import { ReviewParagraphCommentReportDto } from './dto/review-paragraph-comment-report.dto';

const publicNovelStatuses = [NovelStatus.SERIALIZING, NovelStatus.COMPLETED];
const reportInclude = {
  reporter: { select: { id: true, nickname: true, email: true } },
  reviewer: { select: { id: true, nickname: true, email: true } },
  comment: {
    include: {
      user: { select: { id: true, nickname: true, email: true, role: true } },
      chapter: {
        select: {
          id: true,
          title: true,
          novel: { select: { id: true, title: true } },
        },
      },
    },
  },
} satisfies Prisma.ParagraphCommentReportInclude;

@Injectable()
export class ParagraphCommentReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AdminAuditService,
  ) {}

  async create(user: RequestUser, commentId: string, dto: CreateParagraphCommentReportDto) {
    const comment = await this.prisma.paragraphComment.findFirst({
      where: {
        id: commentId,
        isDeleted: false,
        chapter: {
          status: ChapterStatus.PUBLISHED,
          novel: { status: { in: publicNovelStatuses } },
        },
      },
      select: { id: true, userId: true },
    });

    if (!comment) {
      throw new NotFoundException('段评不存在');
    }
    if (comment.userId === user.id) {
      throw new BadRequestException('不能举报自己的段评');
    }

    const detail = normalizeOptionalText(dto.detail);
    return this.prisma.paragraphCommentReport.upsert({
      where: { reporterId_commentId: { reporterId: user.id, commentId } },
      update: {
        reason: dto.reason,
        detail,
        status: ParagraphReportStatus.PENDING,
        reviewerId: null,
        resolution: null,
        resolvedAt: null,
      },
      create: {
        reporterId: user.id,
        commentId,
        reason: dto.reason,
        detail,
      },
    });
  }

  async list(query: ListParagraphCommentReportsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = query.status ? { status: query.status } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.paragraphCommentReport.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
        include: reportInclude,
      }),
      this.prisma.paragraphCommentReport.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async stats(query: ParagraphCommentReportStatsDto) {
    const periodDays = query.days ?? 7;
    const dateKeys = buildShanghaiDateKeys(periodDays);
    const periodStart = shanghaiDateKeyToStart(dateKeys[0]);
    const [createdReports, processedReports, pending] = await this.prisma.$transaction([
      this.prisma.paragraphCommentReport.findMany({
        where: { createdAt: { gte: periodStart } },
        select: { reason: true, status: true, createdAt: true },
      }),
      this.prisma.paragraphCommentReport.findMany({
        where: {
          resolvedAt: { gte: periodStart },
          status: { in: [ParagraphReportStatus.RESOLVED, ParagraphReportStatus.DISMISSED] },
        },
        select: { status: true, createdAt: true, resolvedAt: true },
      }),
      this.prisma.paragraphCommentReport.count({
        where: { status: ParagraphReportStatus.PENDING },
      }),
    ]);

    const reasonCounts = new Map<ParagraphReportReason, number>(
      Object.values(ParagraphReportReason).map((reason) => [reason, 0]),
    );
    const trendByDate = new Map(
      dateKeys.map((date) => [date, { date, created: 0, resolved: 0, dismissed: 0 }]),
    );

    for (const report of createdReports) {
      reasonCounts.set(report.reason, (reasonCounts.get(report.reason) ?? 0) + 1);
      const trend = trendByDate.get(toShanghaiDateKey(report.createdAt));
      if (trend) {
        trend.created += 1;
      }
    }

    let resolved = 0;
    let dismissed = 0;
    let totalResolutionMinutes = 0;
    let resolutionDurationCount = 0;
    for (const report of processedReports) {
      if (report.status === ParagraphReportStatus.RESOLVED) {
        resolved += 1;
      } else {
        dismissed += 1;
      }

      if (report.resolvedAt) {
        const trend = trendByDate.get(toShanghaiDateKey(report.resolvedAt));
        if (trend) {
          if (report.status === ParagraphReportStatus.RESOLVED) {
            trend.resolved += 1;
          } else {
            trend.dismissed += 1;
          }
        }
        totalResolutionMinutes += Math.max(
          0,
          (report.resolvedAt.getTime() - report.createdAt.getTime()) / 60_000,
        );
        resolutionDurationCount += 1;
      }
    }

    const processedRecentReports = createdReports.filter(
      (report) => report.status !== ParagraphReportStatus.PENDING,
    ).length;

    return {
      periodDays,
      overview: {
        created: createdReports.length,
        pending,
        resolved,
        dismissed,
        resolutionRate: createdReports.length
          ? roundToOneDecimal((processedRecentReports / createdReports.length) * 100)
          : 0,
        averageResolutionMinutes: resolutionDurationCount
          ? roundToOneDecimal(totalResolutionMinutes / resolutionDurationCount)
          : null,
      },
      reasonBreakdown: Object.values(ParagraphReportReason).map((reason) => ({
        reason,
        count: reasonCounts.get(reason) ?? 0,
      })),
      trend: dateKeys.map((date) => trendByDate.get(date)!),
    };
  }

  async batchReview(user: RequestUser, dto: BatchReviewParagraphCommentReportsDto) {
    const ids = [...new Set(dto.ids)];
    const reports = await this.prisma.paragraphCommentReport.findMany({
      where: { id: { in: ids } },
      select: { id: true, commentId: true, status: true },
    });
    const reportsById = new Map(reports.map((report) => [report.id, report]));
    const groups = new Map<string, typeof reports>();
    const results = new Map<string, { id: string; success: boolean; error?: string }>();

    for (const id of ids) {
      const report = reportsById.get(id);
      if (!report) {
        results.set(id, { id, success: false, error: '举报不存在' });
        continue;
      }
      const group = groups.get(report.commentId) ?? [];
      group.push(report);
      groups.set(report.commentId, group);
    }

    for (const group of groups.values()) {
      const representative =
        group.find((report) => report.status === ParagraphReportStatus.PENDING) ?? group[0];
      try {
        await this.review(user, representative.id, { action: dto.action, note: dto.note });
        for (const report of group) {
          results.set(report.id, { id: report.id, success: true });
        }
      } catch (error) {
        if (!(error instanceof HttpException)) {
          throw error;
        }
        for (const report of group) {
          results.set(report.id, { id: report.id, success: false, error: error.message });
        }
      }
    }

    const items = ids.map((id) => results.get(id)!);
    const succeeded = items.filter((item) => item.success).length;
    return {
      total: items.length,
      succeeded,
      failed: items.length - succeeded,
      items,
    };
  }

  async review(user: RequestUser, reportId: string, dto: ReviewParagraphCommentReportDto) {
    const report = await this.prisma.paragraphCommentReport.findUnique({
      where: { id: reportId },
      include: reportInclude,
    });

    if (!report) {
      throw new NotFoundException('举报不存在');
    }
    if (report.status !== ParagraphReportStatus.PENDING) {
      throw new BadRequestException('该举报已经处理');
    }

    const now = new Date();
    const status =
      dto.action === 'remove' ? ParagraphReportStatus.RESOLVED : ParagraphReportStatus.DISMISSED;
    const resolution = normalizeOptionalText(dto.note);

    return this.prisma.$transaction(async (tx) => {
      if (dto.action === 'remove' && !report.comment.isDeleted) {
        await tx.paragraphComment.update({
          where: { id: report.commentId },
          data: { isDeleted: true, content: '' },
        });
      }

      await tx.paragraphCommentReport.updateMany({
        where: { commentId: report.commentId, status: ParagraphReportStatus.PENDING },
        data: {
          status,
          reviewerId: user.id,
          resolution,
          resolvedAt: now,
        },
      });

      await this.auditService.record(
        {
          actorId: user.id,
          action:
            dto.action === 'remove'
              ? 'paragraph-comment.report.remove'
              : 'paragraph-comment.report.dismiss',
          targetType: 'paragraph-comment-report',
          targetId: reportId,
          summary:
            dto.action === 'remove'
              ? `移除 ${report.comment.user.nickname} 在《${report.comment.chapter.novel.title}》中的段评`
              : `驳回 ${report.reporter.nickname} 提交的段评举报`,
          before: {
            status: report.status,
            reason: report.reason,
            detail: report.detail,
            commentId: report.commentId,
            commentContent: report.comment.content,
          },
          after: {
            status,
            action: dto.action,
            resolution,
          },
        },
        tx,
      );

      return tx.paragraphCommentReport.findUniqueOrThrow({
        where: { id: reportId },
        include: reportInclude,
      });
    });
  }
}

function normalizeOptionalText(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function buildShanghaiDateKeys(days: number, now = new Date()) {
  const today = toShanghaiDateKey(now);
  const [year, month, day] = today.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day - days + 1));

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

function shanghaiDateKeyToStart(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, -8));
}

function toShanghaiDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}
