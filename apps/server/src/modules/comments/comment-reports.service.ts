import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ChapterStatus,
  NovelStatus,
  ParagraphReportStatus,
  Prisma,
} from '@prisma/client';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { RequestUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { BatchReviewCommentReportsDto } from './dto/batch-review-comment-reports.dto';
import { CreateCommentReportDto } from './dto/create-comment-report.dto';
import { ListCommentReportsDto } from './dto/list-comment-reports.dto';
import { ReviewCommentReportDto } from './dto/review-comment-report.dto';
import { removeCommentPreservingReplies } from './comment-removal';

const publicNovelStatuses = [NovelStatus.SERIALIZING, NovelStatus.COMPLETED];
const reportInclude = {
  reporter: { select: { id: true, nickname: true, email: true } },
  reviewer: { select: { id: true, nickname: true, email: true } },
} satisfies Prisma.CommentReportInclude;

@Injectable()
export class CommentReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AdminAuditService,
  ) {}

  async create(user: RequestUser, commentId: string, dto: CreateCommentReportDto) {
    const comment = await this.prisma.comment.findFirst({
      where: {
        id: commentId,
        isDeleted: false,
        novel: { status: { in: publicNovelStatuses } },
        OR: [{ chapterId: null }, { chapter: { status: ChapterStatus.PUBLISHED } }],
      },
      include: {
        user: { select: { id: true, nickname: true, email: true } },
        novel: { select: { id: true, title: true } },
        chapter: { select: { id: true, title: true } },
      },
    });
    if (!comment) {
      throw new NotFoundException('评论不存在');
    }
    if (comment.userId === user.id) {
      throw new BadRequestException('不能举报自己的评论');
    }

    const snapshot = {
      contentSnapshot: comment.content,
      commentAuthorId: comment.user.id,
      commentAuthorNickname: comment.user.nickname,
      commentAuthorEmail: comment.user.email,
      novelId: comment.novel.id,
      novelTitle: comment.novel.title,
      chapterId: comment.chapter?.id ?? null,
      chapterTitle: comment.chapter?.title ?? null,
    };
    const detail = normalizeOptionalText(dto.detail);
    return this.prisma.commentReport.upsert({
      where: { reporterId_commentId: { reporterId: user.id, commentId } },
      update: {
        reason: dto.reason,
        detail,
        status: ParagraphReportStatus.PENDING,
        reviewerId: null,
        resolution: null,
        resolvedAt: null,
        ...snapshot,
      },
      create: {
        reporterId: user.id,
        commentId,
        reason: dto.reason,
        detail,
        ...snapshot,
      },
      include: reportInclude,
    });
  }

  async list(query: ListCommentReportsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const keyword = query.keyword?.trim();
    const where: Prisma.CommentReportWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.source === 'NOVEL' ? { chapterId: null } : {}),
      ...(query.source === 'CHAPTER' ? { chapterId: { not: null } } : {}),
      ...(keyword
        ? {
            OR: [
              { contentSnapshot: { contains: keyword, mode: 'insensitive' } },
              { detail: { contains: keyword, mode: 'insensitive' } },
              { commentAuthorNickname: { contains: keyword, mode: 'insensitive' } },
              { commentAuthorEmail: { contains: keyword, mode: 'insensitive' } },
              { novelTitle: { contains: keyword, mode: 'insensitive' } },
              { chapterTitle: { contains: keyword, mode: 'insensitive' } },
              { reporter: { nickname: { contains: keyword, mode: 'insensitive' } } },
              { reporter: { email: { contains: keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.commentReport.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
        include: reportInclude,
      }),
      this.prisma.commentReport.count({ where }),
    ]);
    return {
      items,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async batchReview(user: RequestUser, dto: BatchReviewCommentReportsDto) {
    const ids = [...new Set(dto.ids)];
    const reports = await this.prisma.commentReport.findMany({
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
      const groupKey = report.commentId ?? `report:${report.id}`;
      const group = groups.get(groupKey) ?? [];
      group.push(report);
      groups.set(groupKey, group);
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
    return { total: items.length, succeeded, failed: items.length - succeeded, items };
  }

  async review(user: RequestUser, reportId: string, dto: ReviewCommentReportDto) {
    const report = await this.prisma.commentReport.findUnique({
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
      if (report.commentId) {
        await tx.commentReport.updateMany({
          where: { commentId: report.commentId, status: ParagraphReportStatus.PENDING },
          data: { status, reviewerId: user.id, resolution, resolvedAt: now },
        });
        if (dto.action === 'remove') {
          await removeCommentPreservingReplies(tx, report.commentId);
        }
      } else {
        await tx.commentReport.update({
          where: { id: reportId },
          data: { status, reviewerId: user.id, resolution, resolvedAt: now },
        });
      }

      await this.auditService.record(
        {
          actorId: user.id,
          action: dto.action === 'remove' ? 'comment.report.remove' : 'comment.report.dismiss',
          targetType: 'comment-report',
          targetId: reportId,
          summary:
            dto.action === 'remove'
              ? `移除 ${report.commentAuthorNickname} 在《${report.novelTitle}》下的评论`
              : `驳回 ${report.reporter.nickname} 提交的评论举报`,
          before: {
            status: report.status,
            reason: report.reason,
            detail: report.detail,
            commentId: report.commentId,
            content: report.contentSnapshot,
          },
          after: resolution ? { status, resolution } : { status },
        },
        tx,
      );

      return tx.commentReport.findUniqueOrThrow({
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
