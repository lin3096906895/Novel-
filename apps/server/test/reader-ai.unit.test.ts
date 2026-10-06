import { BadRequestException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AiProviderCredentials } from '../src/modules/ai/ai-provider';
import { ReaderAiService } from '../src/modules/reader-ai/reader-ai.service';
import { ReaderAiDto } from '../src/modules/reader-ai/dto/reader-ai.dto';

const reader = {
  id: 'reader_1',
  email: 'reader@novel.local',
  role: UserRole.READER,
  sessionId: 'session_1',
};

// 阅读端现在使用读者自带的凭据，不再读取服务端 DEEPSEEK_API_KEY。
const credentials: AiProviderCredentials = {
  apiKey: 'test-key',
  baseUrl: 'https://api.deepseek.com',
  model: 'test-reader-model',
};

function createService(
  chapter: Record<string, unknown> | null = {
    id: 'chapter_11',
    title: '第十一章 山门夜雨',
    content: '韩清在雨夜回到山门，发现石阶上留着一枚陌生玉佩。',
    orderIndex: 11,
  },
  ragService: { retrieve(input: Record<string, unknown>): Promise<Array<Record<string, unknown>>> } = {
    retrieve: async () => [],
  },
) {
  return new ReaderAiService(
    { chapter: { findFirst: async () => chapter ?? undefined } } as never,
    ragService as never,
  );
}

describe('ReaderAiService', () => {
  it('keeps recall retrieval behind the current chapter and returns references', async () => {
    const originalFetch = globalThis.fetch;
    let retrieveInput: Record<string, unknown> | undefined;
    let requestBody = '';
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '前文回顾：主角曾在山门参加考核。' } }] }),
      };
    }) as typeof fetch;

    try {
      const result = await createService(undefined, {
        retrieve: async (input) => {
          retrieveInput = input;
          return [
            {
              chapterId: 'chapter_4',
              chapterOrder: 4,
              content: '主角在山门参加考核。',
              metadata: { title: '第四章 山门考核' },
              score: 0.88,
            },
          ];
        },
      }).ask(
        reader,
        'novel_1',
        {
          action: 'recall',
          chapterId: 'chapter_11',
          spoilerMode: 'safe',
        },
        credentials,
      );

      assert.equal(retrieveInput?.novelId, 'novel_1');
      assert.equal(retrieveInput?.maxChapterOrder, 10);
      assert.equal(result.answer, '前文回顾：主角曾在山门参加考核。');
      assert.equal(result.model, 'test-reader-model');
      assert.deepEqual(result.sources, [
        {
          chapterId: 'chapter_4',
          chapterOrder: 4,
          title: '第四章 山门考核',
          excerpt: '主角在山门参加考核。',
          score: 0.88,
        },
      ]);
      assert.doesNotMatch(requestBody, /韩清在雨夜回到山门/);
      assert.match(requestBody, /严禁透露当前章节之后的剧情/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects an empty question for direct reader questions', async () => {
    await assert.rejects(
      () =>
        createService().ask(
          reader,
          'novel_1',
          {
            action: 'ask',
            chapterId: 'chapter_11',
          } as ReaderAiDto,
          credentials,
        ),
      BadRequestException,
    );
  });

  it('does not allow a chapter from another novel', async () => {
    await assert.rejects(
      () =>
        createService(null).ask(
          reader,
          'another_novel',
          {
            action: 'summary',
            chapterId: 'chapter_11',
          },
          credentials,
        ),
      NotFoundException,
    );
  });

  it('requires the reader to provide their own provider key', async () => {
    await assert.rejects(
      () =>
        createService().ask(
          reader,
          'novel_1',
          {
            action: 'summary',
            chapterId: 'chapter_11',
          },
          { ...credentials, apiKey: '   ' },
        ),
      ServiceUnavailableException,
    );
  });
});
