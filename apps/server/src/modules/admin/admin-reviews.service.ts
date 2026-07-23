import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import { ChapterStatus, NotificationType, NovelStatus, Prisma } from '@prisma/client';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { RequestUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ChapterPublicationService } from '../publication/chapter-publication.service';
import { BatchReviewDto } from './dto/batch-review.dto';
import { ListReviewQueueDto } from './dto/list-review-queue.dto';
import { ReviewActionDto } from './dto/review-action.dto';

const reviewNovelInclude = {
  author: { select: { id: true, nickname: true, email: true } },
  category: true,
  tags: true,
  _count: { select: { chapters: { where: { deletedAt: null } } } },
} satisfies Prisma.NovelInclude;

const reviewChapterSelect = {
  id: true,
  title: true,
  status: true,
  wordCount: true,
  orderIndex: true,
  scheduledAt: true,
  updatedAt: true,
  novel: {
    select: {
      id: true,
      title: true,
      status: true,
      author: { select: { id: true, nickname: true, email: true } },
    },
  },
} satisfies Prisma.ChapterSelect;

@Injectable()
export class AdminReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AdminAuditService,
    private readonly notificationsService: NotificationsService,
    private readonly publicationService: ChapterPublicationService,
  ) {}

  async listPending() {
    const [novels, chapters, novelCount, chapterCount, recentLogs] = await this.prisma.$transaction(
      [
        this.prisma.novel.findMany({
          where: { status: NovelStatus.REVIEWING },
          orderBy: { updatedAt: 'desc' },
          take: 8,
          include: reviewNovelInclude,
        }),
        this.prisma.chapter.findMany({
          where: { status: ChapterStatus.REVIEWING },
          orderBy: { updatedAt: 'desc' },
          take: 8,
          select: reviewChapterSelect,
        }),
        this.prisma.novel.count({ where: { status: NovelStatus.REVIEWING } }),
        this.prisma.chapter.count({ where: { status: ChapterStatus.REVIEWING } }),
        this.prisma.reviewLog.findMany({
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            reviewer: { select: { id: true, nickname: true, email: true } },
          },
        }),
      ],
    );

    return {
      novels,
      chapters,
      counts: { novels: novelCount, chapters: chapterCount },
      recentLogs,
    };
  }

  async listQueue(query: ListReviewQueueDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const keyword = query.keyword?.trim();

    if (query.targetType === 'novel') {
      const where: Prisma.NovelWhereInput = {
        status: NovelStatus.REVIEWING,
        ...(keyword
          ? {
              OR: [
                { title: { contains: keyword, mode: 'insensitive' } },
                { summary: { contains: keyword, mode: 'insensitive' } },
                { author: { nickname: { contains: keyword, mode: 'insensitive' } } },
                { author: { email: { contains: keyword, mode: 'insensitive' } } },
                { category: { name: { contains: keyword, mode: 'insensitive' } } },
                { tags: { some: { name: { contains: keyword, mode: 'insensitive' } } } },
              ],
            }
          : {}),
      };
      const [items, total] = await this.prisma.$transaction([
        this.prisma.novel.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { updatedAt: 'desc' },
          include: reviewNovelInclude,
        }),
        this.prisma.novel.count({ where }),
      ]);
      return paginated(items, page, pageSize, total);
    }

    const where: Prisma.ChapterWhereInput = {
      status: ChapterStatus.REVIEWING,
      ...(keyword
        ? {
            OR: [
              { title: { contains: keyword, mode: 'insensitive' } },
              { content: { contains: keyword, mode: 'insensitive' } },
              { novel: { title: { contains: keyword, mode: 'insensitive' } } },
              { novel: { author: { nickname: { contains: keyword, mode: 'insensitive' } } } },
              { novel: { author: { email: { contains: keyword, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.chapter.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
        select: reviewChapterSelect,
      }),
      this.prisma.chapter.count({ where }),
    ]);
    return paginated(items, page, pageSize, total);
  }

  async getNovelDetail(novelId: string) {
    const [novel, reviewLogs] = await this.prisma.$transaction([
      this.prisma.novel.findUnique({
        where: { id: novelId },
        include: {
          ...reviewNovelInclude,
          chapters: {
            where: { deletedAt: null },
            orderBy: { orderIndex: 'asc' },
            select: {
              id: true,
              title: true,
              status: true,
              orderIndex: true,
              wordCount: true,
              scheduledAt: true,
              publishedAt: true,
              updatedAt: true,
            },
          },
        },
      }),
      this.prisma.reviewLog.findMany({
        where: { targetType: 'novel', targetId: novelId },
        orderBy: { createdAt: 'desc' },
        include: { reviewer: { select: { id: true, nickname: true, email: true } } },
      }),
    ]);
    if (!novel) {
      throw new NotFoundException('Novel not found');
    }
    return { ...novel, reviewLogs };
  }

  async getChapterDetail(chapterId: string) {
    const [chapter, reviewLogs] = await this.prisma.$transaction([
      this.prisma.chapter.findUnique({
        where: { id: chapterId },
        include: {
          novel: {
            select: {
              id: true,
              title: true,
              status: true,
              category: true,
              author: { select: { id: true, nickname: true, email: true } },
            },
          },
        },
      }),
      this.prisma.reviewLog.findMany({
        where: { targetType: 'chapter', targetId: chapterId },
        orderBy: { createdAt: 'desc' },
        include: { reviewer: { select: { id: true, nickname: true, email: true } } },
      }),
    ]);
    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }
    return { ...chapter, reviewLogs };
  }

  async batchReview(reviewer: RequestUser, dto: BatchReviewDto) {
    const reason = this.getReviewReason(dto);
    const reviewAction = { action: dto.action, reason };
    const items: Array<{ id: string; success: boolean; error?: string }> = [];

    for (const id of [...new Set(dto.ids)]) {
      try {
        if (dto.targetType === 'novel') {
          await this.reviewNovel(reviewer, id, reviewAction);
        } else {
          await this.reviewChapter(reviewer, id, reviewAction);
        }
        items.push({ id, success: true });
      } catch (error) {
        if (!(error instanceof HttpException)) {
          throw error;
        }
        items.push({ id, success: false, error: error.message });
      }
    }

    const succeeded = items.filter((item) => item.success).length;
    return {
      total: items.length,
      succeeded,
      failed: items.length - succeeded,
      items,
    };
  }

  async reviewNovel(reviewer: RequestUser, novelId: string, dto: ReviewActionDto) {
    const reason = this.getReviewReason(dto);
    const novel = await this.prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true, title: true, status: true, authorId: true },
    });

    if (!novel) {
      throw new NotFoundException('Novel not found');
    }

    if (novel.status !== NovelStatus.REVIEWING) {
      throw new BadRequestException('Only reviewing novels can be reviewed');
    }

    const nextStatus = dto.action === 'approve' ? NovelStatus.SERIALIZING : NovelStatus.REJECTED;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.novel.update({
        where: { id: novelId },
        data: { status: nextStatus },
        include: {
          author: { select: { id: true, nickname: true, email: true } },
          category: true,
          tags: true,
        },
      });

      await tx.reviewLog.create({
        data: {
          targetType: 'novel',
          targetId: novelId,
          action: dto.action,
          reason,
          reviewerId: reviewer.id,
        },
      });

      await this.auditService.record(
        {
          actorId: reviewer.id,
          action: `review.novel.${dto.action}`,
          targetType: 'novel',
          targetId: novelId,
          summary: `${dto.action === 'approve' ? '通过' : '驳回'}作品《${novel.title}》的审核`,
          before: { status: novel.status },
          after: reason ? { status: nextStatus, reason } : { status: nextStatus },
        },
        tx,
      );

      await this.notificationsService.create(
        {
          userId: novel.authorId,
          type: NotificationType.REVIEW,
          title: dto.action === 'approve' ? '作品审核已通过' : '作品审核未通过',
          content:
            dto.action === 'approve'
              ? `作品《${novel.title}》已通过审核并开始连载。`
              : `作品《${novel.title}》未通过审核：${reason ?? '请修改后重新提交。'}`,
          link: '/author',
        },
        tx,
      );

      return updated;
    });
  }

  async reviewChapter(reviewer: RequestUser, chapterId: string, dto: ReviewActionDto) {
    const reason = this.getReviewReason(dto);
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      select: {
        id: true,
        title: true,
        novelId: true,
        status: true,
        wordCount: true,
        scheduledAt: true,
        novel: {
          select: {
            title: true,
            status: true,
            authorId: true,
          },
        },
      },
    });

    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    if (chapter.status !== ChapterStatus.REVIEWING) {
      throw new BadRequestException('Only reviewing chapters can be reviewed');
    }

    if (
      dto.action === 'approve' &&
      chapter.novel.status !== NovelStatus.SERIALIZING &&
      chapter.novel.status !== NovelStatus.COMPLETED
    ) {
      throw new BadRequestException('请先通过作品审核，再审核章节');
    }

    const now = new Date();
    const plannedAt =
      dto.action === 'approve' && chapter.scheduledAt && chapter.scheduledAt > now
        ? chapter.scheduledAt
        : null;
    const isScheduledApproval = dto.action === 'approve' && Boolean(plannedAt);
    const nextStatus =
      dto.action === 'approve'
        ? isScheduledApproval
          ? ChapterStatus.SCHEDULED
          : ChapterStatus.PUBLISHED
        : ChapterStatus.REJECTED;

    return this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.chapter.updateMany({
        where: { id: chapterId, status: ChapterStatus.REVIEWING },
        data: {
          status: nextStatus,
          scheduledAt: dto.action === 'approve' ? plannedAt : undefined,
          publishedAt: dto.action === 'approve' && !isScheduledApproval ? now : null,
        },
      });

      if (transitioned.count === 0) {
        throw new BadRequestException('Only reviewing chapters can be reviewed');
      }

      const updated = await tx.chapter.findUnique({
        where: { id: chapterId },
        include: {
          novel: {
            select: {
              id: true,
              title: true,
              status: true,
              author: { select: { id: true, nickname: true, email: true } },
            },
          },
        },
      });

      if (!updated) {
        throw new NotFoundException('Chapter not found');
      }

      if (dto.action === 'approve' && !isScheduledApproval) {
        await tx.novel.update({
          where: { id: chapter.novelId },
          data: {
            wordCount: { increment: chapter.wordCount },
          },
        });
      }

      await tx.reviewLog.create({
        data: {
          targetType: 'chapter',
          targetId: chapterId,
          action: dto.action,
          reason,
          reviewerId: reviewer.id,
        },
      });

      await this.auditService.record(
        {
          actorId: reviewer.id,
          action: `review.chapter.${dto.action}`,
          targetType: 'chapter',
          targetId: chapterId,
          summary: `${dto.action === 'approve' ? '通过' : '驳回'}章节《${chapter.novel.title} / ${chapter.title}》的审核`,
          before: { status: chapter.status },
          after: reason
            ? { status: nextStatus, scheduledAt: plannedAt, reason }
            : { status: nextStatus, scheduledAt: plannedAt },
        },
        tx,
      );

      await this.notificationsService.create(
        {
          userId: chapter.novel.authorId,
          type: NotificationType.REVIEW,
          title: dto.action === 'approve' ? '章节审核已通过' : '章节审核未通过',
          content:
            dto.action === 'approve'
              ? isScheduledApproval && plannedAt
                ? `《${chapter.novel.title}》的章节“${chapter.title}”已通过审核，将于 ${this.formatSchedule(plannedAt)} 自动发布。`
                : `《${chapter.novel.title}》的章节“${chapter.title}”已发布。`
              : `章节“${chapter.title}”未通过审核：${reason ?? '请修改后重新提交。'}`,
          link: '/author',
        },
        tx,
      );

      if (dto.action === 'approve' && !isScheduledApproval) {
        await this.publicationService.notifyFollowers(
          {
            id: chapterId,
            title: chapter.title,
            novelId: chapter.novelId,
            novelTitle: chapter.novel.title,
            authorId: chapter.novel.authorId,
          },
          tx,
        );
      }

      return updated;
    });
  }

  private getReviewReason(dto: ReviewActionDto) {
    const reason = dto.reason?.trim();
    if (dto.action === 'reject' && !reason) {
      throw new BadRequestException('驳回时必须填写原因');
    }

    return reason;
  }

  private formatSchedule(value: Date) {
    return value.toLocaleString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      hour12: false,
    });
  }
}

function paginated<T>(items: T[], page: number, pageSize: number, total: number) {
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
