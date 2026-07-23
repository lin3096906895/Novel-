import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async create(data: {
    email: string;
    nickname: string;
    passwordHash: string;
    emailVerifiedAt: Date;
    role?: UserRole;
  }, client: Prisma.TransactionClient | PrismaService = this.prisma) {
    try {
      return await client.user.create({
        data: {
          email: data.email,
          nickname: data.nickname,
          passwordHash: data.passwordHash,
          emailVerifiedAt: data.emailVerifiedAt,
          role: data.role ?? UserRole.READER,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('该邮箱已注册');
      }
      throw error;
    }
  }

  updateProfile(userId: string, nickname: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { nickname: nickname.trim() },
    });
  }
}
