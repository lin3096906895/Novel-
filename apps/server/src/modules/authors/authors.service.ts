import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChapterStatus, NovelStatus, Prisma, UserRole, UserStatus } from '@prisma/client';
import { RequestUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

const publicNovelStatuses = [NovelStatus.SERIALIZING, NovelStatus.COMPLETED];

const publicNovelInclude = {
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
      chapters: { where: { status: ChapterStatus.PUBLISHED, deletedAt: null } },
      comments: true,
      bookshelf: true,
    },
  },
} satisfies Prisma.NovelInclude;

@Injectable()
export class AuthorsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicProfile(viewer: RequestUser | undefined, authorId: string) {
    const author = await this.prisma.user.findFirst({
      where: {
        id: authorId,
        status: UserStatus.ACTIVE,
        role: { in: [UserRole.AUTHOR, UserRole.ADMIN] },
        authorProfile: { isNot: null },
      },
      select: {
        id: true,
        nickname: true,
        createdAt: true,
        authorProfile: true,
        novels: {
          where: { status: { in: publicNovelStatuses } },
          orderBy: { updatedAt: 'desc' },
          include: publicNovelInclude,
        },
      },
    });
    if (!author?.authorProfile) {
      throw new NotFoundException('作者不存在或尚未公开');
    }

    const [followerCount, following] = await Promise.all([
      this.prisma.authorFollow.count({ where: { authorId } }),
      viewer && viewer.id !== authorId
        ? this.prisma.authorFollow.findUnique({
            where: { followerId_authorId: { followerId: viewer.id, authorId } },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    return {
      id: author.id,
      nickname: author.nickname,
      penName: author.authorProfile.penName,
      bio: author.authorProfile.bio,
      authorSince: author.authorProfile.createdAt,
      isSelf: viewer?.id === author.id,
      isFollowing: Boolean(following),
      stats: {
        followers: followerCount,
        works: author.novels.length,
        words: author.novels.reduce((total, novel) => total + novel.wordCount, 0),
        chapters: author.novels.reduce((total, novel) => total + novel._count.chapters, 0),
        bookshelf: author.novels.reduce((total, novel) => total + novel._count.bookshelf, 0),
      },
      novels: author.novels,
    };
  }

  async listFollowedAuthors(user: RequestUser) {
    const follows = await this.prisma.authorFollow.findMany({
      where: {
        followerId: user.id,
        author: {
          status: UserStatus.ACTIVE,
          role: { in: [UserRole.AUTHOR, UserRole.ADMIN] },
          authorProfile: { isNot: null },
        },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        createdAt: true,
        author: {
          select: {
            id: true,
            nickname: true,
            authorProfile: true,
            _count: { select: { authorFollowers: true } },
            novels: {
              where: { status: { in: publicNovelStatuses } },
              orderBy: { updatedAt: 'desc' },
              take: 3,
              include: publicNovelInclude,
            },
          },
        },
      },
    });

    return follows.map((follow) => ({
      followedAt: follow.createdAt,
      author: {
        id: follow.author.id,
        nickname: follow.author.nickname,
        penName: follow.author.authorProfile?.penName ?? follow.author.nickname,
        bio: follow.author.authorProfile?.bio ?? null,
        followers: follow.author._count.authorFollowers,
        works: follow.author.novels.length,
      },
      latestNovels: follow.author.novels,
    }));
  }

  async follow(user: RequestUser, authorId: string) {
    if (user.id === authorId) {
      throw new BadRequestException('不能关注自己');
    }
    await this.ensurePublicAuthor(authorId);
    await this.prisma.authorFollow.upsert({
      where: { followerId_authorId: { followerId: user.id, authorId } },
      create: { followerId: user.id, authorId },
      update: {},
    });
    return {
      authorId,
      isFollowing: true,
      followerCount: await this.prisma.authorFollow.count({ where: { authorId } }),
    };
  }

  async unfollow(user: RequestUser, authorId: string) {
    await this.prisma.authorFollow.deleteMany({
      where: { followerId: user.id, authorId },
    });
    return {
      authorId,
      isFollowing: false,
      followerCount: await this.prisma.authorFollow.count({ where: { authorId } }),
    };
  }

  private async ensurePublicAuthor(authorId: string) {
    const author = await this.prisma.user.findFirst({
      where: {
        id: authorId,
        status: UserStatus.ACTIVE,
        role: { in: [UserRole.AUTHOR, UserRole.ADMIN] },
        authorProfile: { isNot: null },
      },
      select: { id: true },
    });
    if (!author) {
      throw new NotFoundException('作者不存在或尚未公开');
    }
    return author;
  }
}
