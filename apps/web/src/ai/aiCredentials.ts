/**
 * 用户自带的 AI 凭据（BYOK）。
 *
 * 只保存在浏览器 localStorage 里，不会上传到服务端数据库。
 * 每次调用 AI 接口时通过请求头临时带给后端，后端用完即弃。
 */

export type AiCredentials = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type AiProviderPreset = {
  label: string;
  baseUrl: string;
  model: string;
};

/** 常见 OpenAI 兼容服务商预设，baseUrl 均需与 /chat/completions 拼接。 */
export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-flash' },
  { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
  {
    label: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
  { label: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  { label: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
];

export const DEFAULT_AI_CREDENTIALS: AiCredentials = {
  apiKey: '',
  baseUrl: AI_PROVIDER_PRESETS[0].baseUrl,
  model: AI_PROVIDER_PRESETS[0].model,
};

const STORAGE_KEY = 'novel_platform_ai_credentials';

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadAiCredentials(): AiCredentials {
  const store = storage();
  if (!store) {
    return { ...DEFAULT_AI_CREDENTIALS };
  }
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_AI_CREDENTIALS };
    }
    const parsed = JSON.parse(raw) as Partial<AiCredentials>;
    return {
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      baseUrl:
        typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim()
          ? parsed.baseUrl
          : DEFAULT_AI_CREDENTIALS.baseUrl,
      model:
        typeof parsed.model === 'string' && parsed.model.trim()
          ? parsed.model
          : DEFAULT_AI_CREDENTIALS.model,
    };
  } catch {
    return { ...DEFAULT_AI_CREDENTIALS };
  }
}

export function saveAiCredentials(credentials: AiCredentials): void {
  const store = storage();
  if (!store) {
    return;
  }
  try {
    store.setItem(
      STORAGE_KEY,
      JSON.stringify({
        apiKey: credentials.apiKey.trim(),
        baseUrl: credentials.baseUrl.trim() || DEFAULT_AI_CREDENTIALS.baseUrl,
        model: credentials.model.trim() || DEFAULT_AI_CREDENTIALS.model,
      }),
    );
  } catch {
    // 隐私模式或配额已满时静默失败，调用方会继续按未配置处理。
  }
}

export function clearAiCredentials(): void {
  const store = storage();
  if (!store) {
    return;
  }
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // 忽略。
  }
}

export function hasAiApiKey(): boolean {
  return loadAiCredentials().apiKey.trim().length > 0;
}

/** 仅当已填写 API Key 时返回请求头，避免无意义地携带空凭据。 */
export function aiRequestHeaders(): Record<string, string> {
  const credentials = loadAiCredentials();
  const apiKey = credentials.apiKey.trim();
  if (!apiKey) {
    return {};
  }
  return {
    'X-AI-Api-Key': apiKey,
    'X-AI-Base-Url': credentials.baseUrl.trim(),
    'X-AI-Model': credentials.model.trim(),
  };
}

/** 用于界面展示的脱敏 Key，例如 sk-1234••••••cdef。 */
export function maskAiApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.length <= 10) {
    return `${trimmed.slice(0, 2)}••••`;
  }
  return `${trimmed.slice(0, 6)}••••${trimmed.slice(-4)}`;
}
