import { BadRequestException } from '@nestjs/common';

/**
 * 用户自带 AI 凭据（BYOK）。
 *
 * 设计约定：
 * - 浏览器把用户自己的 API Key 放在请求头里，服务端不落库、不记录日志。
 * - 服务端不再回退到站点自己的 DEEPSEEK_API_KEY，未提供即视为未配置。
 * - 接口地址由用户填写，因此必须校验，避免被用来探测内网（SSRF）。
 */

export const AI_API_KEY_HEADER = 'x-ai-api-key';
export const AI_BASE_URL_HEADER = 'x-ai-base-url';
export const AI_MODEL_HEADER = 'x-ai-model';

export const DEFAULT_AI_BASE_URL = 'https://api.deepseek.com';
export const DEFAULT_AI_MODEL = 'deepseek-v4-flash';

const MAX_API_KEY_LENGTH = 400;
const MAX_MODEL_LENGTH = 120;

/**
 * 允许用户填写的 AI 服务商主机名白名单。
 * 只有 https 且命中该列表的地址才会被服务端请求，避免用户把接口地址指向
 * 127.0.0.1、内网网段或云厂商元数据地址。
 */
const BUILT_IN_ALLOWED_HOSTS = [
  'api.deepseek.com',
  'api.openai.com',
  'api.siliconflow.cn',
  'dashscope.aliyuncs.com',
  'open.bigmodel.cn',
  'api.moonshot.cn',
  'api.minimax.chat',
  'ark.cn-beijing.volces.com',
];

export type AiHeaderBag = Record<string, string | string[] | undefined>;

export type AiProviderCredentials = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type AiProviderDefaults = {
  baseUrl?: string;
  model?: string;
  allowedHosts?: string;
};

function readHeader(headers: AiHeaderBag, name: string) {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function parseAllowedHosts(extraHosts?: string) {
  const hosts = new Set(BUILT_IN_ALLOWED_HOSTS);
  (extraHosts ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .forEach((entry) => hosts.add(entry));
  return hosts;
}

export function normalizeAiBaseUrl(rawValue: string, allowedHosts: Set<string>) {
  let parsed: URL;
  try {
    parsed = new URL(rawValue.trim());
  } catch {
    throw new BadRequestException('AI 接口地址不是合法的 URL。');
  }

  if (parsed.protocol !== 'https:') {
    throw new BadRequestException('AI 接口地址必须使用 https。');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!allowedHosts.has(hostname)) {
    throw new BadRequestException(
      `AI 接口地址不在允许列表内：${hostname}。可在服务端通过 AI_ALLOWED_PROVIDER_HOSTS 添加。`,
    );
  }

  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
}

export function resolveAiProviderCredentials(
  headers: AiHeaderBag,
  defaults: AiProviderDefaults = {},
): AiProviderCredentials {
  const apiKey = (readHeader(headers, AI_API_KEY_HEADER) ?? '')
    .trim()
    .slice(0, MAX_API_KEY_LENGTH);
  const customBaseUrl = (readHeader(headers, AI_BASE_URL_HEADER) ?? '').trim();
  const customModel = (readHeader(headers, AI_MODEL_HEADER) ?? '').trim();

  // 只有用户自己填的地址才做白名单校验；站点默认地址由运维配置，视为可信。
  const baseUrl = customBaseUrl
    ? normalizeAiBaseUrl(customBaseUrl, parseAllowedHosts(defaults.allowedHosts))
    : (defaults.baseUrl?.trim() || DEFAULT_AI_BASE_URL).replace(/\/+$/, '');

  return {
    apiKey,
    baseUrl,
    model: (customModel || defaults.model?.trim() || DEFAULT_AI_MODEL).slice(0, MAX_MODEL_LENGTH),
  };
}
