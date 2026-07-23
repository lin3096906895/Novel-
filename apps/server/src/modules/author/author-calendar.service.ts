import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { RequestUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AuthorCalendarQueryDto } from './dto/author-calendar-query.dto';
import { CreateAuthorCalendarEventDto } from './dto/create-author-calendar-event.dto';
import { UpdateAuthorCalendarEventDto } from './dto/update-author-calendar-event.dto';

@Injectable()
export class AuthorCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async getMonth(user: RequestUser, query: AuthorCalendarQueryDto) {
    const { start, end } = this.monthRange(query.month);
    if (query.novelId) {
      await this.ensureNovelOwnership(user, query.novelId);
    }

    const novelWhere: Prisma.NovelWhereInput = query.novelId
      ? { id: query.novelId }
      : user.role === UserRole.ADMIN
        ? {}
        : { authorId: user.id };

    const [plans, chapters] = await this.prisma.$transaction([
      this.prisma.authorCalendarEvent.findMany({
        where: {
          eventAt: { gte: start, lt: end },
          novel: novelWhere,
        },
        orderBy: { eventAt: 'asc' },
        include: { novel: { select: { id: true, title: true } } },
      }),
      this.prisma.chapter.findMany({
        where: {
          novel: novelWhere,
          deletedAt: null,
          OR: [{ scheduledAt: { gte: start, lt: end } }, { publishedAt: { gte: start, lt: end } }],
        },
        orderBy: { orderIndex: 'asc' },
        select: {
          id: true,
          title: true,
          status: true,
          scheduledAt: true,
          publishedAt: true,
          novel: { select: { id: true, title: true } },
        },
      }),
    ]);

    const events = [
      ...plans.map((plan) => ({
        id: plan.id,
        source: 'PLAN' as const,
        type: plan.type,
        title: plan.title,
        note: plan.note,
        eventAt: plan.eventAt,
        isCompleted: plan.isCompleted,
        editable: true,
        novel: plan.novel,
      })),
      ...chapters.flatMap((chapter) => {
        const chapterEvents = [];
        if (chapter.scheduledAt && chapter.scheduledAt >= start && chapter.scheduledAt < end) {
          chapterEvents.push({
            id: `scheduled:${chapter.id}`,
            source: 'CHAPTER_SCHEDULED' as const,
            type: 'CHAPTER',
            title: `计划发布：${chapter.title}`,
            note: null,
            eventAt: chapter.scheduledAt,
            isCompleted: chapter.status === 'PUBLISHED',
            editable: false,
            chapterId: chapter.id,
            novel: chapter.novel,
          });
        }
        if (chapter.publishedAt && chapter.publishedAt >= start && chapter.publishedAt < end) {
          chapterEvents.push({
            id: `published:${chapter.id}`,
            source: 'CHAPTER_PUBLISHED' as const,
            type: 'CHAPTER',
            title: `已发布：${chapter.title}`,
            note: null,
            eventAt: chapter.publishedAt,
            isCompleted: true,
            editable: false,
            chapterId: chapter.id,
            novel: chapter.novel,
          });
        }
        return chapterEvents;
      }),
    ].sort((left, right) => left.eventAt.getTime() - right.eventAt.getTime());

    return {
      month: query.month,
      summary: {
        plans: plans.length,
        completedPlans: plans.filter((plan) => plan.isCompleted).length,
        scheduledChapters: events.filter((event) => event.source === 'CHAPTER_SCHEDULED').length,
        publishedChapters: events.filter((event) => event.source === 'CHAPTER_PUBLISHED').length,
      },
      events,
    };
  }

  async create(user: RequestUser, novelId: string, dto: CreateAuthorCalendarEventDto) {
    await this.ensureNovelOwnership(user, novelId);
    return this.prisma.authorCalendarEvent.create({
      data: {
        novelId,
        title: dto.title.trim(),
        note: dto.note?.trim() || null,
        eventAt: new Date(dto.eventAt),
        type: dto.type,
      },
      include: { novel: { select: { id: true, title: true } } },
    });
  }

  async update(user: RequestUser, eventId: string, dto: UpdateAuthorCalendarEventDto) {
    const event = await this.prisma.authorCalendarEvent.findUnique({
      where: { id: eventId },
      include: { novel: { select: { authorId: true } } },
    });
    if (!event) {
      throw new NotFoundException('创作计划不存在');
    }
    this.ensureOwnership(user, event.novel.authorId);

    return this.prisma.authorCalendarEvent.update({
      where: { id: eventId },
      data: {
        title: dto.title?.trim(),
        note: dto.note === undefined ? undefined : dto.note.trim() || null,
        eventAt: dto.eventAt ? new Date(dto.eventAt) : undefined,
        type: dto.type,
        isCompleted: dto.isCompleted,
      },
      include: { novel: { select: { id: true, title: true } } },
    });
  }

  async delete(user: RequestUser, eventId: string) {
    const event = await this.prisma.authorCalendarEvent.findUnique({
      where: { id: eventId },
      include: { novel: { select: { authorId: true } } },
    });
    if (!event) {
      throw new NotFoundException('创作计划不存在');
    }
    this.ensureOwnership(user, event.novel.authorId);
    await this.prisma.authorCalendarEvent.delete({ where: { id: eventId } });
    return { deletedId: eventId };
  }

  private async ensureNovelOwnership(user: RequestUser, novelId: string) {
    const novel = await this.prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true, authorId: true },
    });
    if (!novel) {
      throw new NotFoundException('作品不存在');
    }
    this.ensureOwnership(user, novel.authorId);
    return novel;
  }

  private ensureOwnership(user: RequestUser, authorId: string) {
    if (authorId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('只能管理自己的创作计划');
    }
  }

  private monthRange(month: string) {
    const [year, monthNumber] = month.split('-').map(Number);
    const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
    const nextYear = monthNumber === 12 ? year + 1 : year;
    const start = new Date(`${year}-${String(monthNumber).padStart(2, '0')}-01T00:00:00+08:00`);
    const end = new Date(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+08:00`);
    return { start, end };
  }
}
