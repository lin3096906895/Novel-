import { Injectable, NotFoundException } from '@nestjs/common';
import { NovelStatus } from '@prisma/client';
import { RequestUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { RecordSearchDto } from './dto/record-search.dto';
import { SearchListQueryDto, SearchSuggestionsQueryDto } from './dto/search-list-query.dto';

const publicNovelStatuses = [NovelStatus.SERIALIZING, NovelStatus.COMPLETED];

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async record(user: RequestUser | undefined, dto: RecordSearchDto) {
    const keyword = this.normalizeKeyword(dto.keyword);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const term = await tx.searchTerm.upsert({
        where: { keyword },
        update: {
          searchCount: { increment: 1 },
          lastSearchedAt: now,
        },
        create: {
          keyword,
          lastSearchedAt: now,
        },
      });

      const history = user
        ? await tx.searchHistory.upsert({
            where: {
              userId_keyword: {
                userId: user.id,
                keyword,
              },
            },
            update: {
              searchCount: { increment: 1 },
              lastSearchedAt: now,
            },
            create: {
              userId: user.id,
              keyword,
              lastSearchedAt: now,
            },
          })
        : null;

      return {
        keyword,
        searchCount: term.searchCount,
        history,
      };
    });
  }

  listHot(query: SearchListQueryDto) {
    return this.prisma.searchTerm.findMany({
      take: query.limit ?? 10,
      orderBy: [{ searchCount: 'desc' }, { lastSearchedAt: 'desc' }],
      select: {
        id: true,
        keyword: true,
        searchCount: true,
        lastSearchedAt: true,
      },
    });
  }

  async suggestions(query: SearchSuggestionsQueryDto) {
    const keyword = this.normalizeKeyword(query.keyword);
    const limit = query.limit ?? 8;
    const [novels, authors, tags] = await this.prisma.$transaction([
      this.prisma.novel.findMany({
        where: {
          status: { in: publicNovelStatuses },
          title: { contains: keyword, mode: 'insensitive' },
        },
        take: limit,
        orderBy: [{ updatedAt: 'desc' }],
        select: {
          id: true,
          title: true,
          author: { select: { nickname: true } },
          category: { select: { name: true } },
        },
      }),
      this.prisma.user.findMany({
        where: {
          OR: [
            { nickname: { contains: keyword, mode: 'insensitive' } },
            {
              authorProfile: {
                is: { penName: { contains: keyword, mode: 'insensitive' } },
              },
            },
          ],
          novels: { some: { status: { in: publicNovelStatuses } } },
        },
        take: limit,
        orderBy: { nickname: 'asc' },
        select: {
          id: true,
          nickname: true,
          authorProfile: { select: { penName: true } },
        },
      }),
      this.prisma.tag.findMany({
        where: {
          name: { contains: keyword, mode: 'insensitive' },
          novels: { some: { status: { in: publicNovelStatuses } } },
        },
        take: limit,
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    ]);

    return [
      ...novels.map((novel) => ({
        type: 'novel' as const,
        keyword: novel.title,
        label: novel.title,
        description: `${novel.category.name} · ${novel.author.nickname}`,
        novelId: novel.id,
      })),
      ...authors.map((author) => ({
        type: 'author' as const,
        keyword: author.authorProfile?.penName ?? author.nickname,
        label: author.authorProfile?.penName ?? author.nickname,
        description: '作者',
        authorId: author.id,
      })),
      ...tags.map((tag) => ({
        type: 'tag' as const,
        keyword: tag.name,
        label: tag.name,
        description: '作品标签',
      })),
    ].slice(0, limit);
  }

  listHistory(user: RequestUser, query: SearchListQueryDto) {
    return this.prisma.searchHistory.findMany({
      where: { userId: user.id },
      take: query.limit ?? 10,
      orderBy: { lastSearchedAt: 'desc' },
      select: {
        id: true,
        keyword: true,
        searchCount: true,
        lastSearchedAt: true,
      },
    });
  }

  async removeHistory(user: RequestUser, historyId: string) {
    const deleted = await this.prisma.searchHistory.deleteMany({
      where: { id: historyId, userId: user.id },
    });
    if (deleted.count === 0) {
      throw new NotFoundException('搜索记录不存在');
    }
    return { deleted: true };
  }

  async clearHistory(user: RequestUser) {
    const deleted = await this.prisma.searchHistory.deleteMany({
      where: { userId: user.id },
    });
    return { deletedCount: deleted.count };
  }

  private normalizeKeyword(keyword: string) {
    return keyword.trim().replace(/\s+/g, ' ').toLocaleLowerCase('zh-CN');
  }
}
