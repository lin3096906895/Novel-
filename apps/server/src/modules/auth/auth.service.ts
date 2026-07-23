import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  EmailVerificationPurpose,
  LoginActivityStatus,
  LoginRiskLevel,
  UserStatus,
} from '@prisma/client';
import { compare, hash } from 'bcryptjs';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { toUserResponse } from '../users/user-response';
import { AuthMailService } from './auth-mail.service';
import { JwtPayload, RequestUser, SessionMetadata } from './auth.types';
import { ChangeEmailDto } from './dto/change-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { ListLoginActivitiesDto } from './dto/list-login-activities.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestEmailChangeCodeDto } from './dto/request-email-change-code.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { RequestRegistrationCodeDto } from './dto/request-registration-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { VerifyTwoFactorLoginDto } from './dto/two-factor.dto';
import { TwoFactorService } from './two-factor.service';

const accessTokenTtlSeconds = 30 * 60;
const refreshTokenTtlMs = 30 * 24 * 60 * 60 * 1000;
const maxActiveSessions = 10;
const passwordResetCodeTtlMs = 10 * 60 * 1000;
const passwordResetCooldownSeconds = 60;
const maxPasswordResetAttempts = 5;
const emailVerificationCodeTtlMs = 10 * 60 * 1000;
const emailVerificationCooldownSeconds = 60;
const maxEmailVerificationAttempts = 5;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly authMail: AuthMailService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  async register(dto: RegisterDto, metadata: SessionMetadata = {}) {
    const email = dto.email.trim().toLowerCase();
    const verification = await this.verifyEmailVerificationCode(
      email,
      EmailVerificationPurpose.REGISTER,
      dto.verificationCode,
    );
    const passwordHash = await hash(dto.password, 12);
    const nickname = dto.nickname?.trim() || email.split('@')[0];
    const verifiedAt = new Date();
    const user = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.emailVerificationCode.updateMany({
        where: {
          id: verification.id,
          codeHash: verification.codeHash,
          consumedAt: null,
          expiresAt: { gt: verifiedAt },
          attemptCount: { lt: maxEmailVerificationAttempts },
        },
        data: { consumedAt: verifiedAt },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException('邮箱验证码无效或已过期');
      }
      return this.usersService.create(
        { email, nickname, passwordHash, emailVerifiedAt: verifiedAt },
        tx,
      );
    });

    return this.createLoginSession(user, metadata);
  }

  async requestRegistrationCode(dto: RequestRegistrationCodeDto, metadata: SessionMetadata = {}) {
    const email = dto.email.trim().toLowerCase();
    if (await this.usersService.findByEmail(email)) {
      throw new ConflictException('该邮箱已注册');
    }
    return this.issueEmailVerificationCode(
      email,
      EmailVerificationPurpose.REGISTER,
      undefined,
      metadata,
    );
  }

  async login(dto: LoginDto, metadata: SessionMetadata = {}) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      await this.recordLoginActivity({
        email,
        metadata,
        status: LoginActivityStatus.FAILURE,
        riskLevel: LoginRiskLevel.NOTICE,
        failureReason: 'UNKNOWN_ACCOUNT',
      });
      throw new UnauthorizedException('邮箱或密码错误');
    }

    const isPasswordValid = await compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      await this.recordLoginActivity({
        userId: user.id,
        email,
        metadata,
        status: LoginActivityStatus.FAILURE,
        riskLevel: LoginRiskLevel.NOTICE,
        failureReason: 'INVALID_PASSWORD',
      });
      throw new UnauthorizedException('邮箱或密码错误');
    }
    if (user.status === UserStatus.SUSPENDED) {
      await this.recordLoginActivity({
        userId: user.id,
        email,
        metadata,
        status: LoginActivityStatus.FAILURE,
        riskLevel: LoginRiskLevel.HIGH,
        failureReason: 'SUSPENDED_ACCOUNT',
      });
    }
    this.ensureUserActive(user);

    const challenge = await this.twoFactorService.createLoginChallenge(user, metadata);
    if (challenge) {
      return challenge;
    }

    const response = await this.createLoginSession(user, metadata);
    await this.recordLoginActivity({
      userId: user.id,
      email,
      metadata,
      status: LoginActivityStatus.SUCCESS,
      riskLevel: LoginRiskLevel.NORMAL,
      sessionId: response.sessionId,
    });
    return response;
  }

  async completeTwoFactorLogin(dto: VerifyTwoFactorLoginDto) {
    const verified = await this.twoFactorService.verifyLoginChallenge(dto.challengeToken, dto.code);
    this.ensureUserActive(verified.user);
    const response = await this.createLoginSession(verified.user, verified.metadata);
    await this.recordLoginActivity({
      userId: verified.user.id,
      email: verified.user.email,
      metadata: verified.metadata,
      status: LoginActivityStatus.SUCCESS,
      riskLevel: LoginRiskLevel.NORMAL,
      sessionId: response.sessionId,
    });
    return { ...response, usedRecoveryCode: verified.usedRecoveryCode };
  }

  async refresh(dto: RefreshTokenDto) {
    const tokenHash = this.hashRefreshToken(dto.refreshToken);
    const session = await this.prisma.authSession.findUnique({
      where: { refreshTokenHash: tokenHash },
      include: { user: true },
    });
    const now = new Date();

    if (!session || session.revokedAt || session.expiresAt <= now) {
      throw new UnauthorizedException('刷新令牌已失效');
    }
    if (session.user.status === UserStatus.SUSPENDED || session.user.deletedAt) {
      await this.prisma.authSession.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      this.ensureUserActive(session.user);
    }

    const refreshToken = this.generateRefreshToken();
    const nextHash = this.hashRefreshToken(refreshToken);
    const updated = await this.prisma.authSession.updateMany({
      where: {
        id: session.id,
        refreshTokenHash: tokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        refreshTokenHash: nextHash,
        expiresAt: new Date(now.getTime() + refreshTokenTtlMs),
        lastUsedAt: now,
      },
    });
    if (updated.count !== 1) {
      throw new UnauthorizedException('刷新令牌已被使用');
    }

    return this.buildAuthResponse(session.user, session.id, refreshToken);
  }

  async logout(user: RequestUser) {
    const revoked = await this.prisma.authSession.updateMany({
      where: { id: user.sessionId, userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: revoked.count > 0 };
  }

  async getProfile(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }
    this.ensureUserActive(user);

    return toUserResponse(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.usersService.updateProfile(userId, dto.nickname);
    return toUserResponse(user);
  }

  async changePassword(user: RequestUser, dto: ChangePasswordDto) {
    const account = await this.usersService.findById(user.id);
    if (!account) {
      throw new UnauthorizedException('用户不存在');
    }
    if (!(await compare(dto.currentPassword, account.passwordHash))) {
      throw new BadRequestException('当前密码错误');
    }
    if (await compare(dto.newPassword, account.passwordHash)) {
      throw new BadRequestException('新密码不能与当前密码相同');
    }

    const passwordHash = await hash(dto.newPassword, 12);
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });
      return tx.authSession.updateMany({
        where: {
          userId: user.id,
          id: { not: user.sessionId },
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    });

    return { changed: true, revokedSessions: result.count };
  }

  async requestPasswordReset(dto: RequestPasswordResetDto, metadata: SessionMetadata = {}) {
    const email = dto.email.trim().toLowerCase();
    const response = {
      accepted: true,
      retryAfterSeconds: passwordResetCooldownSeconds,
    };
    const user = await this.usersService.findByEmail(email);

    if (!user || user.status === UserStatus.SUSPENDED) {
      return response;
    }

    const now = new Date();
    const cooldownStartedAt = new Date(now.getTime() - passwordResetCooldownSeconds * 1000);
    const latestCode = await this.prisma.passwordResetCode.findFirst({
      where: { userId: user.id, createdAt: { gt: cooldownStartedAt } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (latestCode) {
      return response;
    }

    const code = this.generatePasswordResetCode();
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetCode.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: now },
      });
      return tx.passwordResetCode.create({
        data: {
          userId: user.id,
          codeHash: this.hashPasswordResetCode(user.id, code),
          expiresAt: new Date(now.getTime() + passwordResetCodeTtlMs),
          requestedIp: metadata.ipAddress?.slice(0, 100),
          userAgent: metadata.userAgent?.slice(0, 500),
        },
        select: { id: true },
      });
    });

    try {
      await this.authMail.sendPasswordResetCode({
        email,
        code,
        expiresInMinutes: passwordResetCodeTtlMs / 60_000,
      });
    } catch (error) {
      await this.prisma.passwordResetCode.updateMany({
        where: { id: record.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      throw error;
    }

    if (this.configService.get<string>('NODE_ENV') !== 'production') {
      return { ...response, developmentCode: code };
    }
    return response;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.usersService.findByEmail(email);
    const now = new Date();
    const invalidCode = () => new BadRequestException('验证码无效或已过期');

    if (!user || user.status === UserStatus.SUSPENDED) {
      throw invalidCode();
    }

    const resetCode = await this.prisma.passwordResetCode.findFirst({
      where: {
        userId: user.id,
        consumedAt: null,
        expiresAt: { gt: now },
        attemptCount: { lt: maxPasswordResetAttempts },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!resetCode) {
      throw invalidCode();
    }

    const submittedHash = this.hashPasswordResetCode(user.id, dto.code);
    if (!this.secureHashesMatch(resetCode.codeHash, submittedHash)) {
      await this.prisma.passwordResetCode.updateMany({
        where: { id: resetCode.id, consumedAt: null },
        data: {
          attemptCount: { increment: 1 },
          ...(resetCode.attemptCount + 1 >= maxPasswordResetAttempts ? { consumedAt: now } : {}),
        },
      });
      throw invalidCode();
    }

    if (await compare(dto.newPassword, user.passwordHash)) {
      throw new BadRequestException('新密码不能与当前密码相同');
    }

    const passwordHash = await hash(dto.newPassword, 12);
    const result = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetCode.updateMany({
        where: {
          id: resetCode.id,
          codeHash: resetCode.codeHash,
          consumedAt: null,
          expiresAt: { gt: now },
          attemptCount: { lt: maxPasswordResetAttempts },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        throw invalidCode();
      }

      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });
      await tx.passwordResetCode.updateMany({
        where: { userId: user.id, id: { not: resetCode.id }, consumedAt: null },
        data: { consumedAt: now },
      });
      return tx.authSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: now },
      });
    });

    return { reset: true, revokedSessions: result.count };
  }

  async requestEmailChangeCode(
    user: RequestUser,
    dto: RequestEmailChangeCodeDto,
    metadata: SessionMetadata = {},
  ) {
    const email = dto.email.trim().toLowerCase();
    const account = await this.usersService.findById(user.id);
    if (!account) {
      throw new UnauthorizedException('用户不存在');
    }
    if (email === account.email) {
      throw new BadRequestException('新邮箱不能与当前邮箱相同');
    }
    if (await this.usersService.findByEmail(email)) {
      throw new ConflictException('该邮箱已被使用');
    }
    return this.issueEmailVerificationCode(
      email,
      EmailVerificationPurpose.CHANGE_EMAIL,
      user.id,
      metadata,
    );
  }

  async changeEmail(user: RequestUser, dto: ChangeEmailDto) {
    const email = dto.email.trim().toLowerCase();
    const account = await this.usersService.findById(user.id);
    if (!account) {
      throw new UnauthorizedException('用户不存在');
    }
    if (!(await compare(dto.currentPassword, account.passwordHash))) {
      throw new BadRequestException('当前密码错误');
    }
    if (email === account.email) {
      throw new BadRequestException('新邮箱不能与当前邮箱相同');
    }
    const owner = await this.usersService.findByEmail(email);
    if (owner && owner.id !== user.id) {
      throw new ConflictException('该邮箱已被使用');
    }

    const verification = await this.verifyEmailVerificationCode(
      email,
      EmailVerificationPurpose.CHANGE_EMAIL,
      dto.code,
      user.id,
    );
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.emailVerificationCode.updateMany({
        where: {
          id: verification.id,
          codeHash: verification.codeHash,
          userId: user.id,
          consumedAt: null,
          expiresAt: { gt: now },
          attemptCount: { lt: maxEmailVerificationAttempts },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException('邮箱验证码无效或已过期');
      }

      const updated = await tx.user.update({
        where: { id: user.id },
        data: { email, emailVerifiedAt: now },
      });
      await tx.emailVerificationCode.updateMany({
        where: { userId: user.id, id: { not: verification.id }, consumedAt: null },
        data: { consumedAt: now },
      });
      await tx.passwordResetCode.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: now },
      });
      const revoked = await tx.authSession.updateMany({
        where: { userId: user.id, id: { not: user.sessionId }, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.notification.create({
        data: {
          userId: user.id,
          type: 'SYSTEM',
          title: '登录邮箱已修改',
          content: `登录邮箱已修改为 ${email}，其他设备已退出登录。`,
          link: '/settings',
        },
      });
      return { updated, revokedSessions: revoked.count };
    });

    return {
      user: toUserResponse(result.updated),
      revokedSessions: result.revokedSessions,
    };
  }

  async listSessions(user: RequestUser) {
    const sessions = await this.prisma.authSession.findMany({
      where: {
        userId: user.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        deviceName: true,
        ipAddress: true,
        lastUsedAt: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    return sessions.map((session) => ({
      ...session,
      isCurrent: session.id === user.sessionId,
    }));
  }

  async listLoginActivities(user: RequestUser, query: ListLoginActivitiesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where = { userId: user.id };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.loginActivity.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { occurredAt: 'desc' },
        select: {
          id: true,
          status: true,
          riskLevel: true,
          failureReason: true,
          sessionId: true,
          deviceName: true,
          userAgent: true,
          ipAddress: true,
          occurredAt: true,
        },
      }),
      this.prisma.loginActivity.count({ where }),
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

  async revokeSession(user: RequestUser, sessionId: string) {
    if (sessionId === user.sessionId) {
      throw new BadRequestException('当前设备请使用退出登录');
    }
    const revoked = await this.prisma.authSession.updateMany({
      where: { id: sessionId, userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count === 0) {
      throw new NotFoundException('设备会话不存在');
    }
    return { revoked: true };
  }

  async revokeOtherSessions(user: RequestUser) {
    const revoked = await this.prisma.authSession.updateMany({
      where: {
        userId: user.id,
        id: { not: user.sessionId },
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
    return { revokedCount: revoked.count };
  }

  private async createLoginSession(
    user: NonNullable<Awaited<ReturnType<UsersService['findById']>>>,
    metadata: SessionMetadata,
  ) {
    this.ensureUserActive(user);
    const refreshToken = this.generateRefreshToken();
    const now = new Date();
    const deviceName = metadata.deviceName?.trim() || this.describeDevice(metadata.userAgent);
    const userAgent = metadata.userAgent?.slice(0, 500);
    let shouldSendNewDeviceAlert = false;
    if (userAgent && !/node|undici/i.test(userAgent)) {
      const [previousSession, knownDevice] = await Promise.all([
        this.prisma.authSession.findFirst({
          where: { userId: user.id },
          select: { id: true },
        }),
        this.prisma.authSession.findFirst({
          where: { userId: user.id, deviceName, userAgent },
          select: { id: true },
        }),
      ]);
      shouldSendNewDeviceAlert = Boolean(previousSession && !knownDevice);
    }
    const session = await this.prisma.authSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: this.hashRefreshToken(refreshToken),
        deviceName,
        userAgent,
        ipAddress: metadata.ipAddress?.slice(0, 100),
        expiresAt: new Date(now.getTime() + refreshTokenTtlMs),
        lastUsedAt: now,
      },
    });

    const activeSessions = await this.prisma.authSession.findMany({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const staleIds = activeSessions.slice(maxActiveSessions).map((item) => item.id);
    if (staleIds.length > 0) {
      await this.prisma.authSession.updateMany({
        where: { id: { in: staleIds } },
        data: { revokedAt: now },
      });
    }

    if (shouldSendNewDeviceAlert) {
      await this.prisma.notification.create({
        data: {
          userId: user.id,
          type: 'SYSTEM',
          title: '新设备登录',
          content: `${deviceName} 刚刚登录了你的账号${metadata.ipAddress ? `，网络地址 ${metadata.ipAddress}` : ''}。`,
          link: '/settings',
        },
      });
      try {
        await this.authMail.sendNewDeviceLoginAlert({
          email: user.email,
          deviceName,
          ipAddress: metadata.ipAddress,
          occurredAt: now,
        });
      } catch (error) {
        console.warn(
          `Failed to send new device login alert: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }

    return this.buildAuthResponse(user, session.id, refreshToken);
  }

  private async recordLoginActivity(input: {
    userId?: string;
    email: string;
    metadata: SessionMetadata;
    status: LoginActivityStatus;
    riskLevel: LoginRiskLevel;
    failureReason?: string;
    sessionId?: string;
  }) {
    const deviceName =
      input.metadata.deviceName?.trim() || this.describeDevice(input.metadata.userAgent);
    try {
      await this.prisma.loginActivity.create({
        data: {
          userId: input.userId,
          email: input.email,
          status: input.status,
          riskLevel: input.riskLevel,
          failureReason: input.failureReason,
          sessionId: input.sessionId,
          deviceName,
          userAgent: input.metadata.userAgent?.slice(0, 500),
          ipAddress: input.metadata.ipAddress?.slice(0, 100),
        },
      });
    } catch (error) {
      console.warn(
        `Failed to record login activity: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  private async buildAuthResponse(
    user: NonNullable<Awaited<ReturnType<UsersService['findById']>>>,
    sessionId: string,
    refreshToken: string,
  ) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sid: sessionId,
    };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_SECRET') ?? 'dev_secret',
      expiresIn: accessTokenTtlSeconds,
    });

    return {
      accessToken,
      refreshToken,
      sessionId,
      tokenType: 'Bearer' as const,
      expiresIn: accessTokenTtlSeconds,
      refreshExpiresIn: Math.floor(refreshTokenTtlMs / 1000),
      user: toUserResponse(user),
    };
  }

  private ensureUserActive(user: {
    status: UserStatus;
    suspensionReason?: string | null;
    deletedAt?: Date | null;
  }) {
    if (user.deletedAt) {
      throw new UnauthorizedException('账号已注销');
    }
    if (user.status === UserStatus.SUSPENDED) {
      throw new UnauthorizedException(
        user.suspensionReason ? `账号已被封禁：${user.suspensionReason}` : '账号已被封禁',
      );
    }
  }

  private generateRefreshToken() {
    return randomBytes(48).toString('base64url');
  }

  private hashRefreshToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private generatePasswordResetCode() {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hashPasswordResetCode(userId: string, code: string) {
    const secret =
      this.configService.get<string>('PASSWORD_RESET_SECRET') ??
      this.configService.get<string>('JWT_SECRET') ??
      'dev_secret';
    return createHmac('sha256', secret).update(`${userId}:${code}`).digest('hex');
  }

  private secureHashesMatch(expected: string, actual: string) {
    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from(actual, 'hex');
    return (
      expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
    );
  }

  private async issueEmailVerificationCode(
    email: string,
    purpose: EmailVerificationPurpose,
    userId: string | undefined,
    metadata: SessionMetadata,
  ) {
    const response = {
      accepted: true,
      retryAfterSeconds: emailVerificationCooldownSeconds,
    };
    const now = new Date();
    const latest = await this.prisma.emailVerificationCode.findFirst({
      where: {
        email,
        purpose,
        userId: userId ?? null,
        createdAt: {
          gt: new Date(now.getTime() - emailVerificationCooldownSeconds * 1000),
        },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (latest) {
      return response;
    }

    const code = this.generatePasswordResetCode();
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationCode.updateMany({
        where: { email, purpose, userId: userId ?? null, consumedAt: null },
        data: { consumedAt: now },
      });
      return tx.emailVerificationCode.create({
        data: {
          email,
          purpose,
          userId,
          codeHash: this.hashEmailVerificationCode(email, purpose, userId, code),
          expiresAt: new Date(now.getTime() + emailVerificationCodeTtlMs),
          requestedIp: metadata.ipAddress?.slice(0, 100),
          userAgent: metadata.userAgent?.slice(0, 500),
        },
        select: { id: true },
      });
    });

    try {
      await this.authMail.sendEmailVerificationCode({
        email,
        code,
        expiresInMinutes: emailVerificationCodeTtlMs / 60_000,
        purpose,
      });
    } catch (error) {
      await this.prisma.emailVerificationCode.updateMany({
        where: { id: record.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      throw error;
    }

    if (this.configService.get<string>('NODE_ENV') !== 'production') {
      return { ...response, developmentCode: code };
    }
    return response;
  }

  private async verifyEmailVerificationCode(
    email: string,
    purpose: EmailVerificationPurpose,
    code: string,
    userId?: string,
  ) {
    const now = new Date();
    const verification = await this.prisma.emailVerificationCode.findFirst({
      where: {
        email,
        purpose,
        userId: userId ?? null,
        consumedAt: null,
        expiresAt: { gt: now },
        attemptCount: { lt: maxEmailVerificationAttempts },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!verification) {
      throw new BadRequestException('邮箱验证码无效或已过期');
    }

    const submittedHash = this.hashEmailVerificationCode(email, purpose, userId, code);
    if (!this.secureHashesMatch(verification.codeHash, submittedHash)) {
      await this.prisma.emailVerificationCode.updateMany({
        where: { id: verification.id, consumedAt: null },
        data: {
          attemptCount: { increment: 1 },
          ...(verification.attemptCount + 1 >= maxEmailVerificationAttempts
            ? { consumedAt: now }
            : {}),
        },
      });
      throw new BadRequestException('邮箱验证码无效或已过期');
    }
    return verification;
  }

  private hashEmailVerificationCode(
    email: string,
    purpose: EmailVerificationPurpose,
    userId: string | undefined,
    code: string,
  ) {
    const secret =
      this.configService.get<string>('EMAIL_VERIFICATION_SECRET') ??
      this.configService.get<string>('JWT_SECRET') ??
      'dev_secret';
    return createHmac('sha256', secret)
      .update(`${purpose}:${email}:${userId ?? ''}:${code}`)
      .digest('hex');
  }

  private describeDevice(userAgent?: string) {
    if (!userAgent) {
      return '未知设备';
    }
    if (/iphone|ipad/i.test(userAgent)) {
      return 'iPhone / iPad';
    }
    if (/android/i.test(userAgent)) {
      return 'Android 设备';
    }
    if (/windows/i.test(userAgent)) {
      return 'Windows 浏览器';
    }
    if (/macintosh|mac os/i.test(userAgent)) {
      return 'Mac 浏览器';
    }
    if (/node|undici/i.test(userAgent)) {
      return 'API 客户端';
    }
    return '浏览器';
  }
}
