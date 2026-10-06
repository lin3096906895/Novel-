import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AiHeaderBag,
  AiProviderCredentials,
  resolveAiProviderCredentials,
} from './ai-provider';

@Injectable()
export class AiProviderService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * 从请求头解析用户自带的 AI 凭据。
   * apiKey 为空时返回空字符串，由调用方决定如何报错，避免把“未配置”误报成服务不可用。
   */
  fromHeaders(headers: AiHeaderBag): AiProviderCredentials {
    return resolveAiProviderCredentials(headers, {
      baseUrl: this.configService.get<string>('DEEPSEEK_BASE_URL'),
      model: this.configService.get<string>('DEEPSEEK_MODEL'),
      allowedHosts: this.configService.get<string>('AI_ALLOWED_PROVIDER_HOSTS'),
    });
  }
}
