import { Injectable, NotFoundException } from '@nestjs/common';
import { ChapterStatus, NovelStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListNovelsDto } from './dto/list-novels.dto';

const publicNovelStatuses = [NovelStatus.SERIALIZING, NovelStatus.COMPLETED];

@Injectable()
export class NovelsService {
  constructor(private readonly prisma: PrismaService) {}

  async findPublicList(query: ListNovelsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 12;
    const statuses = query.status ? [NovelStatus[query.status]] : publicNovelStatuses;
    const where: Prisma.NovelWhereInput = {
      status: { in: statuses },
      categoryId: query.categoryId,
      category: query.channel ? { channel: query.channel } : undefined,
      tags: query.tagId ? { some: { id: query.tagId } } : undefined,
      OR: query.keyword
        ? [
            { title: { contains: query.keyword, mode: 'insensitive' } },
            { summary: { contains: query.keyword, mode: 'insensitive' } },
            { author: { nickname: { contains: query.keyword, mode: 'insensitive' } } },
            {
              author: {
                authorProfile: {
                  is: { penName: { contains: query.keyword, mode: 'insensitive' } },
                },
              },
            },
            { tags: { some: { name: { contains: query.keyword, mode: 'insensitive' } } } },
          ]
        : undefined,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.novel.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: this.publicOrderBy(query.sort),
        include: {
          author: {
            select: {
              id: true,
              nickname: true,
              authorProfile: { select: { penName: true } },
            },
          },
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
      }),
      this.prisma.novel.count({ where }),
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

  private publicOrderBy(sort: ListNovelsDto['sort']): Prisma.NovelOrderByWithRelationInput[] {
    if (sort === 'popular') {
      return [{ wordCount: 'desc' }, { updatedAt: 'desc' }];
    }

    if (sort === 'comments') {
      return [{ comments: { _count: 'desc' } }, { updatedAt: 'desc' }];
    }

    if (sort === 'bookshelf') {
      return [{ bookshelf: { _count: 'desc' } }, { updatedAt: 'desc' }];
    }

    return [{ updatedAt: 'desc' }];
  }

  async findPublicDetail(id: string) {
    const novel = await this.prisma.novel.findFirst({
      where: {
        id,
        status: { in: publicNovelStatuses },
      },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            authorProfile: { select: { penName: true } },
          },
        },
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
    });

    if (!novel) {
      throw new NotFoundException('小说不存在或尚未上架');
    }

    return novel;
  }

  async findPublicChapters(novelId: string) {
    await this.findPublicDetail(novelId);

    const chapters = await this.prisma.chapter.findMany({
      where: {
        novelId,
        status: ChapterStatus.PUBLISHED,
      },
      orderBy: { orderIndex: 'asc' },
      select: {
        id: true,
        title: true,
        orderIndex: true,
        wordCount: true,
        publishedAt: true,
        volumeId: true,
        volume: {
          select: {
            id: true,
            title: true,
            orderIndex: true,
          },
        },
      },
    });

    return chapters.sort(
      (left, right) =>
        (left.volume?.orderIndex ?? Number.MAX_SAFE_INTEGER) -
          (right.volume?.orderIndex ?? Number.MAX_SAFE_INTEGER) ||
        left.orderIndex - right.orderIndex,
    );
  }

  async findPublicAnnouncements(novelId: string) {
    await this.findPublicDetail(novelId);

    return this.prisma.novelAnnouncement.findMany({
      where: {
        novelId,
        publishedAt: { not: null },
      },
      orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }],
      take: 20,
    });
  }

  async findPublicChapter(chapterId: string) {
    const chapter = await this.prisma.chapter.findFirst({
      where: {
        id: chapterId,
        status: ChapterStatus.PUBLISHED,
        novel: {
          status: { in: publicNovelStatuses },
        },
      },
      include: {
        volume: {
          select: {
            id: true,
            title: true,
            orderIndex: true,
          },
        },
        novel: {
          select: {
            id: true,
            title: true,
            sourceAuthor: true,
            author: {
              select: {
                id: true,
                nickname: true,
                authorProfile: { select: { penName: true } },
              },
            },
          },
        },
      },
    });

    if (!chapter) {
      throw new NotFoundException('章节不存在或尚未发布');
    }

    return chapter;
  }
}
