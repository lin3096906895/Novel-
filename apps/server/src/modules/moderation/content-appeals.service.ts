import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ChapterStatus,
  ContentAppealStatus,
  ContentAppealTargetType,
  ContentReportTargetType,
  NotificationType,
  NovelStatus,
  ParagraphReportStatus,
  Prisma,
} from '@prisma/client';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { RequestUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateContentAppealDto,
  ListContentAppealsDto,
  ListMyContentAppealsDto,
  ReviewContentAppealDto,
} from './dto/content-appeal.dto';

const appealInclude = {
  appellant: { select: { id: true, nickname: true, email: true } },
  reviewer: { select: { id: true, nickname: true, email: true } },
  sourceReport: {
    select: { id: true, reason: true, resolution: true, resolvedAt: true, targetSnapshot: true },
  },
  sourceAudit: { select: { id: true, before: true, after: true, createdAt: true } },
} satisfies Prisma.ContentAppealInclude;

interface EligibleAppealTarget {
  targetType: ContentAppealTargetType;
  targetId: string;
  targetTitle: string;
  restrictionReason: string | null;
  restrictedAt: Date;
  sourceReportId: string | null;
  sourceAuditId: string;
}

interface RestoreSnapshot {
  before: Prisma.InputJsonValue;
  after: Prisma.InputJsonValue;
}

@Injectable()
export class ContentAppealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async listEligibleTargets(user: RequestUser) {
    return this.findEligibleTargets(user.id);
  }

  async create(
    user: RequestUser,
    targetType: ContentAppealTargetType,
    targetId: string,
    dto: CreateContentAppealDto,
  ) {
    const target = (await this.findEligibleTargets(user.id)).find(
      (item) => item.targetType === targetType && item.targetId === targetId,
    );
    if (!target) {
      throw new BadRequestException('该内容当前不可申诉或已经提交过申诉');
    }
    const reason = dto.reason.trim();
    if (!reason) throw new BadRequestException('请填写申诉理由');

    try {
      return await this.prisma.contentAppeal.create({
        data: {
          appellantId: user.id,
          targetType,
          targetId,
          targetTitle: target.targetTitle,
          sourceReportId: target.sourceReportId,
          sourceAuditId: target.sourceAuditId,
          reason,
        },
        include: appealInclude,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('该次内容处置已经提交过申诉');
      }
      throw error;
    }
  }

  async listMine(user: RequestUser, query: ListMyContentAppealsDto) {
    return this.listPaginated({ appellantId: user.id }, query.page ?? 1, query.pageSize ?? 20);
  }

  async list(query: ListContentAppealsDto) {
    const keyword = query.keyword?.trim();
    const where: Prisma.ContentAppealWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(keyword
        ? {
            OR: [
              { targetTitle: { contains: keyword, mode: 'insensitive' } },
              { targetId: { contains: keyword, mode: 'insensitive' } },
              { reason: { contains: keyword, mode: 'insensitive' } },
              { appellant: { nickname: { contains: keyword, mode: 'insensitive' } } },
              { appellant: { email: { contains: keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    return this.listPaginated(where, query.page ?? 1, query.pageSize ?? 20);
  }

  async review(user: RequestUser, appealId: string, dto: ReviewContentAppealDto) {
    const appeal = await this.prisma.contentAppeal.findUnique({
      where: { id: appealId },
      include: appealInclude,
    });
    if (!appeal) throw new NotFoundException('申诉不存在');
    if (appeal.status !== ContentAppealStatus.PENDING) {
      throw new BadRequestException('申诉已经处理');
    }

    const note = normalizeOptionalText(dto.note);
    if (dto.action === 'reject' && !note) {
      throw new BadRequestException('驳回申诉时需要填写处理说明');
    }
    const status =
      dto.action === 'approve' ? ContentAppealStatus.APPROVED : ContentAppealStatus.REJECTED;
    const resolution = note ?? (dto.action === 'approve' ? '申诉通过，内容已恢复' : '申诉未通过');
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const restored = dto.action === 'approve' ? await this.restoreTarget(tx, appeal) : undefined;
      const updated = await tx.contentAppeal.update({
        where: { id: appeal.id },
        data: { status, reviewerId: user.id, resolution, resolvedAt: now },
        include: appealInclude,
      });

      await this.audit.record(
        {
          actorId: user.id,
          action: dto.action === 'approve' ? 'content_appeal.approve' : 'content_appeal.reject',
          targetType: appeal.targetType.toLowerCase(),
          targetId: appeal.targetId,
          summary: `${dto.action === 'approve' ? '通过并恢复' : '驳回'}${targetTypeLabel(appeal.targetType)}申诉《${appeal.targetTitle}》`,
          before: restored?.before ?? { appealId: appeal.id, status: appeal.status },
          after: restored?.after ?? { appealId: appeal.id, status, resolution },
        },
        tx,
      );

      await this.notifications.create(
        {
          userId: appeal.appellantId,
          type: NotificationType.REVIEW,
          title: dto.action === 'approve' ? '内容申诉已通过' : '内容申诉未通过',
          content:
            dto.action === 'approve'
              ? `${targetTypeLabel(appeal.targetType)}《${appeal.targetTitle}》已恢复展示。`
              : `${targetTypeLabel(appeal.targetType)}《${appeal.targetTitle}》申诉未通过：${resolution}`,
          link: '/author',
        },
        tx,
      );

      return updated;
    });
  }

  private async listPaginated(
    where: Prisma.ContentAppealWhereInput,
    page: number,
    pageSize: number,
  ) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.contentAppeal.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: appealInclude,
      }),
      this.prisma.contentAppeal.count({ where }),
    ]);
    return {
      items,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  private async findEligibleTargets(appellantId: string): Promise<EligibleAppealTarget[]> {
    const reports = await this.prisma.contentReport.findMany({
      where: {
        targetOwnerId: appellantId,
        targetType: { in: [ContentReportTargetType.NOVEL, ContentReportTargetType.CHAPTER] },
        status: ParagraphReportStatus.RESOLVED,
      },
      orderBy: { resolvedAt: 'desc' },
      select: {
        id: true,
        targetType: true,
        targetId: true,
        targetTitle: true,
        resolution: true,
      },
    });
    const latestReports = new Map<string, (typeof reports)[number]>();
    for (const report of reports) {
      const key = targetKey(report.targetType, report.targetId);
      if (!latestReports.has(key)) latestReports.set(key, report);
    }
    if (!latestReports.size) return [];

    const audits = await this.prisma.adminAuditLog.findMany({
      where: {
        action: 'content_report.restrict',
        OR: [...latestReports.values()].map((report) => ({
          targetType: report.targetType.toLowerCase(),
          targetId: report.targetId,
        })),
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, targetType: true, targetId: true, createdAt: true },
    });
    const latestAudits = new Map<string, (typeof audits)[number]>();
    for (const audit of audits) {
      const key = `${audit.targetType.toUpperCase()}:${audit.targetId}`;
      if (!latestAudits.has(key)) latestAudits.set(key, audit);
    }
    if (!latestAudits.size) return [];

    const existingAppeals = await this.prisma.contentAppeal.findMany({
      where: { sourceAuditId: { in: [...latestAudits.values()].map((audit) => audit.id) } },
      select: { sourceAuditId: true },
    });
    const appealedAuditIds = new Set(existingAppeals.map((appeal) => appeal.sourceAuditId));
    const novelIds: string[] = [];
    const chapterIds: string[] = [];
    for (const key of latestAudits.keys()) {
      const [type, id] = splitTargetKey(key);
      if (type === ContentAppealTargetType.NOVEL) novelIds.push(id);
      else if (type === ContentAppealTargetType.CHAPTER) chapterIds.push(id);
    }

    const [novels, chapters] = await this.prisma.$transaction([
      this.prisma.novel.findMany({
        where: { id: { in: novelIds }, authorId: appellantId, status: NovelStatus.HIDDEN },
        select: { id: true, title: true },
      }),
      this.prisma.chapter.findMany({
        where: {
          id: { in: chapterIds },
          status: ChapterStatus.REJECTED,
          deletedAt: null,
          novel: { authorId: appellantId },
        },
        select: { id: true, title: true, novel: { select: { title: true } } },
      }),
    ]);
    const currentTitles = new Map<string, string>();
    novels.forEach((novel) =>
      currentTitles.set(targetKey(ContentAppealTargetType.NOVEL, novel.id), novel.title),
    );
    chapters.forEach((chapter) =>
      currentTitles.set(
        targetKey(ContentAppealTargetType.CHAPTER, chapter.id),
        `${chapter.novel.title} / ${chapter.title}`,
      ),
    );

    return [...latestAudits.entries()]
      .filter(([key, audit]) => currentTitles.has(key) && !appealedAuditIds.has(audit.id))
      .map(([key, audit]) => {
        const [targetType, targetId] = splitTargetKey(key);
        const report = latestReports.get(key)!;
        return {
          targetType,
          targetId,
          targetTitle: currentTitles.get(key) ?? report.targetTitle,
          restrictionReason: report.resolution,
          restrictedAt: audit.createdAt,
          sourceReportId: report.id,
          sourceAuditId: audit.id,
        };
      })
      .sort((left, right) => right.restrictedAt.getTime() - left.restrictedAt.getTime());
  }

  private async restoreTarget(
    tx: Prisma.TransactionClient,
    appeal: Prisma.ContentAppealGetPayload<{ include: typeof appealInclude }>,
  ): Promise<RestoreSnapshot> {
    if (appeal.targetType === ContentAppealTargetType.NOVEL) {
      const novel = await tx.novel.findFirst({
        where: { id: appeal.targetId, authorId: appeal.appellantId },
      });
      if (!novel) throw new NotFoundException('申诉作品不存在');
      if (novel.status !== NovelStatus.HIDDEN) {
        throw new BadRequestException('作品已经不处于安全隐藏状态');
      }
      const previousStatus = readNovelStatus(
        appeal.sourceAudit.before,
        appeal.sourceReport?.targetSnapshot,
      );
      const updated = await tx.novel.update({
        where: { id: novel.id },
        data: { status: previousStatus },
      });
      return { before: toAuditJson(novel), after: toAuditJson(updated) };
    }

    const chapter = await tx.chapter.findFirst({
      where: {
        id: appeal.targetId,
        status: ChapterStatus.REJECTED,
        deletedAt: null,
        novel: { authorId: appeal.appellantId },
      },
      include: { novel: true },
    });
    if (!chapter) throw new BadRequestException('章节已经不处于安全下架状态');
    const publishedAt = readPublishedAt(
      appeal.sourceAudit.before,
      appeal.sourceReport?.targetSnapshot,
    );
    const updated = await tx.chapter.update({
      where: { id: chapter.id },
      data: { status: ChapterStatus.PUBLISHED, scheduledAt: null, publishedAt },
    });
    const publishedWords = await tx.chapter.aggregate({
      where: { novelId: chapter.novelId, status: ChapterStatus.PUBLISHED, deletedAt: null },
      _sum: { wordCount: true },
    });
    const updatedNovel = await tx.novel.update({
      where: { id: chapter.novelId },
      data: { wordCount: publishedWords._sum.wordCount ?? 0 },
    });
    return {
      before: toAuditJson(chapter),
      after: toAuditJson({ ...updated, novelWordCount: updatedNovel.wordCount }),
    };
  }
}

function targetKey(targetType: { toString(): string }, targetId: string) {
  return `${targetType.toString()}:${targetId}`;
}

function splitTargetKey(key: string): [ContentAppealTargetType, string] {
  const separator = key.indexOf(':');
  return [key.slice(0, separator) as ContentAppealTargetType, key.slice(separator + 1)];
}

function normalizeOptionalText(value?: string) {
  const normalized = value?.trim();
  return normalized || null;
}

function targetTypeLabel(type: ContentAppealTargetType) {
  return type === ContentAppealTargetType.NOVEL ? '作品' : '章节';
}

function readNovelStatus(auditBefore: Prisma.JsonValue, reportSnapshot?: Prisma.JsonValue) {
  const candidates = [jsonRecord(auditBefore)?.status, jsonRecord(reportSnapshot)?.status];
  return candidates.includes(NovelStatus.COMPLETED)
    ? NovelStatus.COMPLETED
    : NovelStatus.SERIALIZING;
}

function readPublishedAt(auditBefore: Prisma.JsonValue, reportSnapshot?: Prisma.JsonValue) {
  const candidates = [
    jsonRecord(auditBefore)?.publishedAt,
    jsonRecord(reportSnapshot)?.publishedAt,
  ];
  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
}

function jsonRecord(value?: Prisma.JsonValue) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Prisma.JsonObject)
    : undefined;
}

function toAuditJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
