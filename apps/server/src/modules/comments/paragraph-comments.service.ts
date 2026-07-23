import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ChapterStatus,
  NotificationType,
  NovelStatus,
  Prisma,
  SensitiveWordScope,
} from '@prisma/client';
import { RequestUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { SensitiveWordsService } from '../moderation/sensitive-words.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateParagraphCommentDto } from './dto/create-paragraph-comment.dto';
import { ListCommentsDto } from './dto/list-comments.dto';

const publicNovelStatuses = [NovelStatus.SERIALIZING, NovelStatus.COMPLETED];
const userSelect = { id: true, nickname: true, role: true } as const;
const replyInclude = {
  user: { select: userSelect },
  likes: { select: { userId: true } },
  _count: { select: { likes: true } },
} satisfies Prisma.ParagraphCommentInclude;
const rootInclude = {
  ...replyInclude,
  replies: {
    orderBy: { createdAt: 'asc' as const },
    include: replyInclude,
  },
} satisfies Prisma.ParagraphCommentInclude;

type ReplyRecord = Prisma.ParagraphCommentGetPayload<{ include: typeof replyInclude }>;
type RootRecord = Prisma.ParagraphCommentGetPayload<{ include: typeof rootInclude }>;

@Injectable()
export class ParagraphCommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly sensitiveWordsService: SensitiveWordsService,
  ) {}

  async summary(chapterId: string) {
    await this.ensurePublicChapter(chapterId);
    const groups = await this.prisma.paragraphComment.groupBy({
      by: ['paragraphIndex'],
      where: { chapterId, isDeleted: false },
      _count: { _all: true },
      orderBy: { paragraphIndex: 'asc' },
    });

    const items = groups.map((group) => ({
      paragraphIndex: group.paragraphIndex,
      count: group._count._all,
    }));

    return {
      items,
      total: items.reduce((total, item) => total + item.count, 0),
    };
  }

  async list(
    user: RequestUser | undefined,
    chapterId: string,
    paragraphIndex: number,
    query: ListCommentsDto,
  ) {
    const chapter = await this.ensureParagraph(chapterId, paragraphIndex);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const rootWhere = { chapterId, paragraphIndex, parentId: null };
    const [items, rootTotal, totalComments] = await this.prisma.$transaction([
      this.prisma.paragraphComment.findMany({
        where: rootWhere,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: rootInclude,
      }),
      this.prisma.paragraphComment.count({ where: rootWhere }),
      this.prisma.paragraphComment.count({
        where: { chapterId, paragraphIndex, isDeleted: false },
      }),
    ]);

    return {
      paragraphIndex,
      paragraph: chapter.paragraph,
      items: items.map((comment) => this.formatRoot(comment, user?.id, chapter.authorId)),
      totalComments,
      pagination: {
        page,
        pageSize,
        total: rootTotal,
        totalPages: Math.ceil(rootTotal / pageSize),
      },
    };
  }

  async listMine(user: RequestUser, query: ListCommentsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where = { userId: user.id, isDeleted: false };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.paragraphComment.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          chapter: {
            select: {
              id: true,
              title: true,
              novel: { select: { id: true, title: true } },
            },
          },
          parent: {
            select: {
              id: true,
              user: { select: { id: true, nickname: true } },
            },
          },
        },
      }),
      this.prisma.paragraphComment.count({ where }),
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

  async create(
    user: RequestUser,
    chapterId: string,
    paragraphIndex: number,
    dto: CreateParagraphCommentDto,
  ) {
    const chapter = await this.ensureParagraph(chapterId, paragraphIndex);
    const content = dto.content.trim();
    await this.sensitiveWordsService.assertAllowed(SensitiveWordScope.COMMENT, [
      { label: '段评', text: content },
    ]);
    const parent = dto.parentId
      ? await this.prisma.paragraphComment.findFirst({
          where: {
            id: dto.parentId,
            chapterId,
            paragraphIndex,
            parentId: null,
            isDeleted: false,
          },
          select: { id: true, userId: true },
        })
      : null;

    if (dto.parentId && !parent) {
      throw new BadRequestException('只能回复当前段落中仍然可见的段评');
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.paragraphComment.create({
        data: {
          userId: user.id,
          chapterId,
          paragraphIndex,
          parentId: parent?.id,
          content,
        },
        include: replyInclude,
      });

      const notificationTarget = parent?.userId ?? chapter.authorId;
      if (notificationTarget !== user.id) {
        await this.notificationsService.create(
          {
            userId: notificationTarget,
            type: NotificationType.COMMENT,
            title: parent ? '你的段评收到新回复' : '章节收到新段评',
            content: parent
              ? `${content.slice(0, 60)}`
              : `《${chapter.novelTitle}》「${chapter.chapterTitle}」第 ${paragraphIndex + 1} 段：${content.slice(0, 60)}`,
            link: `/chapters/${chapterId}?paragraph=${paragraphIndex}`,
          },
          tx,
        );
      }

      return {
        ...this.formatReply(created, user.id, chapter.authorId),
        replies: [],
      };
    });
  }

  async like(user: RequestUser, commentId: string) {
    await this.ensurePublicComment(commentId);
    await this.prisma.paragraphCommentLike.upsert({
      where: { userId_commentId: { userId: user.id, commentId } },
      update: {},
      create: { userId: user.id, commentId },
    });

    return {
      id: commentId,
      liked: true,
      likeCount: await this.prisma.paragraphCommentLike.count({ where: { commentId } }),
    };
  }

  async unlike(user: RequestUser, commentId: string) {
    await this.ensurePublicComment(commentId);
    await this.prisma.paragraphCommentLike.deleteMany({
      where: { userId: user.id, commentId },
    });

    return {
      id: commentId,
      liked: false,
      likeCount: await this.prisma.paragraphCommentLike.count({ where: { commentId } }),
    };
  }

  async remove(user: RequestUser, commentId: string) {
    const comment = await this.prisma.paragraphComment.findFirst({
      where: { id: commentId, userId: user.id },
      select: {
        id: true,
        parentId: true,
        isDeleted: true,
        _count: { select: { replies: true } },
      },
    });

    if (!comment) {
      throw new NotFoundException('段评不存在');
    }

    if (comment.isDeleted) {
      return { id: commentId, deleted: true, softDeleted: true };
    }

    if (!comment.parentId && comment._count.replies > 0) {
      await this.prisma.paragraphComment.update({
        where: { id: commentId },
        data: { isDeleted: true, content: '' },
      });
      return { id: commentId, deleted: true, softDeleted: true };
    }

    await this.prisma.paragraphComment.delete({ where: { id: commentId } });
    return { id: commentId, deleted: true, softDeleted: false };
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
    const comment = await this.prisma.paragraphComment.findFirst({
      where: {
        id: commentId,
        isDeleted: false,
        chapter: {
          status: ChapterStatus.PUBLISHED,
          novel: { status: { in: publicNovelStatuses } },
        },
      },
      select: { id: true },
    });

    if (!comment) {
      throw new NotFoundException('段评不存在');
    }

    return comment;
  }

  private async ensureParagraph(chapterId: string, paragraphIndex: number) {
    const chapter = await this.ensurePublicChapter(chapterId);
    const paragraph = chapter.content.split(/\n+/)[paragraphIndex];
    if (paragraph === undefined) {
      throw new BadRequestException('段落不存在');
    }

    return {
      paragraph,
      authorId: chapter.novel.authorId,
      novelTitle: chapter.novel.title,
      chapterTitle: chapter.title,
    };
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
        content: true,
        novel: { select: { title: true, authorId: true } },
      },
    });

    if (!chapter) {
      throw new NotFoundException('章节不存在或尚未发布');
    }

    return chapter;
  }
}
