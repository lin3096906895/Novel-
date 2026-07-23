import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, NovelStatus, Prisma, UserRole } from '@prisma/client';
import { RequestUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { SaveNovelAnnouncementDto } from './dto/save-novel-announcement.dto';

const publicNovelStatuses = new Set<NovelStatus>([
  NovelStatus.SERIALIZING,
  NovelStatus.COMPLETED,
]);

@Injectable()
export class AuthorAnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async list(user: RequestUser, novelId: string) {
    await this.ensureNovelOwnership(user, novelId);
    return this.prisma.novelAnnouncement.findMany({
      where: { novelId },
      orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async create(user: RequestUser, novelId: string, dto: SaveNovelAnnouncementDto) {
    const novel = await this.ensureNovelOwnership(user, novelId);
    const isPublishing = dto.action === 'publish';
    this.ensurePublishable(novel.status, isPublishing);

    return this.prisma.$transaction(async (tx) => {
      const announcement = await tx.novelAnnouncement.create({
        data: {
          novelId,
          title: dto.title.trim(),
          content: dto.content.trim(),
          isPinned: dto.isPinned ?? false,
          publishedAt: isPublishing ? new Date() : null,
        },
      });

      if (isPublishing) {
        await this.notifyFollowers(tx, novel, announcement);
      }

      return announcement;
    });
  }

  async update(user: RequestUser, announcementId: string, dto: SaveNovelAnnouncementDto) {
    const announcement = await this.prisma.novelAnnouncement.findUnique({
      where: { id: announcementId },
      include: {
        novel: { select: { id: true, title: true, authorId: true, status: true } },
      },
    });

    if (!announcement) {
      throw new NotFoundException('作品公告不存在');
    }
    this.ensureOwnership(user, announcement.novel.authorId);

    const isPublishing = dto.action === 'publish';
    const isNewPublication = isPublishing && !announcement.publishedAt;
    this.ensurePublishable(announcement.novel.status, isPublishing);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.novelAnnouncement.update({
        where: { id: announcementId },
        data: {
          title: dto.title.trim(),
          content: dto.content.trim(),
          isPinned: dto.isPinned ?? false,
          publishedAt: isPublishing ? announcement.publishedAt ?? new Date() : null,
        },
      });

      if (isNewPublication) {
        await this.notifyFollowers(tx, announcement.novel, updated);
      }

      return updated;
    });
  }

  async delete(user: RequestUser, announcementId: string) {
    const announcement = await this.prisma.novelAnnouncement.findUnique({
      where: { id: announcementId },
      include: { novel: { select: { authorId: true } } },
    });

    if (!announcement) {
      throw new NotFoundException('作品公告不存在');
    }
    this.ensureOwnership(user, announcement.novel.authorId);

    await this.prisma.novelAnnouncement.delete({ where: { id: announcementId } });
    return { deletedId: announcementId };
  }

  private async ensureNovelOwnership(user: RequestUser, novelId: string) {
    const novel = await this.prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true, title: true, authorId: true, status: true },
    });

    if (!novel) {
      throw new NotFoundException('作品不存在');
    }
    this.ensureOwnership(user, novel.authorId);
    return novel;
  }

  private ensureOwnership(user: RequestUser, authorId: string) {
    if (authorId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('只能管理自己的作品公告');
    }
  }

  private ensurePublishable(status: NovelStatus, isPublishing: boolean) {
    if (isPublishing && !publicNovelStatuses.has(status)) {
      throw new BadRequestException('作品上架后才能发布公告');
    }
  }

  private async notifyFollowers(
    tx: Prisma.TransactionClient,
    novel: { id: string; title: string; authorId: string },
    announcement: { title: string; content: string },
  ) {
    const followers = await tx.bookshelfItem.findMany({
      where: {
        novelId: novel.id,
        notifyOnUpdate: true,
        userId: { not: novel.authorId },
      },
      select: { userId: true },
    });
    const preview = announcement.content.replace(/\s+/g, ' ').slice(0, 80);

    await this.notificationsService.createMany(
      followers.map((follower) => ({
        userId: follower.userId,
        type: NotificationType.UPDATE,
        title: `《${novel.title}》发布了公告`,
        content: `${announcement.title}：${preview}`,
        link: `/novels/${novel.id}`,
      })),
      tx,
    );
  }
}
