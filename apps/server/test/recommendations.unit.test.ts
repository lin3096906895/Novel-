import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RecommendationsService } from '../src/modules/recommendations/recommendations.service';

const user = {
  id: 'reader_1',
  email: 'reader@example.com',
  role: 'READER',
} as const;

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'candidate_1',
    title: '星海回声',
    summary: '测试简介',
    coverUrl: null,
    status: 'SERIALIZING',
    wordCount: 12000,
    authorId: 'author_1',
    categoryId: 'category_scifi',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date(),
    author: { id: 'author_1', nickname: '作者' },
    category: {
      id: 'category_scifi',
      name: '科幻',
      channel: 'male',
      sortOrder: 1,
      createdAt: new Date(),
    },
    tags: [{ id: 'tag_space', name: '星际' }],
    _count: { chapters: 10, comments: 3, bookshelf: 5 },
    ...overrides,
  };
}

describe('RecommendationsService personalized recommendations', () => {
  it('prioritizes candidates matching bookshelf and reading preferences', async () => {
    let candidateQuery: { where?: { id?: { notIn?: string[] } } } | undefined;
    const service = new RecommendationsService(
      {
        readingHistory: {
          findMany: async () => [
            {
              novelId: 'read_novel',
              novel: {
                category: { id: 'category_scifi', name: '科幻' },
                tags: [{ id: 'tag_space', name: '星际' }],
              },
            },
          ],
        },
        bookshelfItem: {
          findMany: async () => [
            {
              novelId: 'shelf_novel',
              novel: {
                category: { id: 'category_scifi', name: '科幻' },
                tags: [{ id: 'tag_space', name: '星际' }],
              },
            },
          ],
        },
        novel: {
          findMany: async (args: typeof candidateQuery) => {
            candidateQuery = args;
            return [
              candidate(),
              candidate({
                id: 'candidate_2',
                title: '都市日常',
                categoryId: 'category_city',
                category: {
                  id: 'category_city',
                  name: '都市',
                  channel: 'male',
                  sortOrder: 2,
                  createdAt: new Date(),
                },
                tags: [],
                _count: { chapters: 20, comments: 20, bookshelf: 20 },
              }),
            ];
          },
        },
        $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
      } as never,
      {} as never,
    );

    const result = await service.findPersonalized(user as never, { limit: 6 });

    assert.equal(result.source, 'personalized');
    assert.deepEqual(result.basis.categories, ['科幻']);
    assert.deepEqual(result.basis.tags, ['星际']);
    assert.deepEqual(candidateQuery?.where?.id?.notIn, ['read_novel', 'shelf_novel']);
    assert.equal(result.items[0]?.novel.id, 'candidate_1');
    assert.equal(result.items[0]?.reason, '因为你常读科幻');
    assert.deepEqual(result.items[0]?.matchedTags, ['星际']);
  });

  it('falls back to active public novels for a new account', async () => {
    const service = new RecommendationsService(
      {
        readingHistory: { findMany: async () => [] },
        bookshelfItem: { findMany: async () => [] },
        novel: { findMany: async () => [candidate()] },
        $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
      } as never,
      {} as never,
    );

    const result = await service.findPersonalized(user as never, { limit: 3 });

    assert.equal(result.source, 'fallback');
    assert.equal(result.items[0]?.reason, '近期活跃作品');
  });
});
