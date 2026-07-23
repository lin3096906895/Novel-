import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChapterStatus, NovelStatus } from '@prisma/client';
import { RequestUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { SaveReadingHistoryDto } from './dto/save-reading-history.dto';
import { SaveReadingSessionDto } from './dto/save-reading-session.dto';
import { UpdateReadingPreferenceDto } from './dto/update-reading-preference.dto';

const publicNovelStatuses = [NovelStatus.SERIALIZING, NovelStatus.COMPLETED];
const defaultReadingPreference = {
  fontSize: 18,
  theme: 'LIGHT',
  lineHeight: 1.9,
  contentWidth: 760,
} as const;

@Injectable()
export class LibraryService {
  constructor(private readonly prisma: PrismaService) {}

  async getBookshelf(user: RequestUser) {
    const items = await this.prisma.bookshelfItem.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        novel: {
          include: {
            author: { select: { id: true, nickname: true } },
            category: true,
            tags: true,
            histories: {
              where: { userId: user.id },
              take: 1,
              select: {
                progress: true,
                readingSeconds: true,
                updatedAt: true,
                chapter: {
                  select: {
                    id: true,
                    title: true,
                    orderIndex: true,
                    wordCount: true,
                    publishedAt: true,
                  },
                },
              },
            },
            _count: {
              select: {
                chapters: { where: { deletedAt: null } },
                comments: true,
                bookshelf: true,
              },
            },
          },
        },
      },
    });

    if (items.length === 0) {
      return [];
    }

    const novelIds = items.map((item) => item.novelId);
    const chapterBoundaries = await this.prisma.chapter.groupBy({
      by: ['novelId'],
      where: {
        novelId: { in: novelIds },
        status: ChapterStatus.PUBLISHED,
      },
      _min: { orderIndex: true },
      _max: { orderIndex: true },
    });
    const boundaryFilters = chapterBoundaries.flatMap((boundary) => {
      const orderIndexes = [boundary._min.orderIndex, boundary._max.orderIndex].filter(
        (orderIndex): orderIndex is number => orderIndex !== null,
      );
      return Array.from(new Set(orderIndexes)).map((orderIndex) => ({
        novelId: boundary.novelId,
        orderIndex,
      }));
    });
    const boundaryChapters =
      boundaryFilters.length > 0
        ? await this.prisma.chapter.findMany({
            where: {
              status: ChapterStatus.PUBLISHED,
              OR: boundaryFilters,
            },
            select: {
              id: true,
              novelId: true,
              title: true,
              orderIndex: true,
              wordCount: true,
              publishedAt: true,
            },
          })
        : [];
    const chapterByNovelAndOrder = new Map(
      boundaryChapters.map((chapter) => [
        `${chapter.novelId}:${chapter.orderIndex}`,
        {
          id: chapter.id,
          title: chapter.title,
          orderIndex: chapter.orderIndex,
          wordCount: chapter.wordCount,
          publishedAt: chapter.publishedAt,
        },
      ]),
    );
    const boundaryByNovel = new Map(
      chapterBoundaries.map((boundary) => [boundary.novelId, boundary]),
    );
    const histories = items.flatMap((item, itemIndex) => {
      const history = item.novel.histories[0];
      return history
        ? [
            {
              itemIndex,
              novelId: item.novelId,
              orderIndex: history.chapter.orderIndex,
            },
          ]
        : [];
    });
    const unreadCounts =
      histories.length > 0
        ? await this.prisma.$transaction(
            histories.map((history) =>
              this.prisma.chapter.count({
                where: {
                  novelId: history.novelId,
                  status: ChapterStatus.PUBLISHED,
                  orderIndex: { gt: history.orderIndex },
                },
              }),
            ),
          )
        : [];
    const unreadCountByItem = new Map(
      histories.map((history, index) => [history.itemIndex, unreadCounts[index]]),
    );

    return items.map((item, itemIndex) => {
      const { histories: novelHistories, ...novel } = item.novel;
      const history = novelHistories[0];
      const boundary = boundaryByNovel.get(item.novelId);
      const firstChapter =
        boundary?._min.orderIndex === null || boundary?._min.orderIndex === undefined
          ? null
          : (chapterByNovelAndOrder.get(`${item.novelId}:${boundary._min.orderIndex}`) ?? null);
      const latestChapter =
        boundary?._max.orderIndex === null || boundary?._max.orderIndex === undefined
          ? null
          : (chapterByNovelAndOrder.get(`${item.novelId}:${boundary._max.orderIndex}`) ?? null);
      const unreadCount = history ? (unreadCountByItem.get(itemIndex) ?? 0) : 0;

      return {
        ...item,
        novel,
        latestChapter,
        continueChapter: history?.chapter ?? firstChapter,
        readingProgress: history?.progress ?? 0,
        readingSeconds: history?.readingSeconds ?? 0,
        unreadCount,
        hasUpdate: unreadCount > 0,
        lastUpdatedAt: latestChapter?.publishedAt ?? null,
        lastReadAt: history?.updatedAt ?? null,
      };
    });
  }

  async addToBookshelf(user: RequestUser, novelId: string) {
    await this.ensurePublicNovel(novelId);

    return this.prisma.bookshelfItem.upsert({
      where: {
        userId_novelId: {
          userId: user.id,
          novelId,
        },
      },
      update: {},
      create: {
        userId: user.id,
        novelId,
      },
      include: {
        novel: {
          include: {
            author: { select: { id: true, nickname: true } },
            category: true,
            tags: true,
          },
        },
      },
    });
  }

  async removeFromBookshelf(user: RequestUser, novelId: string) {
    await this.prisma.bookshelfItem.deleteMany({
      where: {
        userId: user.id,
        novelId,
      },
    });

    return { removed: true };
  }

  async updateBookshelfNotification(user: RequestUser, novelId: string, enabled: boolean) {
    const updated = await this.prisma.bookshelfItem.updateMany({
      where: {
        userId: user.id,
        novelId,
      },
      data: { notifyOnUpdate: enabled },
    });

    if (updated.count === 0) {
      throw new NotFoundException('作品不在书架中');
    }

    return {
      novelId,
      notifyOnUpdate: enabled,
    };
  }

  async getReadingHistories(user: RequestUser) {
    return this.prisma.readingHistory.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        novel: {
          include: {
            author: { select: { id: true, nickname: true } },
            category: true,
          },
        },
        chapter: {
          select: {
            id: true,
            title: true,
            orderIndex: true,
            wordCount: true,
            publishedAt: true,
          },
        },
      },
    });
  }

  async getReadingHistory(user: RequestUser, novelId: string) {
    return this.prisma.readingHistory.findUnique({
      where: {
        userId_novelId: {
          userId: user.id,
          novelId,
        },
      },
      include: {
        chapter: {
          select: {
            id: true,
            title: true,
            orderIndex: true,
            wordCount: true,
            publishedAt: true,
          },
        },
      },
    });
  }

  async getNovelReadStatus(user: RequestUser, novelId: string) {
    await this.ensurePublicNovel(novelId);

    const [history, completedChapters, totalChapters] = await this.prisma.$transaction([
      this.prisma.readingHistory.findUnique({
        where: {
          userId_novelId: {
            userId: user.id,
            novelId,
          },
        },
        select: {
          chapterId: true,
          progress: true,
        },
      }),
      this.prisma.chapterRead.findMany({
        where: {
          userId: user.id,
          chapter: {
            novelId,
            status: ChapterStatus.PUBLISHED,
          },
        },
        orderBy: { completedAt: 'asc' },
        select: {
          chapterId: true,
          completedAt: true,
        },
      }),
      this.prisma.chapter.count({
        where: {
          novelId,
          status: ChapterStatus.PUBLISHED,
        },
      }),
    ]);

    return {
      currentChapterId: history?.chapterId ?? null,
      currentProgress: history?.progress ?? 0,
      completedChapterIds: completedChapters.map((item) => item.chapterId),
      completedCount: completedChapters.length,
      totalChapters,
      isCaughtUp: totalChapters > 0 && completedChapters.length === totalChapters,
      lastCompletedAt: completedChapters.at(-1)?.completedAt ?? null,
    };
  }

  async removeReadingHistory(user: RequestUser, novelId: string) {
    await this.prisma.readingHistory.deleteMany({
      where: { userId: user.id, novelId },
    });

    return { deleted: true };
  }

  async clearReadingHistories(user: RequestUser) {
    const deleted = await this.prisma.readingHistory.deleteMany({
      where: { userId: user.id },
    });

    return { deletedCount: deleted.count };
  }

  async saveReadingHistory(user: RequestUser, dto: SaveReadingHistoryDto) {
    const chapter = await this.prisma.chapter.findFirst({
      where: {
        id: dto.chapterId,
        novelId: dto.novelId,
        status: ChapterStatus.PUBLISHED,
        novel: {
          status: { in: publicNovelStatuses },
        },
      },
      select: {
        id: true,
        novelId: true,
      },
    });

    if (!chapter) {
      throw new BadRequestException('章节不存在或尚未发布');
    }

    return this.prisma.$transaction(async (tx) => {
      const history = await tx.readingHistory.upsert({
        where: {
          userId_novelId: {
            userId: user.id,
            novelId: dto.novelId,
          },
        },
        update: {
          chapterId: dto.chapterId,
          progress: dto.progress,
        },
        create: {
          userId: user.id,
          novelId: dto.novelId,
          chapterId: dto.chapterId,
          progress: dto.progress,
        },
        include: {
          novel: {
            select: {
              id: true,
              title: true,
            },
          },
          chapter: {
            select: {
              id: true,
              title: true,
              orderIndex: true,
            },
          },
        },
      });

      const isChapterCompleted = dto.progress === 100;
      if (isChapterCompleted) {
        await tx.chapterRead.upsert({
          where: {
            userId_chapterId: {
              userId: user.id,
              chapterId: dto.chapterId,
            },
          },
          update: {},
          create: {
            userId: user.id,
            chapterId: dto.chapterId,
          },
        });
      }

      return { ...history, isChapterCompleted };
    });
  }

  async saveReadingSession(user: RequestUser, dto: SaveReadingSessionDto) {
    const chapter = await this.prisma.chapter.findFirst({
      where: {
        id: dto.chapterId,
        novelId: dto.novelId,
        status: ChapterStatus.PUBLISHED,
        novel: {
          status: { in: publicNovelStatuses },
        },
      },
      select: {
        id: true,
        novelId: true,
      },
    });

    if (!chapter) {
      throw new BadRequestException('章节不存在或尚未发布');
    }

    return this.prisma.$transaction(async (tx) => {
      const history = await tx.readingHistory.upsert({
        where: {
          userId_novelId: {
            userId: user.id,
            novelId: dto.novelId,
          },
        },
        update: {
          chapterId: dto.chapterId,
          progress: dto.progress,
          readingSeconds: { increment: dto.seconds },
        },
        create: {
          userId: user.id,
          novelId: dto.novelId,
          chapterId: dto.chapterId,
          progress: dto.progress,
          readingSeconds: dto.seconds,
        },
        include: {
          novel: {
            select: {
              id: true,
              title: true,
            },
          },
          chapter: {
            select: {
              id: true,
              title: true,
              orderIndex: true,
            },
          },
        },
      });

      const isChapterCompleted = dto.progress === 100;
      if (isChapterCompleted) {
        await tx.chapterRead.upsert({
          where: {
            userId_chapterId: {
              userId: user.id,
              chapterId: dto.chapterId,
            },
          },
          update: {},
          create: {
            userId: user.id,
            chapterId: dto.chapterId,
          },
        });
      }

      return { ...history, isChapterCompleted };
    });
  }

  async getReadingPreference(user: RequestUser) {
    const preference = await this.prisma.readingPreference.findUnique({
      where: { userId: user.id },
    });

    return preference ?? { userId: user.id, ...defaultReadingPreference };
  }

  async updateReadingPreference(user: RequestUser, dto: UpdateReadingPreferenceDto) {
    return this.prisma.readingPreference.upsert({
      where: { userId: user.id },
      update: dto,
      create: {
        userId: user.id,
        ...dto,
      },
    });
  }

  async getBookmarks(user: RequestUser) {
    return this.prisma.chapterBookmark.findMany({
      where: {
        userId: user.id,
        chapter: {
          status: ChapterStatus.PUBLISHED,
          novel: { status: { in: publicNovelStatuses } },
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        chapter: {
          select: {
            id: true,
            title: true,
            orderIndex: true,
            wordCount: true,
            publishedAt: true,
            novel: {
              select: {
                id: true,
                title: true,
                author: { select: { id: true, nickname: true } },
              },
            },
          },
        },
      },
    });
  }

  async getChapterBookmark(user: RequestUser, chapterId: string) {
    return this.prisma.chapterBookmark.findUnique({
      where: {
        userId_chapterId: {
          userId: user.id,
          chapterId,
        },
      },
    });
  }

  async addChapterBookmark(user: RequestUser, chapterId: string) {
    await this.ensurePublicChapter(chapterId);

    return this.prisma.chapterBookmark.upsert({
      where: {
        userId_chapterId: {
          userId: user.id,
          chapterId,
        },
      },
      update: {},
      create: {
        userId: user.id,
        chapterId,
      },
    });
  }

  async removeChapterBookmark(user: RequestUser, chapterId: string) {
    await this.prisma.chapterBookmark.deleteMany({
      where: {
        userId: user.id,
        chapterId,
      },
    });

    return { removed: true };
  }

  private async ensurePublicNovel(novelId: string) {
    const novel = await this.prisma.novel.findFirst({
      where: {
        id: novelId,
        status: { in: publicNovelStatuses },
      },
      select: { id: true },
    });

    if (!novel) {
      throw new NotFoundException('小说不存在或尚未上架');
    }
  }

  private async ensurePublicChapter(chapterId: string) {
    const chapter = await this.prisma.chapter.findFirst({
      where: {
        id: chapterId,
        status: ChapterStatus.PUBLISHED,
        novel: { status: { in: publicNovelStatuses } },
      },
      select: { id: true },
    });

    if (!chapter) {
      throw new NotFoundException('章节不存在或尚未发布');
    }
  }
}
