import { ChapterStatus, UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthorService } from '../src/modules/author/author.service';

const author = {
  id: 'author_1',
  email: 'author@novel.local',
  role: UserRole.AUTHOR,
};

describe('AuthorService RAG evaluation', () => {
  it('evaluates sampled published chapters and reports hit rates', async () => {
    const status = {
      enabled: true,
      novelId: 'novel_1',
      chapterCount: 3,
      indexedChapterCount: 3,
      pendingChapterCount: 0,
      chunkCount: 6,
      indexedCharacterCount: 4200,
      lastIndexedAt: '2026-09-13T00:00:00.000Z',
      embeddingMode: 'local_hashing',
      embeddingModel: 'local-hashing-zh-1024',
    };
    const chapters = [
      { id: 'chapter_1', title: '第一章 山门', content: '王耀走进山门。', orderIndex: 1 },
      { id: 'chapter_2', title: '第二章 雨夜', content: '韩清在雨夜回头。', orderIndex: 2 },
      { id: 'chapter_3', title: '第三章 玉佩', content: '石阶上留下一枚玉佩。', orderIndex: 3 },
    ];
    const retrievals: Array<Record<string, unknown>> = [];
    const rag = {
      getNovelIndexStatus: async () => status,
      retrieve: async (input: Record<string, unknown>) => {
        retrievals.push(input);
        const query = String(input.query);
        if (query.includes('第一章')) {
          return [
            { chapterId: 'chapter_1', chapterOrder: 1, chunkIndex: 0 },
            { chapterId: 'chapter_1', chapterOrder: 1, chunkIndex: 1 },
          ];
        }
        if (query.includes('第二章')) {
          return [
            { chapterId: 'chapter_1', chapterOrder: 1, chunkIndex: 0 },
            { chapterId: 'chapter_2', chapterOrder: 2, chunkIndex: 0 },
          ];
        }
        return [{ chapterId: 'chapter_1', chapterOrder: 1, chunkIndex: 0 }];
      },
    };
    const service = new AuthorService(
      {
        novel: { findUnique: async () => ({ id: 'novel_1', authorId: author.id }) },
        chapter: {
          findMany: async () => chapters,
        },
      } as never,
      {} as never,
      {} as never,
      rag as never,
    );

    const result = await service.evaluateNovelRag(author, 'novel_1');

    assert.equal(result.sampleSize, 3);
    assert.equal(result.evaluatedCases, 3);
    assert.equal(result.hitAt1, 1);
    assert.equal(result.hitAt3, 2);
    assert.equal(result.hitAt5, 2);
    assert.equal(result.averageRank, 1.5);
    assert.deepEqual(
      result.cases.map((item) => item.rank),
      [1, 2, null],
    );
    assert.equal(retrievals.length, 3);
    assert.equal(retrievals[0].maxChapterOrder, 1);
    assert.equal(retrievals[0].topK, 5);
    assert.equal(retrievals[0].includeUnpublished, undefined);
    assert.equal(result.status, status);
  });

  it('only evaluates published chapters', async () => {
    let findManyArgs: Record<string, unknown> | undefined;
    const service = new AuthorService(
      {
        novel: { findUnique: async () => ({ id: 'novel_1', authorId: author.id }) },
        chapter: {
          findMany: async (args: Record<string, unknown>) => {
            findManyArgs = args;
            return [];
          },
        },
      } as never,
      {} as never,
      {} as never,
      {
        getNovelIndexStatus: async () => ({ enabled: true }),
        retrieve: async () => [],
      } as never,
    );

    const result = await service.evaluateNovelRag(author, 'novel_1');

    assert.equal(result.evaluatedCases, 0);
    assert.deepEqual(findManyArgs?.where, {
      novelId: 'novel_1',
      deletedAt: null,
      status: ChapterStatus.PUBLISHED,
    });
  });
});
