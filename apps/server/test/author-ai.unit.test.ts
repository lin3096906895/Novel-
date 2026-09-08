import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthorAiService } from '../src/modules/author/author-ai.service';
import { AuthorAiAssistanceDto } from '../src/modules/author/dto/author-ai-assistance.dto';

const author = {
  id: 'author_1',
  email: 'author@novel.local',
  role: UserRole.AUTHOR,
  sessionId: 'session_1',
};

function createService(authorId = author.id, apiKey = 'test-key') {
  return new AuthorAiService(
    {
      chapter: {
        findUnique: async () => ({ novel: { authorId } }),
      },
    } as never,
    {
      get: (name: string) => (name === 'DEEPSEEK_API_KEY' ? apiKey : undefined),
    } as never,
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
      const result = await createService().assistChapter(author, 'chapter_1', dto);
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
      () => createService('another_author').assistChapter(author, 'chapter_1', dto),
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
      const result = await createService().assistDraft(author, {
        action: 'research',
        title: '未命名章节',
        content: '这是一段足够长的创作思路，用于测试新章节保存前也可以调用 AI 辅助。',
        query: '古代客栈如何称呼掌柜？',
      });
      assert.equal(result.action, 'research');
      assert.match(requestBody, /Author question:/);
      assert.match(requestBody, /do not claim live web access/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('requires a server-side provider key', async () => {
    await assert.rejects(
      () => createService(author.id, '').assistChapter(author, 'chapter_1', dto),
      ServiceUnavailableException,
    );
  });
});
