import { ForbiddenException } from '@nestjs/common';
import { NovelMemoryType, UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthorMemoryService } from '../src/modules/author/author-memory.service';
import type { RequestUser } from '../src/modules/auth/auth.types';

const author: RequestUser = {
  id: 'author_1',
  email: 'author@novel.local',
  role: UserRole.AUTHOR,
  sessionId: 'session_1',
};

describe('AuthorMemoryService', () => {
  it('creates and lists an owner-bound memory with source chapter context', async () => {
    let createdArgs: Record<string, any> | undefined;
    const service = new AuthorMemoryService({
      novel: { findUnique: async () => ({ id: 'novel_1', authorId: author.id }) },
      chapter: { findFirst: async () => ({ id: 'chapter_1' }) },
      novelMemory: {
        findFirst: async () => null,
        create: async (args: Record<string, any>) => {
          createdArgs = args;
          return { id: 'memory_1', ...args.data };
        },
        findMany: async () => [],
      },
    } as never);

    const result = await service.create(author, 'novel_1', {
      type: NovelMemoryType.CHARACTER,
      title: '林泊',
      content: '档案修复师',
      sourceChapterId: 'chapter_1',
      isConfirmed: true,
    });

    assert.equal(result.id, 'memory_1');
    assert.equal(createdArgs?.data.orderIndex, 0);
    assert.equal(createdArgs?.data.isConfirmed, true);
  });

  it('rejects a memory update when the novel belongs to another author', async () => {
    const service = new AuthorMemoryService({
      novelMemory: {
        findUnique: async () => ({ id: 'memory_1', novelId: 'novel_1' }),
      },
      novel: { findUnique: async () => ({ id: 'novel_1', authorId: 'author_2' }) },
    } as never);

    await assert.rejects(
      () => service.update(author, 'memory_1', { isConfirmed: true }),
      ForbiddenException,
    );
  });

  it('deletes an owned memory and returns a stable id', async () => {
    let deletedId = '';
    const service = new AuthorMemoryService({
      novelMemory: {
        findUnique: async () => ({ id: 'memory_1', novelId: 'novel_1' }),
        delete: async ({ where }: { where: { id: string } }) => {
          deletedId = where.id;
          return { id: where.id };
        },
      },
      novel: { findUnique: async () => ({ id: 'novel_1', authorId: author.id }) },
    } as never);

    assert.deepEqual(await service.delete(author, 'memory_1'), { deletedId: 'memory_1' });
    assert.equal(deletedId, 'memory_1');
  });
});
