import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RankingsService } from '../src/modules/rankings/rankings.service';

const novels = [
  {
    id: 'novel_1',
    title: '第一本书',
    summary: '简介一',
    coverUrl: null,
    status: 'SERIALIZING',
    wordCount: 12000,
    authorId: 'author_1',
    categoryId: 'category_1',
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-10T00:00:00.000Z'),
    author: { id: 'author_1', nickname: '作者一' },
    category: {
      id: 'category_1',
      name: '玄幻',
      channel: 'male',
      sortOrder: 1,
      createdAt: new Date(),
    },
    tags: [],
    _count: { chapters: 1, comments: 0, bookshelf: 0 },
  },
  {
    id: 'novel_2',
    title: '第二本书',
    summary: '简介二',
    coverUrl: null,
    status: 'COMPLETED',
    wordCount: 8000,
    authorId: 'author_1',
    categoryId: 'category_1',
    createdAt: new Date('2026-07-02T00:00:00.000Z'),
    updatedAt: new Date('2026-07-11T00:00:00.000Z'),
    author: { id: 'author_1', nickname: '作者一' },
    category: {
      id: 'category_1',
      name: '玄幻',
      channel: 'male',
      sortOrder: 1,
      createdAt: new Date(),
    },
    tags: [],
    _count: { chapters: 1, comments: 0, bookshelf: 0 },
  },
];

describe('RankingsService', () => {
  it('ranks popular novels by completed chapter reads in the selected period', async () => {
    let groupByArgs: { where?: { completedAt?: { gte?: Date } } } | undefined;
    const service = new RankingsService({
      novel: { findMany: async () => novels },
      chapter: {
        findMany: async () => [
          { id: 'chapter_1', novelId: 'novel_1' },
          { id: 'chapter_2', novelId: 'novel_2' },
        ],
      },
      chapterRead: {
        groupBy: async (args: typeof groupByArgs) => {
          groupByArgs = args;
          return [
            { chapterId: 'chapter_1', _count: { _all: 1 } },
            { chapterId: 'chapter_2', _count: { _all: 3 } },
          ];
        },
      },
    } as never);

    const result = await service.list({ type: 'popular', period: 'week', limit: 20 });

    assert.equal(result.period, 'week');
    assert.equal(result.periodLabel, '周榜');
    assert.equal(result.scoreLabel, '阅读章次');
    assert.ok(result.startedAt);
    assert.equal(groupByArgs?.where?.completedAt?.gte instanceof Date, true);
    assert.deepEqual(
      result.items.map((item) => [item.novel.id, item.score]),
      [
        ['novel_2', 3],
        ['novel_1', 1],
      ],
    );
  });

  it('uses period-created bookshelf records instead of all-time relation counts', async () => {
    let groupByArgs: { where?: { createdAt?: { gte?: Date } } } | undefined;
    const service = new RankingsService({
      novel: { findMany: async () => novels },
      bookshelfItem: {
        groupBy: async (args: typeof groupByArgs) => {
          groupByArgs = args;
          return [
            { novelId: 'novel_1', _count: { _all: 5 } },
            { novelId: 'novel_2', _count: { _all: 2 } },
          ];
        },
      },
    } as never);

    const result = await service.list({ type: 'bookshelf', period: 'month' });

    assert.equal(groupByArgs?.where?.createdAt?.gte instanceof Date, true);
    assert.deepEqual(
      result.items.map((item) => [item.novel.id, item.score]),
      [
        ['novel_1', 5],
        ['novel_2', 2],
      ],
    );
  });

  it('filters new novels by the selected natural period', async () => {
    let findManyArgs: { where?: { createdAt?: { gte?: Date } } } | undefined;
    const service = new RankingsService({
      novel: {
        findMany: async (args: typeof findManyArgs) => {
          findManyArgs = args;
          return [...novels].reverse();
        },
      },
    } as never);

    const result = await service.list({ type: 'new', period: 'day' });

    assert.equal(findManyArgs?.where?.createdAt?.gte instanceof Date, true);
    assert.equal(result.items[0]?.novel.id, 'novel_2');
    assert.equal(result.items[0]?.score, novels[1].createdAt.toISOString());
  });
});
