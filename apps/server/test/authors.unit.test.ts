import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NovelStatus, UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthorsService } from '../src/modules/authors/authors.service';

const reader = {
  id: 'reader_1',
  email: 'reader@novel.local',
  role: UserRole.READER,
  sessionId: 'session_1',
};

function createService(prismaOverrides: Record<string, unknown>) {
  return new AuthorsService(prismaOverrides as never);
}

describe('AuthorsService public profiles', () => {
  it('returns public works, aggregate stats, and the viewer follow state', async () => {
    const service = createService({
      user: {
        findFirst: async () => ({
          id: 'author_1',
          nickname: '作者昵称',
          createdAt: new Date('2025-01-01T00:00:00.000Z'),
          authorProfile: {
            penName: '公开笔名',
            bio: '作者简介',
            createdAt: new Date('2025-02-01T00:00:00.000Z'),
          },
          novels: [
            {
              id: 'novel_1',
              status: NovelStatus.SERIALIZING,
              wordCount: 1200,
              _count: { chapters: 3, bookshelf: 8, comments: 2 },
            },
            {
              id: 'novel_2',
              status: NovelStatus.COMPLETED,
              wordCount: 2400,
              _count: { chapters: 6, bookshelf: 12, comments: 4 },
            },
          ],
        }),
      },
      authorFollow: {
        count: async () => 15,
        findUnique: async () => ({ id: 'follow_1' }),
      },
    });

    const result = await service.getPublicProfile(reader, 'author_1');

    assert.equal(result.penName, '公开笔名');
    assert.equal(result.isFollowing, true);
    assert.deepEqual(result.stats, {
      followers: 15,
      works: 2,
      words: 3600,
      chapters: 9,
      bookshelf: 20,
    });
  });

  it('rejects a missing or non-public author', async () => {
    const service = createService({ user: { findFirst: async () => null } });
    await assert.rejects(
      () => service.getPublicProfile(undefined, 'missing_author'),
      NotFoundException,
    );
  });
});

describe('AuthorsService following', () => {
  it('rejects following the current account', async () => {
    const service = createService({});
    await assert.rejects(() => service.follow(reader, reader.id), BadRequestException);
  });

  it('follows an active public author idempotently', async () => {
    let upsertArgs: unknown;
    const service = createService({
      user: { findFirst: async () => ({ id: 'author_1' }) },
      authorFollow: {
        upsert: async (args: unknown) => {
          upsertArgs = args;
          return { id: 'follow_1' };
        },
        count: async () => 4,
      },
    });

    const result = await service.follow(reader, 'author_1');

    assert.deepEqual(result, { authorId: 'author_1', isFollowing: true, followerCount: 4 });
    assert.deepEqual(upsertArgs, {
      where: { followerId_authorId: { followerId: reader.id, authorId: 'author_1' } },
      create: { followerId: reader.id, authorId: 'author_1' },
      update: {},
    });
  });
});
