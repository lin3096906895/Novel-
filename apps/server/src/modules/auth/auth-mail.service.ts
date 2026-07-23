import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthMailService {
  constructor(private readonly configService: ConfigService) {}

  sendPasswordResetCode(input: { email: string; code: string; expiresInMinutes: number }) {
    return this.deliver({
      email: input.email,
      subject: '阅界密码重置验证码',
      text: `你的密码重置验证码是 ${input.code}，${input.expiresInMinutes} 分钟内有效。若非本人操作，请忽略此邮件。`,
      html: this.codeHtml('密码重置验证码', input.code, input.expiresInMinutes),
      developmentLog: `password reset code: ${input.code}`,
    });
  }

  sendEmailVerificationCode(input: {
    email: string;
    code: string;
    expiresInMinutes: number;
    purpose: 'REGISTER' | 'CHANGE_EMAIL';
  }) {
    const action = input.purpose === 'REGISTER' ? '注册' : '修改邮箱';
    return this.deliver({
      email: input.email,
      subject: `阅界${action}验证码`,
      text: `你的${action}验证码是 ${input.code}，${input.expiresInMinutes} 分钟内有效。若非本人操作，请忽略此邮件。`,
      html: this.codeHtml(`${action}验证码`, input.code, input.expiresInMinutes),
      developmentLog: `${input.purpose.toLowerCase()} code: ${input.code}`,
    });
  }

  sendNewDeviceLoginAlert(input: {
    email: string;
    deviceName: string;
    ipAddress?: string;
    occurredAt: Date;
  }) {
    const location = input.ipAddress ? `，网络地址 ${input.ipAddress}` : '';
    const time = input.occurredAt.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    return this.deliver({
      email: input.email,
      subject: '阅界新设备登录提醒',
      text: `你的账号于 ${time} 在 ${input.deviceName}${location} 登录。若非本人操作，请立即修改密码并退出其他设备。`,
      html: `<p>你的账号于 <strong>${time}</strong> 在 <strong>${this.escapeHtml(input.deviceName)}</strong>${location ? this.escapeHtml(location) : ''} 登录。</p><p>若非本人操作，请立即修改密码并退出其他设备。</p>`,
      developmentLog: `new device login: ${input.deviceName}${location}`,
    });
  }

  private async deliver(input: {
    email: string;
    subject: string;
    text: string;
    html: string;
    developmentLog: string;
  }) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    const configuredMode = this.configService.get<string>('EMAIL_DELIVERY_MODE');
    const mode = configuredMode ?? (apiKey ? 'resend' : 'console');

    if (mode === 'console') {
      if (this.configService.get<string>('NODE_ENV') === 'production') {
        throw new ServiceUnavailableException('邮件服务尚未配置');
      }
      console.info(`[mail:development] ${input.email} ${input.developmentLog}`);
      return { provider: 'console' as const };
    }

    if (mode !== 'resend' || !apiKey) {
      throw new ServiceUnavailableException('邮件服务尚未配置');
    }

    const from = this.configService.get<string>('EMAIL_FROM') ?? '阅界 <onboarding@resend.dev>';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [input.email],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException('邮件发送暂时失败，请稍后再试');
    }
    return { provider: 'resend' as const };
  }

  private codeHtml(title: string, code: string, expiresInMinutes: number) {
    return `<p>你的${title}是：</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>${expiresInMinutes} 分钟内有效。若非本人操作，请忽略此邮件。</p>`;
  }

  private escapeHtml(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
