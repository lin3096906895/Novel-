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

  async retrieve(input: RetrieveInput): Promise<Array<Record<string, unknown>>> {
    if (!this.isEnabled()) return [];
    const payload = await this.request('/v1/retrieve', input);
    const items = (payload as { items?: unknown }).items;
    return Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
  }

  private async request(path: string, body: unknown): Promise<Record<string, unknown>> {
    const baseUrl =
      this.configService.get<string>('RAG_SERVICE_URL')?.trim().replace(/\/+$/, '') ||
      'http://127.0.0.1:8000';
    const token = this.configService.get<string>('INTERNAL_RAG_TOKEN')?.trim();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
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
