import { ForbiddenException } from '@nestjs/common';
import {
  NovelMemoryConfidence,
  NovelMemoryDraftStatus,
  NovelMemoryType,
  UserRole,
} from '@prisma/client';
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

  it('persists extracted AI suggestions as pending review drafts', async () => {
    const created: Array<Record<string, any>> = [];
    const service = new AuthorMemoryService({
      novel: { findUnique: async () => ({ id: 'novel_1', authorId: author.id }) },
      chapter: { findFirst: async () => ({ id: 'chapter_1' }) },
      novelMemoryDraft: {
        create: async (args: Record<string, any>) => {
          created.push(args.data);
          return {
            id: `draft_${created.length}`,
            status: NovelMemoryDraftStatus.PENDING,
            ...args.data,
          };
        },
      },
      $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    } as never);

    const result = await service.saveExtractedDrafts(author, 'novel_1', 'chapter_1', [
      {
        type: NovelMemoryType.CHARACTER,
        title: ' 王耀 ',
        content: ' 擅长推演气运。 ',
        confidence: 'high',
        evidence: ' 他在山门前完成推演。 ',
      },
    ]);

    assert.equal(result.length, 1);
    assert.deepEqual(created[0], {
      novelId: 'novel_1',
      sourceChapterId: 'chapter_1',
      type: NovelMemoryType.CHARACTER,
      title: '王耀',
      content: '擅长推演气运。',
      confidence: NovelMemoryConfidence.HIGH,
      evidence: '他在山门前完成推演。',
    });
  });

  it('accepts a pending draft and creates a confirmed knowledge-base memory', async () => {
    const pendingDraft = {
      id: 'draft_1',
      novelId: 'novel_1',
      type: NovelMemoryType.CHARACTER,
      title: '王耀',
      content: '擅长推演气运。',
      sourceChapterId: 'chapter_1',
      status: NovelMemoryDraftStatus.PENDING,
    };
    let memoryCreateArgs: Record<string, any> | undefined;
    let draftUpdateArgs: Record<string, any> | undefined;
    let claimedStatus = NovelMemoryDraftStatus.PENDING;
    const transactionClient = {
      novelMemoryDraft: {
        updateMany: async ({ data }: { data: { status: NovelMemoryDraftStatus } }) => {
          claimedStatus = data.status;
          return { count: 1 };
        },
        findUniqueOrThrow: async () => ({ ...pendingDraft, status: claimedStatus }),
        update: async (args: Record<string, any>) => {
          draftUpdateArgs = args;
          return {
            ...pendingDraft,
            status: claimedStatus,
            ...args.data,
            acceptedMemory: { id: 'memory_1', isConfirmed: true },
          };
        },
      },
      novelMemory: {
        findFirst: async () => ({ orderIndex: 2 }),
        create: async (args: Record<string, any>) => {
          memoryCreateArgs = args;
          return { id: 'memory_1', ...args.data };
        },
      },
    };
    const service = new AuthorMemoryService({
      novel: { findUnique: async () => ({ id: 'novel_1', authorId: author.id }) },
      novelMemoryDraft: { findUnique: async () => pendingDraft },
      $transaction: async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
    } as never);

    const result = await service.reviewDraft(author, 'draft_1', { action: 'ACCEPT' });

    assert.deepEqual(memoryCreateArgs?.data, {
      novelId: 'novel_1',
      type: NovelMemoryType.CHARACTER,
      title: '王耀',
      content: '擅长推演气运。',
      sourceChapterId: 'chapter_1',
      isConfirmed: true,
      orderIndex: 3,
    });
    assert.equal(claimedStatus, NovelMemoryDraftStatus.ACCEPTED);
    assert.equal(draftUpdateArgs?.data.acceptedMemoryId, 'memory_1');
    assert.equal(result.status, NovelMemoryDraftStatus.ACCEPTED);
  });

  it('rejects a pending draft without creating a formal memory', async () => {
    let updatedStatus: NovelMemoryDraftStatus | undefined;
    const transactionClient = {
      novelMemoryDraft: {
        updateMany: async ({ data }: { data: { status: NovelMemoryDraftStatus } }) => {
          updatedStatus = data.status;
          return { count: 1 };
        },
        findUniqueOrThrow: async () => ({
          id: 'draft_1',
          status: updatedStatus,
        }),
      },
    };
    const service = new AuthorMemoryService({
      novel: { findUnique: async () => ({ id: 'novel_1', authorId: author.id }) },
      novelMemoryDraft: {
        findUnique: async () => ({
          id: 'draft_1',
          novelId: 'novel_1',
          status: NovelMemoryDraftStatus.PENDING,
        }),
      },
      $transaction: async (callback: (tx: typeof transactionClient) => Promise<unknown>) =>
        callback(transactionClient),
    } as never);

    const result = await service.reviewDraft(author, 'draft_1', { action: 'REJECT' });

    assert.equal(updatedStatus, NovelMemoryDraftStatus.REJECTED);
    assert.equal(result.status, NovelMemoryDraftStatus.REJECTED);
  });
});
