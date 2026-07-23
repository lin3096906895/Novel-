import { BadRequestException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ChapterStatus,
  NotificationType,
  NovelStatus,
  ParagraphReportStatus,
  Prisma,
  SensitiveWordScope,
  UserRole,
} from '@prisma/client';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { RequestUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SensitiveWordsService } from '../moderation/sensitive-words.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ListCommentsDto } from './dto/list-comments.dto';
import { removeCommentPreservingReplies } from './comment-removal';

const publicNovelStatuses = [NovelStatus.SERIALIZING, NovelStatus.COMPLETED];
const commentUserSelect = { id: true, nickname: true, role: true } satisfies Prisma.UserSelect;
const replyInclude = {
  user: { select: commentUserSelect },
  likes: { select: { userId: true } },
  _count: { select: { likes: true } },
} satisfies Prisma.CommentInclude;
const rootInclude = {
  ...replyInclude,
  replies: {
    orderBy: { createdAt: 'asc' as const },
    include: replyInclude,
  },
} satisfies Prisma.CommentInclude;

type ReplyRecord = Prisma.CommentGetPayload<{ include: typeof replyInclude }>;
type RootRecord = Prisma.CommentGetPayload<{ include: typeof rootInclude }>;

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AdminAuditService,
    private readonly notificationsService: NotificationsService,
    private readonly sensitiveWordsService: SensitiveWordsService,
  ) {}

  async listByNovel(user: RequestUser | undefined, novelId: string, query: ListCommentsDto) {
    const novel = await this.ensurePublicNovel(novelId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const where = { novelId, chapterId: null, parentId: null };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: rootInclude,
      }),
      this.prisma.comment.count({ where }),
    ]);

    return {
      items: items.map((comment) => this.formatRoot(comment, user?.id, novel.authorId)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async create(user: RequestUser, novelId: string, dto: CreateCommentDto) {
    const novel = await this.ensurePublicNovel(novelId);
    await this.sensitiveWordsService.assertAllowed(SensitiveWordScope.COMMENT, [
      { label: '评论', text: dto.content },
    ]);

    const parent = dto.parentId
      ? await this.prisma.comment.findFirst({
          where: {
            id: dto.parentId,
            novelId,
            chapterId: null,
            parentId: null,
            isDeleted: false,
          },
          select: { id: true, userId: true },
        })
      : null;
    if (dto.parentId && !parent) {
      throw new BadRequestException('回复目标不存在或不可回复');
    }

    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: {
          userId: user.id,
          novelId,
          chapterId: null,
          parentId: parent?.id,
          content: dto.content.trim(),
        },
        include: replyInclude,
      });

      const notificationTarget = parent?.userId ?? novel.authorId;
      if (notificationTarget !== user.id) {
        const preview = dto.content.trim().slice(0, 60);
        await this.notificationsService.create(
          {
            userId: notificationTarget,
            type: NotificationType.COMMENT,
            title: parent ? '你的书评收到新回复' : '作品收到新评论',
            content: parent ? preview : `《${novel.title}》收到一条新评论：${preview}`,
            link: `/novels/${novelId}`,
          },
          tx,
        );
      }

      return {
        ...this.formatReply(comment, user.id, novel.authorId),
        replies: [],
      };
    });
  }

  async listByChapter(user: RequestUser | undefined, chapterId: string, query: ListCommentsDto) {
    const chapter = await this.ensurePublicChapter(chapterId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where = { chapterId, parentId: null };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: rootInclude,
      }),
      this.prisma.comment.count({ where }),
    ]);

    return {
      items: items.map((comment) =>
        this.formatRoot(comment, user?.id, chapter.novel.authorId),
      ),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async createForChapter(user: RequestUser, chapterId: string, dto: CreateCommentDto) {
    const chapter = await this.ensurePublicChapter(chapterId);
    await this.sensitiveWordsService.assertAllowed(SensitiveWordScope.COMMENT, [
      { label: '评论', text: dto.content },
    ]);

    const parent = dto.parentId
      ? await this.prisma.comment.findFirst({
          where: {
            id: dto.parentId,
            chapterId,
            parentId: null,
            isDeleted: false,
          },
          select: { id: true, userId: true },
        })
      : null;
    if (dto.parentId && !parent) {
      throw new BadRequestException('回复目标不存在或不可回复');
    }

    return this.prisma.$transaction(async (tx) => {
      const comment = await tx.comment.create({
        data: {
          userId: user.id,
          novelId: chapter.novelId,
          chapterId,
          parentId: parent?.id,
          content: dto.content.trim(),
        },
        include: replyInclude,
      });

      const notificationTarget = parent?.userId ?? chapter.novel.authorId;
      if (notificationTarget !== user.id) {
        const preview = dto.content.trim().slice(0, 60);
        await this.notificationsService.create(
          {
            userId: notificationTarget,
            type: NotificationType.COMMENT,
            title: parent ? '你的章节评论收到新回复' : '章节收到新评论',
            content: parent
              ? preview
              : `《${chapter.novel.title}》「${chapter.title}」收到一条新评论：${preview}`,
            link: `/chapters/${chapterId}`,
          },
          tx,
        );
      }

      return {
        ...this.formatReply(comment, user.id, chapter.novel.authorId),
        replies: [],
      };
    });
  }

  async like(user: RequestUser, commentId: string) {
    await this.ensurePublicComment(commentId);
    await this.prisma.commentLike.upsert({
      where: { userId_commentId: { userId: user.id, commentId } },
      create: { userId: user.id, commentId },
      update: {},
    });
    return {
      commentId,
      isLiked: true,
      likeCount: await this.prisma.commentLike.count({ where: { commentId } }),
    };
  }

  async unlike(user: RequestUser, commentId: string) {
    await this.prisma.commentLike.deleteMany({ where: { userId: user.id, commentId } });
    return {
      commentId,
      isLiked: false,
      likeCount: await this.prisma.commentLike.count({ where: { commentId } }),
    };
  }

  async listMine(user: RequestUser, query: ListCommentsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where = { userId: user.id, isDeleted: false };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.comment.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          novel: { select: { id: true, title: true, status: true } },
          chapter: { select: { id: true, title: true } },
        },
      }),
      this.prisma.comment.count({ where }),
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

  async deleteMine(user: RequestUser, commentId: string) {
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, userId: user.id, isDeleted: false },
      select: { id: true },
    });
    if (!comment) {
      throw new NotFoundException('评论不存在');
    }

    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.commentReport.updateMany({
        where: { commentId, status: ParagraphReportStatus.PENDING },
        data: {
          status: ParagraphReportStatus.DISMISSED,
          resolution: '评论已由发布者删除',
          resolvedAt: now,
        },
      });
      return removeCommentPreservingReplies(tx, commentId);
    });

    return result;
  }

  async listRecentForAdmin() {
    return this.prisma.comment.findMany({
      where: { isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        user: { select: { id: true, nickname: true, email: true, role: true } },
        novel: { select: { id: true, title: true } },
        chapter: { select: { id: true, title: true } },
      },
    });
  }

  async deleteAsAdmin(commentId: string, reviewer: RequestUser) {
    if (reviewer.role !== UserRole.ADMIN) {
      throw new NotFoundException('Comment not found');
    }

    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        userId: true,
        novelId: true,
        content: true,
        user: { select: { nickname: true } },
        novel: { select: { title: true } },
      },
    });

    if (!comment) {
      throw new NotFoundException('Comment not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.commentReport.updateMany({
        where: { commentId, status: ParagraphReportStatus.PENDING },
        data: {
          status: ParagraphReportStatus.RESOLVED,
          reviewerId: reviewer.id,
          resolution: '管理员直接删除评论',
          resolvedAt: new Date(),
        },
      });
      await removeCommentPreservingReplies(tx, commentId);

      await this.auditService.record(
        {
          actorId: reviewer.id,
          action: 'comment.delete',
          targetType: 'comment',
          targetId: commentId,
          summary: `删除用户 ${comment.user.nickname} 在《${comment.novel.title}》下的评论`,
          before: {
            userId: comment.userId,
            novelId: comment.novelId,
            content: comment.content,
          },
        },
        tx,
      );
    });

    return { deleted: true };
  }

  async deleteManyAsAdmin(commentIds: string[], reviewer: RequestUser) {
    const items: Array<{ id: string; success: boolean; error?: string }> = [];
    for (const id of [...new Set(commentIds)]) {
      try {
        await this.deleteAsAdmin(id, reviewer);
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

  private formatRoot(comment: RootRecord, userId: string | undefined, authorId: string) {
    return {
      ...this.formatReply(comment, userId, authorId),
      replies: comment.replies.map((reply) => this.formatReply(reply, userId, authorId)),
    };
  }

  private formatReply(comment: ReplyRecord, userId: string | undefined, authorId: string) {
    const { likes, _count, ...record } = comment;
    return {
      ...record,
      content: record.isDeleted ? null : record.content,
      isAuthor: record.userId === authorId,
      isLiked: Boolean(userId && likes.some((like) => like.userId === userId)),
      likeCount: _count.likes,
    };
  }

  private async ensurePublicComment(commentId: string) {
    const comment = await this.prisma.comment.findFirst({
      where: {
        id: commentId,
        isDeleted: false,
        novel: { status: { in: publicNovelStatuses } },
        OR: [{ chapterId: null }, { chapter: { status: ChapterStatus.PUBLISHED } }],
      },
      select: { id: true },
    });
    if (!comment) {
      throw new NotFoundException('评论不存在或不可操作');
    }
    return comment;
  }

  private async ensurePublicNovel(novelId: string) {
    const novel = await this.prisma.novel.findFirst({
      where: {
        id: novelId,
        status: { in: publicNovelStatuses },
      },
      select: { id: true, title: true, authorId: true },
    });

    if (!novel) {
      throw new NotFoundException('小说不存在或尚未上架');
    }

    return novel;
  }

  private async ensurePublicChapter(chapterId: string) {
    const chapter = await this.prisma.chapter.findFirst({
      where: {
        id: chapterId,
        status: ChapterStatus.PUBLISHED,
        novel: { status: { in: publicNovelStatuses } },
      },
      select: {
        id: true,
        title: true,
        novelId: true,
        novel: { select: { id: true, title: true, authorId: true } },
      },
    });

    if (!chapter) {
      throw new NotFoundException('章节不存在或尚未发布');
    }

    return chapter;
  }
}
