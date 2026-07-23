import { Injectable, NotFoundException } from '@nestjs/common';
import { NovelStatus } from '@prisma/client';
import { RequestUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';

const publicNovelStatuses = [NovelStatus.SERIALIZING, NovelStatus.COMPLETED];

@Injectable()
export class NovelRatingsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(user: RequestUser | undefined, novelId: string) {
    await this.ensurePublicNovel(novelId);
    const [average, count, groups, mine] = await Promise.all([
      this.prisma.novelRating.aggregate({ where: { novelId }, _avg: { score: true } }),
      this.prisma.novelRating.count({ where: { novelId } }),
      this.prisma.novelRating.groupBy({
        by: ['score'],
        where: { novelId },
        _count: { score: true },
        orderBy: { score: 'desc' },
      }),
      user
        ? this.prisma.novelRating.findUnique({
            where: { userId_novelId: { userId: user.id, novelId } },
            select: { score: true },
          })
        : Promise.resolve(null),
    ]);
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    groups.forEach((group) => {
      distribution[group.score as keyof typeof distribution] = group._count.score;
    });

    return {
      average: Number((average._avg.score ?? 0).toFixed(1)),
      count,
      distribution,
      myScore: mine?.score ?? null,
    };
  }

  async save(user: RequestUser, novelId: string, score: number) {
    await this.ensurePublicNovel(novelId);
    await this.prisma.novelRating.upsert({
      where: { userId_novelId: { userId: user.id, novelId } },
      create: { userId: user.id, novelId, score },
      update: { score },
    });
    return this.summary(user, novelId);
  }

  async remove(user: RequestUser, novelId: string) {
    await this.prisma.novelRating.deleteMany({ where: { userId: user.id, novelId } });
    return this.summary(user, novelId);
  }

  private async ensurePublicNovel(novelId: string) {
    const novel = await this.prisma.novel.findFirst({
      where: { id: novelId, status: { in: publicNovelStatuses } },
      select: { id: true },
    });
    if (!novel) {
      throw new NotFoundException('小说不存在或尚未上架');
    }
    return novel;
  }
}
