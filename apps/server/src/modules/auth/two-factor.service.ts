import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoginActivityStatus, LoginRiskLevel, UserStatus } from '@prisma/client';
import { compare } from 'bcryptjs';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser, SessionMetadata } from './auth.types';
import { BeginTwoFactorSetupDto, ManageTwoFactorDto } from './dto/two-factor.dto';

const loginChallengeTtlMs = 5 * 60 * 1000;
const maxLoginChallengeAttempts = 5;
const recoveryCodeCount = 10;
const recoveryAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class TwoFactorService {
  private readonly totp = authenticator.clone({ window: 1 });

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async status(userId: string) {
    const credential = await this.prisma.twoFactorCredential.findUnique({
      where: { userId },
      select: {
        enabledAt: true,
        createdAt: true,
        _count: { select: { recoveryCodes: { where: { usedAt: null } } } },
      },
    });
    return {
      enabled: Boolean(credential?.enabledAt),
      enabledAt: credential?.enabledAt ?? null,
      pendingSetup: Boolean(credential && !credential.enabledAt),
      recoveryCodesRemaining: credential?._count.recoveryCodes ?? 0,
    };
  }

  async beginSetup(user: RequestUser, dto: BeginTwoFactorSetupDto) {
    await this.assertCurrentPassword(user.id, dto.currentPassword);
    const existing = await this.prisma.twoFactorCredential.findUnique({
      where: { userId: user.id },
      select: { enabledAt: true },
    });
    if (existing?.enabledAt) {
      throw new ConflictException('两步验证已启用');
    }

    const account = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { email: true },
    });
    const secret = this.totp.generateSecret(20);
    const secretEncrypted = this.encryptSecret(secret);

    await this.prisma.$transaction(async (tx) => {
      const credential = await tx.twoFactorCredential.upsert({
        where: { userId: user.id },
        create: { userId: user.id, secretEncrypted },
        update: { secretEncrypted, enabledAt: null },
        select: { id: true },
      });
      await tx.twoFactorRecoveryCode.deleteMany({ where: { credentialId: credential.id } });
      await tx.twoFactorLoginChallenge.deleteMany({ where: { userId: user.id } });
    });

    const otpauthUrl = this.totp.keyuri(account.email, '阅界小说', secret);
    return {
      secret,
      otpauthUrl,
      qrCodeDataUrl: await QRCode.toDataURL(otpauthUrl, {
        width: 220,
        margin: 1,
        errorCorrectionLevel: 'M',
      }),
    };
  }

  async cancelSetup(userId: string) {
    const removed = await this.prisma.twoFactorCredential.deleteMany({
      where: { userId, enabledAt: null },
    });
    return { cancelled: removed.count > 0 };
  }

  async enable(user: RequestUser, code: string) {
    const credential = await this.prisma.twoFactorCredential.findUnique({
      where: { userId: user.id },
    });
    if (!credential || credential.enabledAt) {
      throw new BadRequestException('请先开始两步验证设置');
    }
    if (!this.isValidTotp(code, this.decryptSecret(credential.secretEncrypted))) {
      throw new BadRequestException('验证器代码错误');
    }

    const recoveryCodes = this.generateRecoveryCodes();
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const enabled = await tx.twoFactorCredential.updateMany({
        where: { id: credential.id, userId: user.id, enabledAt: null },
        data: { enabledAt: now },
      });
      if (enabled.count !== 1) {
        throw new ConflictException('两步验证状态已发生变化');
      }
      await tx.twoFactorRecoveryCode.createMany({
        data: recoveryCodes.map((recoveryCode) => ({
          credentialId: credential.id,
          codeHash: this.hashRecoveryCode(user.id, recoveryCode),
        })),
      });
      const revoked = await tx.authSession.updateMany({
        where: { userId: user.id, id: { not: user.sessionId }, revokedAt: null },
        data: { revokedAt: now },
      });
      return { revokedSessions: revoked.count };
    });

    return {
      enabled: true,
      enabledAt: now,
      recoveryCodes,
      recoveryCodesRemaining: recoveryCodes.length,
      revokedSessions: result.revokedSessions,
    };
  }

  async regenerateRecoveryCodes(user: RequestUser, dto: ManageTwoFactorDto) {
    await this.assertCurrentPassword(user.id, dto.currentPassword);
    const credential = await this.requireEnabledCredential(user.id);
    await this.assertEnabledCode(user.id, credential.id, credential.secretEncrypted, dto.code);

    const recoveryCodes = this.generateRecoveryCodes();
    await this.prisma.$transaction(async (tx) => {
      await tx.twoFactorRecoveryCode.deleteMany({ where: { credentialId: credential.id } });
      await tx.twoFactorRecoveryCode.createMany({
        data: recoveryCodes.map((recoveryCode) => ({
          credentialId: credential.id,
          codeHash: this.hashRecoveryCode(user.id, recoveryCode),
        })),
      });
    });
    return { recoveryCodes, recoveryCodesRemaining: recoveryCodes.length };
  }

  async disable(user: RequestUser, dto: ManageTwoFactorDto) {
    await this.assertCurrentPassword(user.id, dto.currentPassword);
    const credential = await this.requireEnabledCredential(user.id);
    await this.assertEnabledCode(user.id, credential.id, credential.secretEncrypted, dto.code);

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      await tx.twoFactorLoginChallenge.deleteMany({ where: { userId: user.id } });
      await tx.twoFactorCredential.delete({ where: { id: credential.id } });
      const revoked = await tx.authSession.updateMany({
        where: { userId: user.id, id: { not: user.sessionId }, revokedAt: null },
        data: { revokedAt: now },
      });
      return { disabled: true, revokedSessions: revoked.count };
    });
  }

  async verifySensitiveAction(user: RequestUser, currentPassword: string, code?: string) {
    await this.assertCurrentPassword(user.id, currentPassword);
    const credential = await this.prisma.twoFactorCredential.findFirst({
      where: { userId: user.id, enabledAt: { not: null } },
    });
    if (!credential) {
      return { twoFactorRequired: false };
    }
    if (!code) {
      throw new BadRequestException('请输入验证器代码或恢复码');
    }
    await this.assertEnabledCode(user.id, credential.id, credential.secretEncrypted, code);
    return { twoFactorRequired: true };
  }

  async createLoginChallenge(user: { id: string; email: string }, metadata: SessionMetadata) {
    const credential = await this.prisma.twoFactorCredential.findFirst({
      where: { userId: user.id, enabledAt: { not: null } },
      select: {
        id: true,
        _count: { select: { recoveryCodes: { where: { usedAt: null } } } },
      },
    });
    if (!credential) {
      return null;
    }

    const challengeToken = randomBytes(32).toString('base64url');
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.twoFactorLoginChallenge.deleteMany({
        where: {
          userId: user.id,
          OR: [{ expiresAt: { lte: now } }, { consumedAt: { not: null } }],
        },
      }),
      this.prisma.twoFactorLoginChallenge.create({
        data: {
          userId: user.id,
          tokenHash: this.hashChallengeToken(challengeToken),
          deviceName: metadata.deviceName?.trim() || this.describeDevice(metadata.userAgent),
          userAgent: metadata.userAgent?.slice(0, 500),
          ipAddress: metadata.ipAddress?.slice(0, 100),
          expiresAt: new Date(now.getTime() + loginChallengeTtlMs),
        },
      }),
    ]);

    return {
      requiresTwoFactor: true as const,
      challengeToken,
      expiresIn: Math.floor(loginChallengeTtlMs / 1000),
      recoveryCodesAvailable: credential._count.recoveryCodes,
    };
  }

  async verifyLoginChallenge(challengeToken: string, code: string) {
    const tokenHash = this.hashChallengeToken(challengeToken);
    const challenge = await this.prisma.twoFactorLoginChallenge.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: { twoFactorCredential: true },
        },
      },
    });
    const now = new Date();
    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt <= now ||
      challenge.attemptCount >= maxLoginChallengeAttempts ||
      !challenge.user.twoFactorCredential?.enabledAt
    ) {
      throw new UnauthorizedException('两步验证挑战已失效，请重新登录');
    }
    if (challenge.user.status === UserStatus.SUSPENDED || challenge.user.deletedAt) {
      throw new UnauthorizedException('账号已被封禁');
    }

    const credential = challenge.user.twoFactorCredential;
    const recoveryCode = await this.findUnusedRecoveryCode(challenge.userId, credential.id, code);
    const isValid =
      this.isValidTotp(code, this.decryptSecret(credential.secretEncrypted)) ||
      Boolean(recoveryCode);
    if (!isValid) {
      const nextAttemptCount = challenge.attemptCount + 1;
      await this.prisma.twoFactorLoginChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: {
          attemptCount: { increment: 1 },
          ...(nextAttemptCount >= maxLoginChallengeAttempts ? { consumedAt: now } : {}),
        },
      });
      await this.recordFailedChallenge(challenge, nextAttemptCount);
      throw new UnauthorizedException(
        nextAttemptCount >= maxLoginChallengeAttempts
          ? '验证次数过多，请重新登录'
          : '验证器代码或恢复码错误',
      );
    }

    const consumed = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.twoFactorLoginChallenge.updateMany({
        where: {
          id: challenge.id,
          consumedAt: null,
          expiresAt: { gt: now },
          attemptCount: { lt: maxLoginChallengeAttempts },
        },
        data: { consumedAt: now },
      });
      if (updated.count !== 1) {
        return false;
      }
      if (recoveryCode) {
        const used = await tx.twoFactorRecoveryCode.updateMany({
          where: { id: recoveryCode.id, usedAt: null },
          data: { usedAt: now },
        });
        if (used.count !== 1) {
          return false;
        }
      }
      return true;
    });
    if (!consumed) {
      throw new UnauthorizedException('两步验证挑战已失效，请重新登录');
    }

    return {
      user: challenge.user,
      metadata: {
        deviceName: challenge.deviceName,
        userAgent: challenge.userAgent ?? undefined,
        ipAddress: challenge.ipAddress ?? undefined,
      },
      usedRecoveryCode: Boolean(recoveryCode),
    };
  }

  private async assertCurrentPassword(userId: string, password: string) {
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!account || !(await compare(password, account.passwordHash))) {
      throw new BadRequestException('当前密码错误');
    }
  }

  private async requireEnabledCredential(userId: string) {
    const credential = await this.prisma.twoFactorCredential.findFirst({
      where: { userId, enabledAt: { not: null } },
    });
    if (!credential) {
      throw new BadRequestException('两步验证尚未启用');
    }
    return credential;
  }

  private async assertEnabledCode(
    userId: string,
    credentialId: string,
    secretEncrypted: string,
    code: string,
  ) {
    if (this.isValidTotp(code, this.decryptSecret(secretEncrypted))) {
      return;
    }
    const recoveryCode = await this.findUnusedRecoveryCode(userId, credentialId, code);
    if (!recoveryCode) {
      throw new BadRequestException('验证器代码或恢复码错误');
    }
    const used = await this.prisma.twoFactorRecoveryCode.updateMany({
      where: { id: recoveryCode.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count !== 1) {
      throw new BadRequestException('恢复码已被使用');
    }
  }

  private findUnusedRecoveryCode(userId: string, credentialId: string, code: string) {
    const normalized = this.normalizeRecoveryCode(code);
    if (normalized.length !== 8) {
      return Promise.resolve(null);
    }
    return this.prisma.twoFactorRecoveryCode.findFirst({
      where: {
        credentialId,
        codeHash: this.hashRecoveryCode(userId, normalized),
        usedAt: null,
      },
      select: { id: true },
    });
  }

  private isValidTotp(code: string, secret: string) {
    return /^\d{6}$/.test(code.trim()) && this.totp.check(code.trim(), secret);
  }

  private generateRecoveryCodes() {
    return Array.from({ length: recoveryCodeCount }, () => {
      let code = '';
      for (let index = 0; index < 8; index += 1) {
        code += recoveryAlphabet[randomInt(0, recoveryAlphabet.length)];
      }
      return `${code.slice(0, 4)}-${code.slice(4)}`;
    });
  }

  private normalizeRecoveryCode(code: string) {
    return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  private hashRecoveryCode(userId: string, code: string) {
    const pepper = this.configService.get<string>('TWO_FACTOR_RECOVERY_SECRET') ?? this.secretKey();
    return createHash('sha256')
      .update(`${pepper}:${userId}:${this.normalizeRecoveryCode(code)}`)
      .digest('hex');
  }

  private hashChallengeToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private encryptSecret(secret: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), encrypted]
      .map((value) => value.toString('base64url'))
      .join('.');
  }

  private decryptSecret(value: string) {
    const [ivValue, tagValue, encryptedValue] = value.split('.');
    if (!ivValue || !tagValue || !encryptedValue) {
      throw new UnauthorizedException('两步验证配置无效');
    }
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey(),
        Buffer.from(ivValue, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encryptedValue, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new UnauthorizedException('两步验证配置无效');
    }
  }

  private encryptionKey() {
    return createHash('sha256').update(this.secretKey()).digest();
  }

  private secretKey() {
    return (
      this.configService.get<string>('TWO_FACTOR_ENCRYPTION_KEY') ??
      this.configService.get<string>('JWT_SECRET') ??
      'local_two_factor_secret'
    );
  }

  private async recordFailedChallenge(
    challenge: {
      userId: string;
      user: { email: string };
      deviceName: string;
      userAgent: string | null;
      ipAddress: string | null;
    },
    attemptCount: number,
  ) {
    try {
      await this.prisma.loginActivity.create({
        data: {
          userId: challenge.userId,
          email: challenge.user.email,
          status: LoginActivityStatus.FAILURE,
          riskLevel:
            attemptCount >= maxLoginChallengeAttempts ? LoginRiskLevel.HIGH : LoginRiskLevel.NOTICE,
          failureReason: 'INVALID_TWO_FACTOR_CODE',
          deviceName: challenge.deviceName,
          userAgent: challenge.userAgent,
          ipAddress: challenge.ipAddress,
        },
      });
    } catch {
      // Login must still fail even if activity logging is unavailable.
    }
  }

  private describeDevice(userAgent?: string) {
    if (!userAgent) {
      return '未知设备';
    }
    if (/node|undici/i.test(userAgent)) {
      return 'API 客户端';
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
    return '浏览器';
  }
}
