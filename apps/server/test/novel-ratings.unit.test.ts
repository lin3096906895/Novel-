import { UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NovelRatingsService } from '../src/modules/novels/novel-ratings.service';

const reader = {
  id: 'reader_1',
  email: 'reader@example.com',
  role: UserRole.READER,
  sessionId: 'session_1',
};

describe('NovelRatingsService', () => {
  it('returns an average, distribution, count, and current account score', async () => {
    const service = new NovelRatingsService({
      novel: { findFirst: async () => ({ id: 'novel_1' }) },
      novelRating: {
        aggregate: async () => ({ _avg: { score: 4.25 } }),
        count: async () => 4,
        groupBy: async () => [
          { score: 5, _count: { score: 2 } },
          { score: 4, _count: { score: 1 } },
          { score: 3, _count: { score: 1 } },
        ],
        findUnique: async () => ({ score: 5 }),
      },
    } as never);

    const result = await service.summary(reader, 'novel_1');

    assert.deepEqual(result, {
      average: 4.3,
      count: 4,
      distribution: { 1: 0, 2: 0, 3: 1, 4: 1, 5: 2 },
      myScore: 5,
    });
  });

  it('upserts one score per account and novel', async () => {
    let upsertArgs: unknown;
    const prisma = {
      novel: { findFirst: async () => ({ id: 'novel_1' }) },
      novelRating: {
        upsert: async (args: unknown) => {
          upsertArgs = args;
        },
        aggregate: async () => ({ _avg: { score: 4 } }),
        count: async () => 1,
        groupBy: async () => [{ score: 4, _count: { score: 1 } }],
        findUnique: async () => ({ score: 4 }),
      },
    };
    const service = new NovelRatingsService(prisma as never);

    const result = await service.save(reader, 'novel_1', 4);

    assert.equal(result.myScore, 4);
    assert.deepEqual(upsertArgs, {
      where: { userId_novelId: { userId: reader.id, novelId: 'novel_1' } },
      create: { userId: reader.id, novelId: 'novel_1', score: 4 },
      update: { score: 4 },
    });
  });
});
