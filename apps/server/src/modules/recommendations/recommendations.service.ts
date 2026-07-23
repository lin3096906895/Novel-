import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NovelStatus, Prisma } from '@prisma/client';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { RequestUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { PersonalizedRecommendationsQueryDto } from './dto/personalized-recommendations-query.dto';
import { UpdateRecommendSlotDto } from './dto/update-recommend-slot.dto';

const publicNovelStatuses = [NovelStatus.SERIALIZING, NovelStatus.COMPLETED];
const recommendationNovelInclude = {
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

type RecommendationNovel = Prisma.NovelGetPayload<{
  include: typeof recommendationNovelInclude;
}>;

@Injectable()
export class RecommendationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AdminAuditService,
  ) {}

  async findSlot(code: string) {
    const slot = await this.prisma.recommendSlot.findUnique({
      where: { code },
      include: {
        items: {
          where: {
            novel: { status: { in: publicNovelStatuses } },
          },
          orderBy: { sortOrder: 'asc' },
          include: {
            novel: {
              include: {
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
              },
            },
          },
        },
      },
    });

    if (!slot) {
      throw new NotFoundException('Recommendation slot not found');
    }

    return {
      id: slot.id,
      code: slot.code,
      name: slot.name,
      items: slot.items.map((item) => ({
        id: item.id,
        sortOrder: item.sortOrder,
        novel: item.novel,
      })),
    };
  }

  async findPersonalized(user: RequestUser, query: PersonalizedRecommendationsQueryDto) {
    const limit = query.limit ?? 6;
    const [histories, bookshelfItems] = await this.prisma.$transaction([
      this.prisma.readingHistory.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select: {
          novelId: true,
          novel: {
            select: {
              category: { select: { id: true, name: true } },
              tags: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.bookshelfItem.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          novelId: true,
          novel: {
            select: {
              category: { select: { id: true, name: true } },
              tags: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const categoryScores = new Map<string, PreferenceScore>();
    const tagScores = new Map<string, PreferenceScore>();
    histories.forEach((item) =>
      this.addNovelPreference(item.novel, 3, 2, categoryScores, tagScores),
    );
    bookshelfItems.forEach((item) =>
      this.addNovelPreference(item.novel, 5, 3, categoryScores, tagScores),
    );

    const excludedIds = Array.from(
      new Set([
        ...histories.map((item) => item.novelId),
        ...bookshelfItems.map((item) => item.novelId),
      ]),
    );
    const candidates = await this.prisma.novel.findMany({
      where: {
        status: { in: publicNovelStatuses },
        id: excludedIds.length > 0 ? { notIn: excludedIds } : undefined,
      },
      take: 100,
      orderBy: [{ updatedAt: 'desc' }],
      include: recommendationNovelInclude,
    });

    const hasSignals = histories.length > 0 || bookshelfItems.length > 0;
    const now = Date.now();
    const items = candidates
      .map((novel) => this.scoreNovel(novel, categoryScores, tagScores, hasSignals, now))
      .sort(
        (a, b) =>
          b.score - a.score ||
          b.novel.updatedAt.getTime() - a.novel.updatedAt.getTime() ||
          b.novel.wordCount - a.novel.wordCount,
      )
      .slice(0, limit);

    return {
      source: hasSignals ? ('personalized' as const) : ('fallback' as const),
      basis: {
        historyCount: histories.length,
        bookshelfCount: bookshelfItems.length,
        categories: this.topPreferences(categoryScores),
        tags: this.topPreferences(tagScores),
      },
      items,
    };
  }

  async updateSlotItems(actor: RequestUser, code: string, dto: UpdateRecommendSlotDto) {
    const novelIds = Array.from(new Set(dto.novelIds));

    if (novelIds.length !== dto.novelIds.length) {
      throw new BadRequestException('Recommendation novels must be unique');
    }

    const slot = await this.prisma.recommendSlot.findUnique({
      where: { code },
      select: {
        id: true,
        code: true,
        name: true,
        items: {
          orderBy: { sortOrder: 'asc' },
          select: {
            novelId: true,
            sortOrder: true,
            novel: { select: { title: true } },
          },
        },
      },
    });

    if (!slot) {
      throw new NotFoundException('Recommendation slot not found');
    }

    if (novelIds.length > 0) {
      const validCount = await this.prisma.novel.count({
        where: {
          id: { in: novelIds },
          status: { in: publicNovelStatuses },
        },
      });

      if (validCount !== novelIds.length) {
        throw new BadRequestException('Only published novels can be recommended');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.recommendItem.deleteMany({
        where: { slotId: slot.id },
      });

      if (novelIds.length > 0) {
        await tx.recommendItem.createMany({
          data: novelIds.map((novelId, index) => ({
            slotId: slot.id,
            novelId,
            sortOrder: index + 1,
          })),
        });
      }

      const nextNovels =
        novelIds.length > 0
          ? await tx.novel.findMany({
              where: { id: { in: novelIds } },
              select: { id: true, title: true },
            })
          : [];
      const nextNovelById = new Map(nextNovels.map((novel) => [novel.id, novel]));

      await this.auditService.record(
        {
          actorId: actor.id,
          action: 'recommend_slot.items.update',
          targetType: 'recommend_slot',
          targetId: slot.id,
          summary: `更新推荐位“${slot.name}”（${slot.items.length} 本调整为 ${novelIds.length} 本）`,
          before: {
            code: slot.code,
            items: slot.items.map((item) => ({
              novelId: item.novelId,
              title: item.novel.title,
              sortOrder: item.sortOrder,
            })),
          },
          after: {
            code: slot.code,
            items: novelIds.map((novelId, index) => ({
              novelId,
              title: nextNovelById.get(novelId)?.title ?? novelId,
              sortOrder: index + 1,
            })),
          },
        },
        tx,
      );
    });

    return this.findSlot(code);
  }

  private addNovelPreference(
    novel: {
      category: { id: string; name: string };
      tags: Array<{ id: string; name: string }>;
    },
    categoryWeight: number,
    tagWeight: number,
    categoryScores: Map<string, PreferenceScore>,
    tagScores: Map<string, PreferenceScore>,
  ) {
    this.addPreference(categoryScores, novel.category.id, novel.category.name, categoryWeight);
    novel.tags.forEach((tag) => this.addPreference(tagScores, tag.id, tag.name, tagWeight));
  }

  private addPreference(
    preferences: Map<string, PreferenceScore>,
    id: string,
    name: string,
    weight: number,
  ) {
    const current = preferences.get(id);
    preferences.set(id, { name, score: (current?.score ?? 0) + weight });
  }

  private scoreNovel(
    novel: RecommendationNovel,
    categoryScores: Map<string, PreferenceScore>,
    tagScores: Map<string, PreferenceScore>,
    hasSignals: boolean,
    now: number,
  ) {
    const categoryScore = categoryScores.get(novel.categoryId)?.score ?? 0;
    const matchedTags = novel.tags
      .map((tag) => ({ name: tag.name, score: tagScores.get(tag.id)?.score ?? 0 }))
      .filter((tag) => tag.score > 0)
      .sort((a, b) => b.score - a.score);
    const tagScore = matchedTags.reduce((total, tag) => total + tag.score, 0);
    const engagementScore = Math.min(
      5,
      Math.log2((novel._count.bookshelf ?? 0) + 1) +
        Math.log2((novel._count.comments ?? 0) + 1) * 0.75,
    );
    const ageDays = Math.max(0, (now - novel.updatedAt.getTime()) / (24 * 60 * 60 * 1000));
    const freshnessScore = ageDays <= 7 ? 3 : ageDays <= 30 ? 2 : ageDays <= 90 ? 1 : 0;
    const score = categoryScore + tagScore + engagementScore + freshnessScore;

    let reason = '近期活跃作品';
    if (categoryScore > 0) {
      reason = `因为你常读${novel.category.name}`;
    } else if (matchedTags[0]) {
      reason = `包含你喜欢的“${matchedTags[0].name}”`;
    } else if (hasSignals) {
      reason = '根据近期热度补充推荐';
    }

    return {
      novel,
      score: Number(score.toFixed(2)),
      reason,
      matchedTags: matchedTags.map((tag) => tag.name).slice(0, 3),
    };
  }

  private topPreferences(preferences: Map<string, PreferenceScore>) {
    return Array.from(preferences.values())
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'zh-CN'))
      .slice(0, 3)
      .map((item) => item.name);
  }
}

interface PreferenceScore {
  name: string;
  score: number;
}
