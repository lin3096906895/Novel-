import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthorApplicationStatus, UserRole } from '@prisma/client';
import { RequestUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitAuthorApplicationDto } from './dto/submit-author-application.dto';
import { UpdateAuthorProfileDto } from './dto/update-author-profile.dto';

@Injectable()
export class AuthorOnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(user: RequestUser) {
    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        role: true,
        emailVerifiedAt: true,
        authorProfile: true,
        authorApplication: {
          include: {
            reviewedBy: { select: { id: true, nickname: true } },
          },
        },
      },
    });
    if (!account) {
      throw new NotFoundException('用户不存在');
    }

    return {
      canWrite: account.role === UserRole.AUTHOR || account.role === UserRole.ADMIN,
      emailVerified: Boolean(account.emailVerifiedAt),
      profile: account.authorProfile,
      application: account.authorApplication,
    };
  }

  async submit(user: RequestUser, dto: SubmitAuthorApplicationDto) {
    const account = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: {
        role: true,
        emailVerifiedAt: true,
        authorApplication: { select: { status: true } },
      },
    });
    if (!account) {
      throw new NotFoundException('用户不存在');
    }
    if (account.role === UserRole.AUTHOR || account.role === UserRole.ADMIN) {
      throw new BadRequestException('当前账号已经拥有作者权限');
    }
    if (!account.emailVerifiedAt) {
      throw new BadRequestException('请先完成邮箱验证');
    }
    if (account.authorApplication?.status === AuthorApplicationStatus.PENDING) {
      throw new BadRequestException('作者申请正在审核中');
    }

    return this.prisma.authorApplication.upsert({
      where: { userId: user.id },
      update: {
        penName: dto.penName.trim(),
        bio: dto.bio?.trim() || null,
        statement: dto.statement.trim(),
        status: AuthorApplicationStatus.PENDING,
        reviewReason: null,
        reviewedById: null,
        reviewedAt: null,
      },
      create: {
        userId: user.id,
        penName: dto.penName.trim(),
        bio: dto.bio?.trim() || null,
        statement: dto.statement.trim(),
      },
      include: {
        reviewedBy: { select: { id: true, nickname: true } },
      },
    });
  }

  async updateProfile(user: RequestUser, dto: UpdateAuthorProfileDto) {
    if (user.role !== UserRole.AUTHOR && user.role !== UserRole.ADMIN) {
      throw new BadRequestException('当前账号还不是作者');
    }

    return this.prisma.authorProfile.upsert({
      where: { userId: user.id },
      update: {
        penName: dto.penName.trim(),
        bio: dto.bio?.trim() || null,
      },
      create: {
        userId: user.id,
        penName: dto.penName.trim(),
        bio: dto.bio?.trim() || null,
      },
    });
  }
}
