import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AiProviderCredentials } from '../src/modules/ai/ai-provider';
import { AuthorAiService } from '../src/modules/author/author-ai.service';
import { AuthorAiAssistanceDto } from '../src/modules/author/dto/author-ai-assistance.dto';

const author = {
  id: 'author_1',
  email: 'author@novel.local',
  role: UserRole.AUTHOR,
  sessionId: 'session_1',
};

// 作者端现在使用作者自带的凭据，不再读取服务端 DEEPSEEK_API_KEY。
const credentials: AiProviderCredentials = {
  apiKey: 'test-key',
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
};

function createService(
  authorId = author.id,
  ragService?: {
    retrieve(input: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
  },
) {
  return new AuthorAiService(
    {
      chapter: {
        findUnique: async () => ({
          novelId: 'novel_1',
          orderIndex: 12,
          novel: { authorId },
        }),
      },
      novel: {
        findUnique: async () => ({ authorId, chapters: [{ orderIndex: 100 }] }),
      },
    } as never,
    ragService as never,
  );
}

const dto: AuthorAiAssistanceDto = {
  action: 'summary',
  title: 'A chapter title',
  content: 'This chapter contains enough draft text for the AI assistant to analyze safely.',
};

describe('AuthorAiService', () => {
  it('sends an owned chapter to the configured provider and returns the suggestion', async () => {
    const originalFetch = globalThis.fetch;
    let requestUrl = '';
    let requestBody = '';
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestUrl = String(url);
      requestBody = String(init?.body);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'AI suggestion' } }] }),
      };
    }) as typeof fetch;

    try {
      const result = await createService().assistChapter(author, 'chapter_1', dto, credentials);
      assert.deepEqual(result, {
        action: 'summary',
        content: 'AI suggestion',
        model: 'deepseek-v4-flash',
      });
      assert.equal(requestUrl, 'https://api.deepseek.com/chat/completions');
      assert.match(requestBody, /Chapter title: A chapter title/);
      assert.match(requestBody, /Chinese-language writing assistant/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects a chapter owned by another author before calling the provider', async () => {
    await assert.rejects(
      () => createService('another_author').assistChapter(author, 'chapter_1', dto, credentials),
      ForbiddenException,
    );
  });

  it('supports AI assistance for an unsaved draft and includes the author question', async () => {
    const originalFetch = globalThis.fetch;
    let requestBody = '';
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'Research answer' } }] }),
      };
    }) as typeof fetch;

    try {
      const result = await createService().assistDraft(
        author,
        {
          action: 'research',
          title: '未命名章节',
          content: '这是一段足够长的创作思路，用于测试新章节保存前也可以调用 AI 辅助。',
          query: '古代客栈如何称呼掌柜？',
        },
        credentials,
      );
      assert.equal(result.action, 'research');
      assert.match(requestBody, /Author question:/);
      assert.match(requestBody, /do not claim live web access/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('retrieves spoiler-safe prior chapters for an unsaved consistency check', async () => {
    const originalFetch = globalThis.fetch;
    let requestBody = '';
    let retrieveInput: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '发现一处姓名疑似冲突 [S1]' } }] }),
      };
    }) as typeof fetch;

    try {
      const result = await createService(author.id, {
        retrieve: async (input) => {
          retrieveInput = input;
          return [
            {
              chapterId: 'chapter_1',
              chapterOrder: 1,
              chunkIndex: 0,
              content: '王耀给自己算了一卦，随后准备参加仙门考核。',
              metadata: { title: '第一章 若是修仙不努力' },
              score: 0.82,
              vectorScore: 0.76,
              lexicalScore: 0.93,
            },
          ];
        },
      }).assistDraft(
        author,
        {
          action: 'consistency',
          title: '第一百零一章 故人重逢',
          content: '王凌回到山门，众人都认出他就是当年参加仙门考核的少年。',
          novelId: 'novel_1',
          beforeChapterOrder: 100,
        },
        credentials,
      );

      assert.equal(retrieveInput?.novelId, 'novel_1');
      assert.equal(retrieveInput?.maxChapterOrder, 100);
      assert.equal(retrieveInput?.includeUnpublished, true);
      assert.match(String(retrieveInput?.query), /王凌回到山门/);
      assert.match(requestBody, /前文检索参考/);
      assert.match(requestBody, /\[S1 第1章 第一章 若是修仙不努力\]/);
      assert.match(requestBody, /long-form fiction continuity editor/);
      assert.deepEqual(result.sources, [
        {
          chapterId: 'chapter_1',
          chapterOrder: 1,
          chunkIndex: 0,
          score: 0.82,
          vectorScore: 0.76,
          lexicalScore: 0.93,
          title: '第一章 若是修仙不努力',
          excerpt: '王耀给自己算了一卦，随后准备参加仙门考核。',
        },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('injects confirmed structured memories alongside retrieved context', async () => {
    const originalFetch = globalThis.fetch;
    let requestBody = '';
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body);
      return {
        ok: true,
        json: async () => ({ choices: [{ message: { content: '已结合设定' } }] }),
      };
    }) as typeof fetch;

    try {
      const service = new AuthorAiService({
        chapter: {
          findUnique: async () => ({
            novelId: 'novel_1',
            orderIndex: 12,
            novel: { authorId: author.id },
          }),
        },
        novel: {
          findUnique: async () => ({ authorId: author.id, chapters: [{ orderIndex: 12 }] }),
        },
        novelMemory: {
          findMany: async () => [
            {
              id: 'memory_1',
              type: 'CHARACTER',
              title: '王耀',
              content: '主角，擅长推演气运。',
              sourceChapterId: 'chapter_1',
              sourceChapter: { orderIndex: 1, title: '第一章' },
            },
          ],
        },
      } as never);

      const result = await service.assistDraft(
        author,
        {
          ...dto,
          action: 'consistency',
          novelId: 'novel_1',
          beforeChapterOrder: 12,
        },
        credentials,
      );
      assert.match(requestBody, /已确认的作品结构化设定/);
      assert.match(requestBody, /王耀/);
      assert.deepEqual(result.memorySources, [
        {
          id: 'memory_1',
          type: 'CHARACTER',
          title: '王耀',
          sourceChapterId: 'chapter_1',
        },
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns unpersisted memory drafts from the extraction endpoint workflow', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                '```json\n{"drafts":[{"type":"CHARACTER","title":"王耀","content":"擅长推演气运。","confidence":"high","evidence":"他在章节中展示了推演能力。"}]}\n```',
            },
          },
        ],
      }),
    })) as typeof fetch;

    try {
      const service = new AuthorAiService({
        novel: { findUnique: async () => ({ authorId: author.id }) },
        chapter: { findFirst: async () => ({ id: 'chapter_1' }) },
      } as never);
      const result = await service.extractMemoryDraft(
        author,
        'novel_1',
        {
          title: '第一章',
          content: '王耀抬手推演气运，发现山门上空有异象。',
          sourceChapterId: 'chapter_1',
        },
        credentials,
      );
      assert.equal(result.drafts.length, 1);
      assert.equal(result.drafts[0].type, 'CHARACTER');
      assert.equal(result.drafts[0].title, '王耀');
      assert.equal(result.sourceChapterId, 'chapter_1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('parses a structured consistency report returned by the provider', async () => {
    const originalFetch = globalThis.fetch;
    let requestBody = '';
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body);
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  verdict: 'ISSUES_FOUND',
                  summary: '发现一处人物能力设定冲突。',
                  issues: [
                    {
                      severity: 'CRITICAL',
                      category: 'POWER',
                      title: '王耀提前使用了尚未掌握的术法',
                      currentText: '王耀抬手施展天衍术。',
                      priorEvidence: '第一章明确说明他尚未入门。[S1]',
                      suggestion: '改为依靠基础卜算，或补充获得术法的过程。',
                      sourceLabels: ['S1'],
                      memoryTitles: ['王耀的修行阶段'],
                    },
                  ],
                }),
              },
            },
          ],
        }),
      };
    }) as typeof fetch;

    try {
      const result = await createService().assistDraft(
        author,
        {
          ...dto,
          action: 'consistency',
          novelId: 'novel_1',
          beforeChapterOrder: 12,
        },
        credentials,
      );

      assert.equal(result.content, '发现一处人物能力设定冲突。');
      assert.equal(result.consistencyReport?.verdict, 'ISSUES_FOUND');
      assert.equal(result.consistencyReport?.issues[0].severity, 'CRITICAL');
      assert.equal(result.consistencyReport?.issues[0].category, 'POWER');
      assert.deepEqual(result.consistencyReport?.issues[0].sourceLabels, ['S1']);
      assert.match(requestBody, /Return JSON only/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('falls back to plain text when a consistency response is not valid JSON', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '未发现明显冲突。' } }] }),
    })) as typeof fetch;

    try {
      const result = await createService().assistDraft(
        author,
        {
          ...dto,
          action: 'consistency',
          novelId: 'novel_1',
          beforeChapterOrder: 12,
        },
        credentials,
      );

      assert.equal(result.content, '未发现明显冲突。');
      assert.equal(result.consistencyReport, undefined);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('requires the author to provide their own provider key', async () => {
    await assert.rejects(
      () =>
        createService().assistChapter(author, 'chapter_1', dto, {
          ...credentials,
          apiKey: '',
        }),
      ServiceUnavailableException,
    );
  });
});
