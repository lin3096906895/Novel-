import { Injectable } from '@nestjs/common';
import { ChapterStatus, NotificationType, Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';

type PublicationClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class ChapterPublicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async publishDueChapters(now = new Date(), limit = 50) {
    const dueChapters = await this.prisma.chapter.findMany({
      where: {
        status: ChapterStatus.SCHEDULED,
        scheduledAt: { lte: now },
      },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
      select: { id: true },
    });

    const published: string[] = [];
    for (const chapter of dueChapters) {
      const result = await this.publishScheduledChapter(chapter.id, now);
      if (result) {
        published.push(result.id);
      }
    }
    return published;
  }

  publishScheduledChapter(chapterId: string, publishedAt = new Date(), force = false) {
    return this.prisma.$transaction(async (tx) => {
      const chapter = await tx.chapter.findUnique({
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
              authorId: true,
            },
          },
        },
      });
      if (!chapter || chapter.status !== ChapterStatus.SCHEDULED) {
        return null;
      }

      const transitioned = await tx.chapter.updateMany({
        where: {
          id: chapterId,
          status: ChapterStatus.SCHEDULED,
          ...(force ? {} : { scheduledAt: { lte: publishedAt } }),
        },
        data: {
          status: ChapterStatus.PUBLISHED,
          publishedAt,
        },
      });
      if (transitioned.count === 0) {
        return null;
      }

      await tx.novel.update({
        where: { id: chapter.novelId },
        data: { wordCount: { increment: chapter.wordCount } },
      });

      await this.notificationsService.create(
        {
          userId: chapter.novel.authorId,
          type: NotificationType.SYSTEM,
          title: '定时章节已发布',
          content: `《${chapter.novel.title}》的章节“${chapter.title}”已按计划发布。`,
          link: '/author',
        },
        tx,
      );
      await this.notifyFollowers(
        {
          id: chapter.id,
          title: chapter.title,
          novelId: chapter.novelId,
          novelTitle: chapter.novel.title,
          authorId: chapter.novel.authorId,
        },
        tx,
      );

      return tx.chapter.findUnique({ where: { id: chapterId } });
    });
  }

  async notifyFollowers(
    chapter: {
      id: string;
      title: string;
      novelId: string;
      novelTitle: string;
      authorId: string;
    },
    client: PublicationClient,
  ) {
    const followers = await client.bookshelfItem.findMany({
      where: {
        novelId: chapter.novelId,
        notifyOnUpdate: true,
        userId: { not: chapter.authorId },
      },
      select: { userId: true },
    });
    return this.notificationsService.createMany(
      followers.map((follower) => ({
        userId: follower.userId,
        type: NotificationType.UPDATE,
        title: `《${chapter.novelTitle}》更新了`,
        content: `新章节“${chapter.title}”已发布，继续阅读吧。`,
        link: `/chapters/${chapter.id}`,
      })),
      client,
    );
  }
}
