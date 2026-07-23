import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { RequestUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ListNotificationsDto } from './dto/list-notifications.dto';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: RequestUser, query: ListNotificationsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.NotificationWhereInput = {
      userId: user.id,
      ...(query.unreadOnly ? { isRead: false } : {}),
      ...(query.type ? { type: query.type } : {}),
    };

    const [items, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId: user.id, isRead: false } }),
    ]);

    return {
      items,
      unreadCount,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async markRead(user: RequestUser, notificationId: string) {
    const updated = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId: user.id },
      data: { isRead: true },
    });

    if (updated.count === 0) {
      throw new NotFoundException('通知不存在');
    }

    return { id: notificationId, isRead: true };
  }

  async markAllRead(user: RequestUser) {
    const updated = await this.prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true },
    });

    return { updatedCount: updated.count };
  }

  create(
    data: {
      userId: string;
      type: NotificationType;
      title: string;
      content: string;
      link?: string;
    },
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    return client.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        content: data.content,
        link: data.link,
      },
    });
  }

  createMany(
    data: Array<{
      userId: string;
      type: NotificationType;
      title: string;
      content: string;
      link?: string;
    }>,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    if (data.length === 0) {
      return Promise.resolve({ count: 0 });
    }

    return client.notification.createMany({ data });
  }
}
