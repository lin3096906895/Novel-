import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthorApplicationStatus, NovelStatus, Prisma, UserRole, UserStatus } from '@prisma/client';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { RequestUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ListAdminNovelsDto } from './dto/list-admin-novels.dto';
import { ListAdminUsersDto } from './dto/list-admin-users.dto';
import { ListAuthorApplicationsDto } from './dto/list-author-applications.dto';
import { ReviewAuthorApplicationDto } from './dto/review-author-application.dto';
import { UpdateNovelStatusDto } from './dto/update-novel-status.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

@Injectable()
export class AdminManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AdminAuditService,
  ) {}

  async listNovels(query: ListAdminNovelsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.NovelWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [
              { title: { contains: query.keyword, mode: 'insensitive' } },
              { summary: { contains: query.keyword, mode: 'insensitive' } },
              { author: { nickname: { contains: query.keyword, mode: 'insensitive' } } },
              { author: { email: { contains: query.keyword, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.NovelOrderByWithRelationInput[] =
      query.sort === 'popular'
        ? [{ bookshelf: { _count: 'desc' } }, { comments: { _count: 'desc' } }]
        : [{ updatedAt: 'desc' }];

    const [items, total] = await this.prisma.$transaction([
      this.prisma.novel.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy,
        include: {
          author: { select: { id: true, nickname: true, email: true, role: true } },
          category: true,
          tags: true,
          _count: {
            select: {
              bookshelf: true,
              chapters: { where: { deletedAt: null } },
              comments: true,
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

  async getNovel(novelId: string) {
    const novel = await this.prisma.novel.findUnique({
      where: { id: novelId },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            email: true,
            role: true,
            authorProfile: true,
          },
        },
        category: true,
        tags: true,
        chapters: {
          where: { deletedAt: null },
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            title: true,
            status: true,
            orderIndex: true,
            wordCount: true,
            publishedAt: true,
            updatedAt: true,
          },
        },
        comments: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            content: true,
            createdAt: true,
            user: { select: { id: true, nickname: true, email: true, role: true } },
          },
        },
        _count: {
          select: {
            bookshelf: true,
            chapters: { where: { deletedAt: null } },
            comments: true,
            histories: true,
          },
        },
      },
    });

    if (!novel) {
      throw new NotFoundException('作品不存在');
    }

    const reviewLogs = await this.prisma.reviewLog.findMany({
      where: { targetType: 'novel', targetId: novelId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { reviewer: { select: { id: true, nickname: true, email: true } } },
    });

    return {
      ...novel,
      reviewLogs,
    };
  }

  async updateNovelStatus(actor: RequestUser, novelId: string, dto: UpdateNovelStatusDto) {
    const novel = await this.prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true, title: true, status: true },
    });

    if (!novel) {
      throw new NotFoundException('作品不存在');
    }

    const nextStatus = NovelStatus[dto.status];

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.novel.update({
        where: { id: novelId },
        data: { status: nextStatus },
        include: {
          author: { select: { id: true, nickname: true, email: true, role: true } },
          category: true,
          tags: true,
          _count: {
            select: {
              bookshelf: true,
              chapters: { where: { deletedAt: null } },
              comments: true,
            },
          },
        },
      });

      await this.auditService.record(
        {
          actorId: actor.id,
          action: 'novel.status.update',
          targetType: 'novel',
          targetId: novelId,
          summary: `将作品《${novel.title}》的状态从 ${novel.status} 调整为 ${nextStatus}`,
          before: { status: novel.status },
          after: { status: nextStatus },
        },
        tx,
      );

      return updated;
    });
  }

  async listUsers(query: ListAdminUsersDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: [
              { nickname: { contains: query.keyword, mode: 'insensitive' } },
              { email: { contains: query.keyword, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          nickname: true,
          role: true,
          status: true,
          suspendedAt: true,
          suspensionReason: true,
          createdAt: true,
          _count: {
            select: {
              bookshelfItems: true,
              comments: true,
              novels: true,
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
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

  async listAuthorApplications(query: ListAuthorApplicationsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.AuthorApplicationWhereInput = query.status ? { status: query.status } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.authorApplication.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
        include: {
          user: {
            select: {
              id: true,
              email: true,
              nickname: true,
              role: true,
              status: true,
              createdAt: true,
              _count: { select: { comments: true, bookshelfItems: true } },
            },
          },
          reviewedBy: { select: { id: true, nickname: true } },
        },
      }),
      this.prisma.authorApplication.count({ where }),
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

  async reviewAuthorApplication(
    actor: RequestUser,
    applicationId: string,
    dto: ReviewAuthorApplicationDto,
  ) {
    const application = await this.prisma.authorApplication.findUnique({
      where: { id: applicationId },
      include: { user: true },
    });
    if (!application) {
      throw new NotFoundException('作者申请不存在');
    }
    if (application.status !== AuthorApplicationStatus.PENDING) {
      throw new BadRequestException('该申请已经处理');
    }
    if (dto.action === 'approve' && application.user.status === UserStatus.SUSPENDED) {
      throw new BadRequestException('被封禁账号不能通过作者申请');
    }
    const reason = dto.reason?.trim();
    if (dto.action === 'reject' && !reason) {
      throw new BadRequestException('驳回作者申请时必须填写原因');
    }

    const nextStatus =
      dto.action === 'approve'
        ? AuthorApplicationStatus.APPROVED
        : AuthorApplicationStatus.REJECTED;
    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      if (dto.action === 'approve') {
        if (application.user.role === UserRole.READER) {
          await tx.user.update({
            where: { id: application.userId },
            data: { role: UserRole.AUTHOR },
          });
        }
        await tx.authorProfile.upsert({
          where: { userId: application.userId },
          update: {
            penName: application.penName,
            bio: application.bio,
          },
          create: {
            userId: application.userId,
            penName: application.penName,
            bio: application.bio,
          },
        });
      }

      const updated = await tx.authorApplication.update({
        where: { id: applicationId },
        data: {
          status: nextStatus,
          reviewReason: dto.action === 'reject' ? reason : null,
          reviewedById: actor.id,
          reviewedAt: now,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              nickname: true,
              role: true,
              status: true,
              createdAt: true,
              _count: { select: { comments: true, bookshelfItems: true } },
            },
          },
          reviewedBy: { select: { id: true, nickname: true } },
        },
      });

      await tx.notification.create({
        data: {
          userId: application.userId,
          type: 'REVIEW',
          title: dto.action === 'approve' ? '作者申请已通过' : '作者申请未通过',
          content:
            dto.action === 'approve'
              ? `你的作者申请已通过，笔名为“${application.penName}”。`
              : `你的作者申请未通过：${reason}`,
          link: '/author',
        },
      });

      await this.auditService.record(
        {
          actorId: actor.id,
          action: `author.application.${dto.action}`,
          targetType: 'author-application',
          targetId: application.id,
          summary:
            dto.action === 'approve'
              ? `通过用户 ${application.user.nickname} 的作者申请`
              : `驳回用户 ${application.user.nickname} 的作者申请：${reason}`,
          before: { status: application.status },
          after: { status: nextStatus, reason: reason ?? null },
        },
        tx,
      );

      return updated;
    });
  }

  async getUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nickname: true,
        role: true,
        status: true,
        suspendedAt: true,
        suspensionReason: true,
        createdAt: true,
        updatedAt: true,
        authorProfile: true,
        novels: {
          orderBy: { updatedAt: 'desc' },
          take: 10,
          select: {
            id: true,
            title: true,
            summary: true,
            status: true,
            wordCount: true,
            createdAt: true,
            updatedAt: true,
            author: { select: { id: true, nickname: true, email: true } },
            category: true,
            tags: true,
            _count: {
              select: {
                bookshelf: true,
                chapters: { where: { deletedAt: null } },
                comments: true,
              },
            },
          },
        },
        bookshelfItems: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            createdAt: true,
            novel: {
              select: {
                id: true,
                title: true,
                status: true,
                author: { select: { id: true, nickname: true, email: true } },
              },
            },
          },
        },
        readingHistories: {
          orderBy: { updatedAt: 'desc' },
          take: 10,
          select: {
            id: true,
            progress: true,
            updatedAt: true,
            novel: { select: { id: true, title: true } },
            chapter: { select: { id: true, title: true, orderIndex: true } },
          },
        },
        comments: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            content: true,
            createdAt: true,
            novel: { select: { id: true, title: true } },
          },
        },
        reviewLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            targetType: true,
            targetId: true,
            action: true,
            reason: true,
            createdAt: true,
          },
        },
        _count: {
          select: {
            bookshelfItems: true,
            comments: true,
            novels: true,
            readingHistories: true,
            reviewLogs: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
  }

  async updateUserRole(actor: RequestUser, userId: string, dto: UpdateUserRoleDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, nickname: true, role: true, deletedAt: true },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    if (user.deletedAt) {
      throw new BadRequestException('已注销账号不能调整角色');
    }

    if (actor.id === userId && dto.role !== UserRole.ADMIN) {
      throw new BadRequestException('不能移除自己的管理员权限');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { role: UserRole[dto.role] },
        select: {
          id: true,
          email: true,
          nickname: true,
          role: true,
          status: true,
          suspendedAt: true,
          suspensionReason: true,
          createdAt: true,
          _count: {
            select: {
              bookshelfItems: true,
              comments: true,
              novels: true,
            },
          },
        },
      });

      if (dto.role === UserRole.AUTHOR || dto.role === UserRole.ADMIN) {
        await tx.authorProfile.upsert({
          where: { userId },
          update: { penName: user.nickname },
          create: {
            userId,
            penName: user.nickname,
          },
        });
      }

      await this.auditService.record(
        {
          actorId: actor.id,
          action: 'user.role.update',
          targetType: 'user',
          targetId: userId,
          summary: `将用户 ${user.nickname} 的角色从 ${user.role} 调整为 ${updated.role}`,
          before: { role: user.role },
          after: { role: updated.role },
        },
        tx,
      );

      return updated;
    });
  }

  async updateUserStatus(actor: RequestUser, userId: string, dto: UpdateUserStatusDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nickname: true,
        status: true,
        suspendedAt: true,
        suspensionReason: true,
        deletedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    if (user.deletedAt) {
      throw new BadRequestException('已注销账号不能调整状态');
    }

    const nextStatus = UserStatus[dto.status];
    const reason = dto.reason?.trim();
    if (nextStatus === UserStatus.SUSPENDED && !reason) {
      throw new BadRequestException('封禁用户时必须填写原因');
    }
    if (actor.id === userId && nextStatus === UserStatus.SUSPENDED) {
      throw new BadRequestException('不能封禁当前登录的管理员账号');
    }

    return this.prisma.$transaction(async (tx) => {
      if (nextStatus === UserStatus.SUSPENDED) {
        await tx.authSession.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      const updated = await tx.user.update({
        where: { id: userId },
        data:
          nextStatus === UserStatus.SUSPENDED
            ? {
                status: nextStatus,
                suspendedAt: new Date(),
                suspensionReason: reason,
              }
            : {
                status: nextStatus,
                suspendedAt: null,
                suspensionReason: null,
              },
        select: {
          id: true,
          email: true,
          nickname: true,
          role: true,
          status: true,
          suspendedAt: true,
          suspensionReason: true,
          createdAt: true,
          _count: {
            select: {
              bookshelfItems: true,
              comments: true,
              novels: true,
            },
          },
        },
      });

      await this.auditService.record(
        {
          actorId: actor.id,
          action: 'user.status.update',
          targetType: 'user',
          targetId: userId,
          summary:
            nextStatus === UserStatus.SUSPENDED
              ? `封禁用户 ${user.nickname}：${reason}`
              : `解除用户 ${user.nickname} 的封禁`,
          before: {
            status: user.status,
            suspendedAt: user.suspendedAt,
            suspensionReason: user.suspensionReason,
          },
          after: {
            status: updated.status,
            suspendedAt: updated.suspendedAt,
            suspensionReason: updated.suspensionReason,
          },
        },
        tx,
      );

      return updated;
    });
  }
}
