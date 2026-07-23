import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { Request } from 'express';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload, RequestUser } from './auth.types';

interface AuthenticatedRequest extends Request {
  user?: RequestUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('请先登录');
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.get<string>('JWT_SECRET') ?? 'dev_secret',
      });
    } catch {
      throw new UnauthorizedException('登录状态已失效');
    }

    if (!payload.sid) {
      throw new UnauthorizedException('登录状态已失效');
    }

    const [user, session] = await Promise.all([
      this.usersService.findById(payload.sub),
      this.prisma.authSession.findFirst({
        where: {
          id: payload.sid,
          userId: payload.sub,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      }),
    ]);
    if (!user) {
      throw new UnauthorizedException('登录状态已失效');
    }
    if (user.deletedAt) {
      throw new UnauthorizedException('账号已注销');
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException(
        user.suspensionReason ? `账号已被封禁：${user.suspensionReason}` : '账号已被封禁',
      );
    }
    if (!session) {
      throw new UnauthorizedException('设备会话已失效');
    }

    request.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      sessionId: session.id,
    };
    return true;
  }

  private extractToken(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    const [type, token] = authHeader?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
