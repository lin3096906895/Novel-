import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { NovelStatus, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from './auth.types';
import { CancelAccountDeletionDto, RequestAccountDeletionDto } from './dto/account-deletion.dto';
import { TwoFactorService } from './two-factor.service';

const deletionGracePeriodMs = 7 * 24 * 60 * 60 * 1000;
const privateNovelStatuses = [
  NovelStatus.DRAFT,
  NovelStatus.REVIEWING,
  NovelStatus.REJECTED,
  NovelStatus.HIDDEN,
];

@Injectable()
export class AccountDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  async status(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        deletionRequestedAt: true,
        deletionScheduledAt: true,
        deletionReason: true,
        deletedAt: true,
      },
    });
    if (!user || user.deletedAt) {
      throw new UnauthorizedException('账号不存在或已注销');
    }
    return this.formatStatus(user);
  }

  async request(user: RequestUser, dto: RequestAccountDeletionDto) {
    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        role: true,
        deletionRequestedAt: true,
        deletionScheduledAt: true,
        deletionReason: true,
        deletedAt: true,
      },
    });
    if (!account || account.deletedAt) {
      throw new UnauthorizedException('账号不存在或已注销');
    }
    if (account.role === UserRole.ADMIN) {
      throw new ForbiddenException('管理员账号不能通过用户端自助注销');
    }

    await this.twoFactorService.verifySensitiveAction(user, dto.currentPassword, dto.code);
    if (account.deletionScheduledAt) {
      return { ...this.formatStatus(account), revokedSessions: 0 };
    }

    const now = new Date();
    const deletionScheduledAt = new Date(now.getTime() + deletionGracePeriodMs);
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: {
          deletionRequestedAt: now,
          deletionScheduledAt,
          deletionReason: dto.reason?.trim() || null,
        },
        select: {
          deletionRequestedAt: true,
          deletionScheduledAt: true,
          deletionReason: true,
          deletedAt: true,
        },
      });
      const revoked = await tx.authSession.updateMany({
        where: { userId: user.id, id: { not: user.sessionId }, revokedAt: null },
        data: { revokedAt: now },
      });
      return { updated, revokedSessions: revoked.count };
    });

    return { ...this.formatStatus(result.updated), revokedSessions: result.revokedSessions };
  }

  async cancel(user: RequestUser, dto: CancelAccountDeletionDto) {
    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { deletionScheduledAt: true, deletedAt: true },
    });
    if (!account || account.deletedAt) {
      throw new UnauthorizedException('账号不存在或已注销');
    }
    if (!account.deletionScheduledAt) {
      throw new BadRequestException('当前账号没有待执行的注销申请');
    }

    await this.twoFactorService.verifySensitiveAction(user, dto.currentPassword, dto.code);
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        deletionRequestedAt: null,
        deletionScheduledAt: null,
        deletionReason: null,
      },
      select: {
        deletionRequestedAt: true,
        deletionScheduledAt: true,
        deletionReason: true,
        deletedAt: true,
      },
    });
    return this.formatStatus(updated);
  }

  async processDueAccounts(limit = 20) {
    const dueAccounts = await this.prisma.user.findMany({
      where: {
        deletionScheduledAt: { lte: new Date() },
        deletedAt: null,
      },
      orderBy: { deletionScheduledAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    const completed: string[] = [];
    for (const account of dueAccounts) {
      if (await this.finalizeAccount(account.id)) {
        completed.push(account.id);
      }
    }
    return completed;
  }

  private async finalizeAccount(userId: string) {
    const now = new Date();
    const account = await this.prisma.user.findFirst({
      where: {
        id: userId,
        deletionScheduledAt: { lte: now },
        deletedAt: null,
      },
      select: {
        id: true,
        email: true,
        role: true,
        novels: {
          where: { status: { in: privateNovelStatuses } },
          select: { id: true, chapters: { select: { id: true } } },
        },
      },
    });
    if (!account) {
      return false;
    }

    const privateNovelIds = account.novels.map((novel) => novel.id);
    const privateChapterIds = account.novels.flatMap((novel) =>
      novel.chapters.map((chapter) => chapter.id),
    );
    const passwordHash = await hash(randomBytes(32).toString('base64url'), 12);

    await this.prisma.$transaction(
      async (tx) => {
        if (privateNovelIds.length > 0) {
          await tx.readingHistory.deleteMany({ where: { novelId: { in: privateNovelIds } } });
          await tx.bookshelfItem.deleteMany({ where: { novelId: { in: privateNovelIds } } });
          await tx.comment.deleteMany({ where: { novelId: { in: privateNovelIds } } });
          await tx.recommendItem.deleteMany({ where: { novelId: { in: privateNovelIds } } });
          await tx.reviewLog.deleteMany({
            where: {
              OR: [
                { targetType: 'novel', targetId: { in: privateNovelIds } },
                { targetType: 'chapter', targetId: { in: privateChapterIds } },
              ],
            },
          });
          await tx.chapter.deleteMany({ where: { novelId: { in: privateNovelIds } } });
          await tx.novel.deleteMany({ where: { id: { in: privateNovelIds } } });
        }

        await tx.bookshelfItem.deleteMany({ where: { userId } });
        await tx.readingHistory.deleteMany({ where: { userId } });
        await tx.chapterRead.deleteMany({ where: { userId } });
        await tx.readingPreference.deleteMany({ where: { userId } });
        await tx.chapterBookmark.deleteMany({ where: { userId } });
        await tx.readingAnnotation.deleteMany({ where: { userId } });
        await tx.paragraphCommentLike.deleteMany({ where: { userId } });
        await tx.paragraphCommentReport.deleteMany({ where: { reporterId: userId } });
        await tx.commentLike.deleteMany({ where: { userId } });
        await tx.commentReport.deleteMany({ where: { reporterId: userId } });
        await tx.novelRating.deleteMany({ where: { userId } });
        await tx.notification.deleteMany({ where: { userId } });
        await tx.searchHistory.deleteMany({ where: { userId } });
        await tx.authorFollow.deleteMany({
          where: { OR: [{ followerId: userId }, { authorId: userId }] },
        });
        await tx.authorApplication.deleteMany({ where: { userId } });
        await tx.passwordResetCode.deleteMany({ where: { userId } });
        await tx.emailVerificationCode.deleteMany({
          where: { OR: [{ userId }, { email: account.email }] },
        });
        await tx.twoFactorLoginChallenge.deleteMany({ where: { userId } });
        await tx.twoFactorCredential.deleteMany({ where: { userId } });
        await tx.authSession.deleteMany({ where: { userId } });
        await tx.loginActivity.deleteMany({ where: { userId } });
        await tx.commentReport.updateMany({
          where: { commentAuthorId: userId },
          data: { commentAuthorNickname: '已注销用户', commentAuthorEmail: '' },
        });
        await tx.authorProfile.updateMany({
          where: { userId },
          data: { penName: '已注销作者', bio: null },
        });
        await tx.user.update({
          where: { id: userId },
          data: {
            email: `deleted-${userId}@deleted.local`,
            nickname: '已注销用户',
            passwordHash,
            emailVerifiedAt: null,
            suspendedAt: null,
            suspensionReason: null,
            deletionRequestedAt: null,
            deletionScheduledAt: null,
            deletionReason: null,
            deletedAt: now,
          },
        });
      },
      { timeout: 30_000 },
    );
    return true;
  }

  private formatStatus(user: {
    deletionRequestedAt: Date | null;
    deletionScheduledAt: Date | null;
    deletionReason?: string | null;
    deletedAt: Date | null;
  }) {
    const remainingMs = user.deletionScheduledAt
      ? Math.max(0, user.deletionScheduledAt.getTime() - Date.now())
      : 0;
    return {
      pending: Boolean(user.deletionScheduledAt && !user.deletedAt),
      requestedAt: user.deletionRequestedAt,
      scheduledAt: user.deletionScheduledAt,
      reason: user.deletionReason ?? null,
      daysRemaining: user.deletionScheduledAt
        ? Math.max(1, Math.ceil(remainingMs / (24 * 60 * 60 * 1000)))
        : 0,
    };
  }
}
