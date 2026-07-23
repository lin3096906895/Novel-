import { Injectable } from '@nestjs/common';
import { ChapterStatus, NovelStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListRankingsDto, RankingPeriod, RankingType } from './dto/list-rankings.dto';

const publicNovelStatuses = [NovelStatus.SERIALIZING, NovelStatus.COMPLETED];
const shanghaiOffsetMs = 8 * 60 * 60 * 1000;
const dayMs = 24 * 60 * 60 * 1000;

const rankingNovelInclude = {
  author: { select: { id: true, nickname: true } },
  category: true,
  tags: true,
  _count: {
    select: {
      chapters: { where: { deletedAt: null } },
      comments: true,
      bookshelf: true,
    },
  },
} satisfies Prisma.NovelInclude;

type RankingNovel = Prisma.NovelGetPayload<{ include: typeof rankingNovelInclude }>;

const rankingLabels = {
  popular: {
    title: '热读榜',
    scoreLabel: '阅读章次',
  },
  bookshelf: {
    title: '收藏榜',
    scoreLabel: '收藏',
  },
  comments: {
    title: '讨论榜',
    scoreLabel: '评论',
  },
  new: {
    title: '新书榜',
    scoreLabel: '上架时间',
  },
} as const;

const periodLabels: Record<RankingPeriod, string> = {
  day: '日榜',
  week: '周榜',
  month: '月榜',
  all: '总榜',
};

@Injectable()
export class RankingsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListRankingsDto) {
    const type = query.type ?? 'popular';
    const period = query.period ?? 'week';
    const limit = query.limit ?? 20;
    const generatedAt = new Date();
    const startedAt = this.periodStart(period, generatedAt);
    const where: Prisma.NovelWhereInput = {
      status: { in: publicNovelStatuses },
      category: query.channel ? { channel: query.channel } : undefined,
      createdAt: type === 'new' && startedAt ? { gte: startedAt } : undefined,
    };

    const novels = await this.prisma.novel.findMany({
      where,
      include: rankingNovelInclude,
    });

    const scores = await this.activityScores(
      type,
      novels.map((novel) => novel.id),
      startedAt,
    );
    const sorted = this.sortInMemory(type, novels, scores).slice(0, limit);

    return {
      type,
      period,
      periodLabel: periodLabels[period],
      startedAt: startedAt?.toISOString() ?? null,
      generatedAt: generatedAt.toISOString(),
      title: rankingLabels[type].title,
      scoreLabel: rankingLabels[type].scoreLabel,
      items: sorted.map((novel, index) => ({
        rank: index + 1,
        score: type === 'new' ? novel.createdAt.toISOString() : (scores.get(novel.id) ?? 0),
        novel,
      })),
    };
  }

  private sortInMemory(type: RankingType, novels: RankingNovel[], scores: Map<string, number>) {
    if (type === 'new') {
      return [...novels].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.wordCount - a.wordCount,
      );
    }

    return [...novels].sort(
      (a, b) =>
        (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) ||
        b.updatedAt.getTime() - a.updatedAt.getTime() ||
        b.wordCount - a.wordCount,
    );
  }

  private async activityScores(type: RankingType, novelIds: string[], startedAt: Date | null) {
    const scores = new Map<string, number>();
    if (type === 'new' || novelIds.length === 0) {
      return scores;
    }

    if (type === 'popular') {
      const chapters = await this.prisma.chapter.findMany({
        where: {
          novelId: { in: novelIds },
          status: ChapterStatus.PUBLISHED,
        },
        select: { id: true, novelId: true },
      });
      const chapterIds = chapters.map((chapter) => chapter.id);
      if (chapterIds.length === 0) {
        return scores;
      }

      const chapterById = new Map(chapters.map((chapter) => [chapter.id, chapter.novelId]));
      const groups = await this.prisma.chapterRead.groupBy({
        by: ['chapterId'],
        where: {
          chapterId: { in: chapterIds },
          completedAt: startedAt ? { gte: startedAt } : undefined,
        },
        _count: { _all: true },
      });

      groups.forEach((group) => {
        const novelId = chapterById.get(group.chapterId);
        if (novelId) {
          scores.set(novelId, (scores.get(novelId) ?? 0) + group._count._all);
        }
      });
      return scores;
    }

    const where = {
      novelId: { in: novelIds },
      createdAt: startedAt ? { gte: startedAt } : undefined,
    };
    const groups =
      type === 'bookshelf'
        ? await this.prisma.bookshelfItem.groupBy({
            by: ['novelId'],
            where,
            _count: { _all: true },
          })
        : await this.prisma.comment.groupBy({
            by: ['novelId'],
            where,
            _count: { _all: true },
          });

    groups.forEach((group) => {
      scores.set(group.novelId, group._count._all);
    });
    return scores;
  }

  private periodStart(period: RankingPeriod, now: Date) {
    if (period === 'all') {
      return null;
    }

    const shanghaiNow = new Date(now.getTime() + shanghaiOffsetMs);
    const year = shanghaiNow.getUTCFullYear();
    const month = shanghaiNow.getUTCMonth();
    const date = shanghaiNow.getUTCDate();
    const dayStartInShanghai = Date.UTC(year, month, date);

    if (period === 'day') {
      return new Date(dayStartInShanghai - shanghaiOffsetMs);
    }

    if (period === 'week') {
      const daysSinceMonday = (shanghaiNow.getUTCDay() + 6) % 7;
      return new Date(dayStartInShanghai - daysSinceMonday * dayMs - shanghaiOffsetMs);
    }

    return new Date(Date.UTC(year, month, 1) - shanghaiOffsetMs);
  }
}
