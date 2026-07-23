import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SearchService } from '../src/modules/search/search.service';

const user = {
  id: 'reader_1',
  email: 'reader@example.com',
  role: 'READER',
} as const;

describe('SearchService', () => {
  it('normalizes a search and records global and account history counters', async () => {
    let termArgs: unknown;
    let historyArgs: unknown;
    const tx = {
      searchTerm: {
        upsert: async (args: unknown) => {
          termArgs = args;
          return { keyword: '星河 旧约', searchCount: 3 };
        },
      },
      searchHistory: {
        upsert: async (args: unknown) => {
          historyArgs = args;
          return { id: 'history_1', keyword: '星河 旧约', searchCount: 2 };
        },
      },
    };
    const service = new SearchService({
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as never);

    const result = await service.record(user as never, { keyword: '  星河   旧约  ' });

    assert.equal(result.keyword, '星河 旧约');
    assert.equal(result.searchCount, 3);
    assert.equal(result.history?.id, 'history_1');
    assert.deepEqual(termArgs, {
      where: { keyword: '星河 旧约' },
      update: {
        searchCount: { increment: 1 },
        lastSearchedAt: (termArgs as { update: { lastSearchedAt: Date } }).update.lastSearchedAt,
      },
      create: {
        keyword: '星河 旧约',
        lastSearchedAt: (termArgs as { create: { lastSearchedAt: Date } }).create.lastSearchedAt,
      },
    });
    assert.equal(
      (historyArgs as { where: { userId_keyword: { userId: string } } }).where.userId_keyword
        .userId,
      user.id,
    );
  });

  it('records anonymous searches without creating account history', async () => {
    let historyCalled = false;
    const tx = {
      searchTerm: {
        upsert: async () => ({ keyword: '科幻', searchCount: 1 }),
      },
      searchHistory: {
        upsert: async () => {
          historyCalled = true;
        },
      },
    };
    const service = new SearchService({
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    } as never);

    const result = await service.record(undefined, { keyword: '科幻' });

    assert.equal(result.history, null);
    assert.equal(historyCalled, false);
  });

  it('combines public novel, author, and tag suggestions within the limit', async () => {
    const service = new SearchService({
      novel: {
        findMany: async () => [
          {
            id: 'novel_1',
            title: '星河旧约',
            author: { nickname: '南城纸伞' },
            category: { name: '科幻' },
          },
        ],
      },
      user: {
        findMany: async () => [{ id: 'author_1', nickname: '星河作者' }],
      },
      tag: {
        findMany: async () => [{ id: 'tag_1', name: '星际' }],
      },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    } as never);

    const result = await service.suggestions({ keyword: '星', limit: 3 });

    assert.deepEqual(
      result.map((item) => [item.type, item.label]),
      [
        ['novel', '星河旧约'],
        ['author', '星河作者'],
        ['tag', '星际'],
      ],
    );
  });

  it('only deletes search history owned by the current account', async () => {
    let deleteArgs: unknown;
    const service = new SearchService({
      searchHistory: {
        deleteMany: async (args: unknown) => {
          deleteArgs = args;
          return { count: 1 };
        },
      },
    } as never);

    assert.deepEqual(await service.removeHistory(user as never, 'history_1'), { deleted: true });
    assert.deepEqual(deleteArgs, { where: { id: 'history_1', userId: user.id } });
  });
});
