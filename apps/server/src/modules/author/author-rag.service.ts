import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type IndexChapterInput = {
  novelId: string;
  chapterId: string;
  chapterOrder: number;
  title: string;
  content: string;
};

type RetrieveInput = {
  novelId: string;
  query: string;
  topK?: number;
  maxChapterOrder?: number;
};

export type RagIndexStatus = {
  enabled: boolean;
  novelId: string;
  chapterCount: number;
  indexedChapterCount: number;
  pendingChapterCount: number;
  chunkCount: number;
  indexedCharacterCount: number;
  lastIndexedAt: string | null;
  embeddingMode: string;
  embeddingModel: string;
};

@Injectable()
export class AuthorRagService {
  private readonly logger = new Logger(AuthorRagService.name);

  constructor(private readonly configService: ConfigService) {}

  async indexChapter(input: IndexChapterInput): Promise<void> {
    if (!this.isEnabled()) return;
    try {
      await this.request('/v1/index/chapter', input);
    } catch (error) {
      this.logger.warn(
        `RAG chapter indexing skipped for ${input.chapterId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  async indexNovel(input: { novelId: string; maxChapterOrder?: number }) {
    if (!this.isEnabled()) {
      throw new Error('RAG service is disabled. Set RAG_ENABLED=true before indexing.');
    }
    return this.request('/v1/index/novel', input, { timeoutMs: 5 * 60_000 });
  }

  async getNovelIndexStatus(novelId: string): Promise<RagIndexStatus> {
    if (!this.isEnabled()) {
      return {
        enabled: false,
        novelId,
        chapterCount: 0,
        indexedChapterCount: 0,
        pendingChapterCount: 0,
        chunkCount: 0,
        indexedCharacterCount: 0,
        lastIndexedAt: null,
        embeddingMode: 'disabled',
        embeddingModel: 'disabled',
      };
    }
    const payload = await this.request(`/v1/index/novel/${encodeURIComponent(novelId)}`, undefined, {
      method: 'GET',
    });
    return { enabled: true, ...payload } as RagIndexStatus;
  }

  async retrieve(input: RetrieveInput): Promise<Array<Record<string, unknown>>> {
    if (!this.isEnabled()) return [];
    const payload = await this.request('/v1/retrieve', input);
    const items = (payload as { items?: unknown }).items;
    return Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
  }

  private async request(
    path: string,
    body?: unknown,
    options: { method?: 'GET' | 'POST'; timeoutMs?: number } = {},
  ): Promise<Record<string, unknown>> {
    const baseUrl =
      this.configService.get<string>('RAG_SERVICE_URL')?.trim().replace(/\/+$/, '') ||
      'http://127.0.0.1:8000';
    const token = this.configService.get<string>('INTERNAL_RAG_TOKEN')?.trim();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: options.method ?? 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`RAG service returned HTTP ${response.status}`);
      }
      return (await response.json()) as Record<string, unknown>;
    } finally {
      clearTimeout(timeout);
    }
  }

  private isEnabled() {
    const value = this.configService.get<string>('RAG_ENABLED');
    return ['1', 'true', 'on', 'yes'].includes(value?.trim().toLowerCase() ?? '');
  }
}
