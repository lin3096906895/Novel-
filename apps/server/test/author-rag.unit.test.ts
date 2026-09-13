import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthorRagService } from '../src/modules/author/author-rag.service';

function createService(enabled = 'true') {
  return new AuthorRagService({
    get: (name: string) => {
      if (name === 'RAG_ENABLED') return enabled;
      if (name === 'RAG_SERVICE_URL') return 'http://rag.test';
      if (name === 'INTERNAL_RAG_TOKEN') return 'internal-token';
      return undefined;
    },
  } as never);
}

describe('AuthorRagService', () => {
  it('uses GET for the novel index status endpoint', async () => {
    const originalFetch = globalThis.fetch;
    let requestUrl = '';
    let requestInit: RequestInit | undefined;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      requestUrl = String(url);
      requestInit = init;
      return {
        ok: true,
        json: async () => ({
          novelId: 'novel/with space',
          chapterCount: 100,
          indexedChapterCount: 100,
          pendingChapterCount: 0,
          chunkCount: 313,
          indexedCharacterCount: 244840,
          lastIndexedAt: '2026-09-08T08:12:11.545Z',
          embeddingMode: 'local_hashing',
          embeddingModel: 'local-hashing-zh-1024',
        }),
      };
    }) as typeof fetch;

    try {
      const status = await createService().getNovelIndexStatus('novel/with space');
      assert.equal(requestUrl, 'http://rag.test/v1/index/novel/novel%2Fwith%20space');
      assert.equal(requestInit?.method, 'GET');
      assert.equal(requestInit?.body, undefined);
      assert.equal((requestInit?.headers as Record<string, string>).Authorization, 'Bearer internal-token');
      assert.equal(status.enabled, true);
      assert.equal(status.chunkCount, 313);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('posts the requested chapter boundary when rebuilding a novel index', async () => {
    const originalFetch = globalThis.fetch;
    let requestBody = '';
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body);
      return {
        ok: true,
        json: async () => ({ indexedChapters: 100, indexedChunks: 313 }),
      };
    }) as typeof fetch;

    try {
      const result = await createService().indexNovel({
        novelId: 'novel_1',
        maxChapterOrder: 100,
      });
      assert.deepEqual(JSON.parse(requestBody), {
        novelId: 'novel_1',
        maxChapterOrder: 100,
      });
      assert.equal(result.indexedChunks, 313);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('returns a disabled status without calling the RAG service', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('fetch should not be called');
    }) as typeof fetch;

    try {
      const status = await createService('false').getNovelIndexStatus('novel_1');
      assert.equal(status.enabled, false);
      assert.equal(status.pendingChapterCount, 0);
      assert.equal(status.embeddingMode, 'disabled');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('passes the unpublished-content flag for author continuity retrieval', async () => {
    const originalFetch = globalThis.fetch;
    let requestBody = '';
    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = String(init?.body);
      return { ok: true, json: async () => ({ items: [] }) };
    }) as typeof fetch;

    try {
      await createService().retrieve({
        novelId: 'novel_1',
        query: '人物关系',
        topK: 6,
        maxChapterOrder: 12,
        includeUnpublished: true,
      });
      assert.deepEqual(JSON.parse(requestBody), {
        novelId: 'novel_1',
        query: '人物关系',
        topK: 6,
        maxChapterOrder: 12,
        includeUnpublished: true,
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
