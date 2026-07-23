import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ChapterStatus,
  ContentReportTargetType,
  NovelStatus,
  ParagraphReportReason,
  ParagraphReportStatus,
  Prisma,
  UserRole,
  UserStatus,
} from '@prisma/client';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { RequestUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  BatchReviewContentReportsDto,
  ContentReportStatsDto,
  CreateContentReportDto,
  ListContentReportsDto,
  ReviewContentReportDto,
} from './dto/content-report.dto';

const publicNovelStatuses = [NovelStatus.SERIALIZING, NovelStatus.COMPLETED];
const reportInclude = {
  reporter: { select: { id: true, nickname: true, email: true } },
  reviewer: { select: { id: true, nickname: true, email: true } },
} satisfies Prisma.ContentReportInclude;

interface ReportTarget {
  id: string;
  title: string;
  ownerId?: string;
  snapshot: Prisma.InputJsonValue;
}

interface RestrictionSnapshot {
  before: Prisma.InputJsonValue;
  after: Prisma.InputJsonValue;
}

@Injectable()
export class ContentReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  async create(
    user: RequestUser,
    targetType: ContentReportTargetType,
    targetId: string,
    dto: CreateContentReportDto,
  ) {
    const target = await this.loadTarget(targetType, targetId);
    if (
      target.ownerId === user.id ||
      (targetType === ContentReportTargetType.USER && targetId === user.id)
    ) {
      throw new BadRequestException('不能举报自己');
    }
    const detail = normalizeOptionalText(dto.detail);
    return this.prisma.contentReport.upsert({
      where: {
        reporterId_targetType_targetId: { reporterId: user.id, targetType, targetId },
      },
      update: {
        targetTitle: target.title,
        targetOwnerId: target.ownerId,
        targetSnapshot: target.snapshot,
        reason: dto.reason,
        detail,
        status: ParagraphReportStatus.PENDING,
        reviewerId: null,
        resolution: null,
        resolvedAt: null,
      },
      create: {
        reporterId: user.id,
        targetType,
        targetId,
        targetTitle: target.title,
        targetOwnerId: target.ownerId,
        targetSnapshot: target.snapshot,
        reason: dto.reason,
        detail,
      },
      include: reportInclude,
    });
  }

  async list(query: ListContentReportsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const keyword = query.keyword?.trim();
    const where: Prisma.ContentReportWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(keyword
        ? {
            OR: [
              { targetTitle: { contains: keyword, mode: 'insensitive' } },
              { targetId: { contains: keyword, mode: 'insensitive' } },
              { detail: { contains: keyword, mode: 'insensitive' } },
              { reporter: { nickname: { contains: keyword, mode: 'insensitive' } } },
              { reporter: { email: { contains: keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contentReport.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
        include: reportInclude,
      }),
      this.prisma.contentReport.count({ where }),
    ]);
    return {
      items,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async stats(query: ContentReportStatsDto) {
    const periodDays = query.days ?? 7;
    const dateKeys = buildShanghaiDateKeys(periodDays);
    const periodStart = shanghaiDateKeyToStart(dateKeys[0]);
    const [createdReports, processedReports, pending] = await this.prisma.$transaction([
      this.prisma.contentReport.findMany({
        where: { createdAt: { gte: periodStart } },
        select: { targetType: true, reason: true, status: true, createdAt: true },
      }),
      this.prisma.contentReport.findMany({
        where: {
          resolvedAt: { gte: periodStart },
          status: { in: [ParagraphReportStatus.RESOLVED, ParagraphReportStatus.DISMISSED] },
        },
        select: { status: true, createdAt: true, resolvedAt: true },
      }),
      this.prisma.contentReport.count({ where: { status: ParagraphReportStatus.PENDING } }),
    ]);

    const reasonCounts = new Map<ParagraphReportReason, number>(
      Object.values(ParagraphReportReason).map((reason) => [reason, 0]),
    );
    const targetCounts = new Map<ContentReportTargetType, number>(
      Object.values(ContentReportTargetType).map((targetType) => [targetType, 0]),
    );
    const trendByDate = new Map(
      dateKeys.map((date) => [date, { date, created: 0, restricted: 0, dismissed: 0 }]),
    );

    for (const report of createdReports) {
      reasonCounts.set(report.reason, (reasonCounts.get(report.reason) ?? 0) + 1);
      targetCounts.set(report.targetType, (targetCounts.get(report.targetType) ?? 0) + 1);
      const trend = trendByDate.get(toShanghaiDateKey(report.createdAt));
      if (trend) trend.created += 1;
    }

    let restricted = 0;
    let dismissed = 0;
    let totalResolutionMinutes = 0;
    let resolutionDurationCount = 0;
    for (const report of processedReports) {
      if (report.status === ParagraphReportStatus.RESOLVED) {
        restricted += 1;
      } else {
        dismissed += 1;
      }
      if (!report.resolvedAt) continue;
      const trend = trendByDate.get(toShanghaiDateKey(report.resolvedAt));
      if (trend) {
        if (report.status === ParagraphReportStatus.RESOLVED) trend.restricted += 1;
        else trend.dismissed += 1;
      }
      totalResolutionMinutes += Math.max(
        0,
        (report.resolvedAt.getTime() - report.createdAt.getTime()) / 60_000,
      );
      resolutionDurationCount += 1;
    }

    const processedRecentReports = createdReports.filter(
      (report) => report.status !== ParagraphReportStatus.PENDING,
    ).length;
    return {
      periodDays,
      overview: {
        created: createdReports.length,
        pending,
        restricted,
        dismissed,
        resolutionRate: createdReports.length
          ? roundToOneDecimal((processedRecentReports / createdReports.length) * 100)
          : 0,
        averageResolutionMinutes: resolutionDurationCount
          ? roundToOneDecimal(totalResolutionMinutes / resolutionDurationCount)
          : null,
      },
      targetBreakdown: Object.values(ContentReportTargetType).map((targetType) => ({
        targetType,
        count: targetCounts.get(targetType) ?? 0,
      })),
      reasonBreakdown: Object.values(ParagraphReportReason).map((reason) => ({
        reason,
        count: reasonCounts.get(reason) ?? 0,
      })),
      trend: dateKeys.map((date) => trendByDate.get(date)!),
    };
  }

  async review(user: RequestUser, reportId: string, dto: ReviewContentReportDto) {
    const report = await this.prisma.contentReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('举报不存在');
    if (report.status !== ParagraphReportStatus.PENDING) {
      throw new BadRequestException('举报已经处理');
    }
    const note = normalizeOptionalText(dto.note);
    const resolution = dto.action === 'dismiss' ? (note ?? '举报未成立') : (note ?? '目标已限制');
    const status =
      dto.action === 'dismiss' ? ParagraphReportStatus.DISMISSED : ParagraphReportStatus.RESOLVED;
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      let restriction: RestrictionSnapshot | undefined;
      if (dto.action === 'restrict') {
        restriction = await this.restrictTarget(
          tx,
          user,
          report.targetType,
          report.targetId,
          resolution,
        );
      }
      await tx.contentReport.updateMany({
        where: {
          targetType: report.targetType,
          targetId: report.targetId,
          status: ParagraphReportStatus.PENDING,
        },
        data: { status, reviewerId: user.id, resolution, resolvedAt: now },
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: dto.action === 'dismiss' ? 'content_report.dismiss' : 'content_report.restrict',
          targetType: report.targetType.toLowerCase(),
          targetId: report.targetId,
          summary: `${dto.action === 'dismiss' ? '驳回' : '处置'}${targetTypeLabel(report.targetType)}举报《${report.targetTitle}》`,
          before: restriction?.before ?? { reportId: report.id, status: report.status },
          after: restriction?.after ?? { status, resolution },
        },
        tx,
      );
    });

    return this.prisma.contentReport.findUniqueOrThrow({
      where: { id: reportId },
      include: reportInclude,
    });
  }

  async batchReview(user: RequestUser, dto: BatchReviewContentReportsDto) {
    const ids = [...new Set(dto.ids)];
    const reports = await this.prisma.contentReport.findMany({
      where: { id: { in: ids } },
      select: { id: true, targetType: true, targetId: true, status: true },
    });
    const byId = new Map(reports.map((item) => [item.id, item]));
    const grouped = new Map<string, typeof reports>();
    const results = new Map<string, { id: string; success: boolean; error?: string }>();
    for (const id of ids) {
      const report = byId.get(id);
      if (!report) {
        results.set(id, { id, success: false, error: '举报不存在' });
        continue;
      }
      const key = `${report.targetType}:${report.targetId}`;
      const group = grouped.get(key) ?? [];
      group.push(report);
      grouped.set(key, group);
    }
    for (const group of grouped.values()) {
      const representative = group.find((item) => item.status === ParagraphReportStatus.PENDING);
      if (!representative) {
        group.forEach((item) =>
          results.set(item.id, { id: item.id, success: false, error: '举报已经处理' }),
        );
        continue;
      }
      try {
        await this.review(user, representative.id, { action: dto.action, note: dto.note });
        group.forEach((item) => results.set(item.id, { id: item.id, success: true }));
      } catch (error) {
        if (!(error instanceof HttpException)) throw error;
        group.forEach((item) =>
          results.set(item.id, { id: item.id, success: false, error: error.message }),
        );
      }
    }
    const items = ids.map((id) => results.get(id)!);
    const succeeded = items.filter((item) => item.success).length;
    return { total: items.length, succeeded, failed: items.length - succeeded, items };
  }

  private async loadTarget(
    targetType: ContentReportTargetType,
    targetId: string,
  ): Promise<ReportTarget> {
    if (targetType === ContentReportTargetType.NOVEL) {
      const novel = await this.prisma.novel.findFirst({
        where: { id: targetId, status: { in: publicNovelStatuses } },
        include: {
          author: { select: { id: true, nickname: true } },
          category: true,
          tags: true,
        },
      });
      if (!novel) throw new NotFoundException('作品不存在或不可举报');
      return {
        id: novel.id,
        title: novel.title,
        ownerId: novel.authorId,
        snapshot: {
          title: novel.title,
          summary: novel.summary,
          status: novel.status,
          author: novel.author,
          category: novel.category.name,
          tags: novel.tags.map((tag) => tag.name),
        },
      };
    }
    if (targetType === ContentReportTargetType.CHAPTER) {
      const chapter = await this.prisma.chapter.findFirst({
        where: {
          id: targetId,
          status: ChapterStatus.PUBLISHED,
          deletedAt: null,
          novel: { status: { in: publicNovelStatuses } },
        },
        include: { novel: { select: { id: true, title: true, authorId: true } } },
      });
      if (!chapter) throw new NotFoundException('章节不存在或不可举报');
      return {
        id: chapter.id,
        title: `${chapter.novel.title} / ${chapter.title}`,
        ownerId: chapter.novel.authorId,
        snapshot: {
          novelId: chapter.novel.id,
          novelTitle: chapter.novel.title,
          title: chapter.title,
          content: chapter.content,
          orderIndex: chapter.orderIndex,
          publishedAt: chapter.publishedAt?.toISOString() ?? null,
        },
      };
    }
    const targetUser = await this.prisma.user.findFirst({
      where: {
        id: targetId,
        status: UserStatus.ACTIVE,
        ...(targetType === ContentReportTargetType.AUTHOR
          ? { role: { in: [UserRole.AUTHOR, UserRole.ADMIN] }, authorProfile: { isNot: null } }
          : {}),
      },
      include: { authorProfile: true },
    });
    if (!targetUser) {
      throw new NotFoundException(
        targetType === ContentReportTargetType.AUTHOR ? '作者不存在' : '用户不存在',
      );
    }
    return {
      id: targetUser.id,
      title:
        targetType === ContentReportTargetType.AUTHOR
          ? (targetUser.authorProfile?.penName ?? targetUser.nickname)
          : targetUser.nickname,
      ownerId: targetUser.id,
      snapshot: {
        nickname: targetUser.nickname,
        role: targetUser.role,
        penName: targetUser.authorProfile?.penName ?? null,
        bio: targetUser.authorProfile?.bio ?? null,
      },
    };
  }

  private async restrictTarget(
    tx: Prisma.TransactionClient,
    actor: RequestUser,
    targetType: ContentReportTargetType,
    targetId: string,
    resolution: string,
  ): Promise<RestrictionSnapshot> {
    if (targetType === ContentReportTargetType.NOVEL) {
      const before = await tx.novel.findUnique({ where: { id: targetId } });
      if (!before) throw new NotFoundException('作品不存在');
      const after = await tx.novel.update({
        where: { id: targetId },
        data: { status: NovelStatus.HIDDEN },
      });
      return { before: toAuditJson(before), after: toAuditJson(after) };
    }
    if (targetType === ContentReportTargetType.CHAPTER) {
      const before = await tx.chapter.findUnique({
        where: { id: targetId },
        include: { novel: true },
      });
      if (!before) throw new NotFoundException('章节不存在');
      const after = await tx.chapter.update({
        where: { id: targetId },
        data: { status: ChapterStatus.REJECTED, scheduledAt: null, publishedAt: null },
      });
      if (before.status === ChapterStatus.PUBLISHED) {
        await tx.novel.update({
          where: { id: before.novelId },
          data: { wordCount: Math.max(0, before.novel.wordCount - before.wordCount) },
        });
      }
      return { before: toAuditJson(before), after: toAuditJson(after) };
    }
    const before = await tx.user.findUnique({ where: { id: targetId } });
    if (!before) throw new NotFoundException('用户不存在');
    if (before.role === UserRole.ADMIN || before.id === actor.id) {
      throw new BadRequestException('不能通过举报处置管理员账号');
    }
    const now = new Date();
    const after = await tx.user.update({
      where: { id: targetId },
      data: { status: UserStatus.SUSPENDED, suspendedAt: now, suspensionReason: resolution },
    });
    await tx.authSession.updateMany({
      where: { userId: targetId, revokedAt: null },
      data: { revokedAt: now },
    });
    return { before: toAuditJson(before), after: toAuditJson(after) };
  }
}

function normalizeOptionalText(value?: string) {
  const normalized = value?.trim();
  return normalized || null;
}

function targetTypeLabel(type: ContentReportTargetType) {
  const labels: Record<ContentReportTargetType, string> = {
    NOVEL: '作品',
    CHAPTER: '章节',
    AUTHOR: '作者',
    USER: '用户',
  };
  return labels[type];
}

function toAuditJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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
