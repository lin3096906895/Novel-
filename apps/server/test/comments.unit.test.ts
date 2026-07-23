import { NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CommentsService } from '../src/modules/comments/comments.service';

const reader = {
  id: 'reader_1',
  email: 'reader@example.com',
  role: UserRole.READER,
};

describe('CommentsService chapter comments', () => {
  it('deletes an admin comment batch independently and returns failures', async () => {
    const service = new CommentsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const deletedIds: string[] = [];
    Object.defineProperty(service, 'deleteAsAdmin', {
      value: async (id: string) => {
        deletedIds.push(id);
        if (id === 'missing') {
          throw new NotFoundException('Comment not found');
        }
        return { deleted: true };
      },
    });

    const result = await service.deleteManyAsAdmin(
      ['comment_1', 'missing', 'comment_2'],
      { id: 'admin_1', email: 'admin@example.com', role: UserRole.ADMIN },
    );

    assert.deepEqual(deletedIds, ['comment_1', 'missing', 'comment_2']);
    assert.equal(result.succeeded, 2);
    assert.equal(result.failed, 1);
    assert.equal(result.items[1]?.error, 'Comment not found');
  });

  it('keeps novel reviews separate from chapter comments', async () => {
    const calls: unknown[] = [];
    const service = new CommentsService(
      {
        novel: {
          findFirst: async () => ({ id: 'novel_1', title: '作品', authorId: 'author_1' }),
        },
        comment: {
          findMany: (args: unknown) => {
            calls.push(args);
            return Promise.resolve([]);
          },
          count: (args: unknown) => {
            calls.push(args);
            return Promise.resolve(0);
          },
        },
        $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
      } as never,
      {} as never,
      {} as never,
      { assertAllowed: async () => undefined } as never,
    );

    await service.listByNovel(undefined, 'novel_1', { page: 1, pageSize: 10 });

    assert.deepEqual((calls[0] as { where: unknown }).where, {
      novelId: 'novel_1',
      chapterId: null,
      parentId: null,
    });
    assert.deepEqual(calls[1], {
      where: { novelId: 'novel_1', chapterId: null, parentId: null },
    });
  });

  it('creates a chapter comment and notifies the author', async () => {
    let createArgs: unknown;
    let notificationArgs: unknown;
    const service = new CommentsService(
      {
        chapter: {
          findFirst: async () => ({
            id: 'chapter_1',
            title: '第一章',
            novelId: 'novel_1',
            novel: { id: 'novel_1', title: '作品', authorId: 'author_1' },
          }),
        },
        $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            comment: {
              create: async (args: unknown) => {
                createArgs = args;
                return {
                  id: 'comment_1',
                  userId: reader.id,
                  novelId: 'novel_1',
                  chapterId: 'chapter_1',
                  parentId: null,
                  content: '很精彩',
                  isDeleted: false,
                  createdAt: new Date(),
                  user: { id: reader.id, nickname: '读者', role: UserRole.READER },
                  likes: [],
                  _count: { likes: 0 },
                };
              },
            },
          }),
      } as never,
      {} as never,
      {
        create: async (args: unknown) => {
          notificationArgs = args;
        },
      } as never,
      { assertAllowed: async () => undefined } as never,
    );

    const result = await service.createForChapter(reader, 'chapter_1', { content: '  很精彩  ' });

    assert.equal(result.id, 'comment_1');
    assert.equal(result.isLiked, false);
    assert.deepEqual((createArgs as { data: unknown }).data, {
      userId: reader.id,
      novelId: 'novel_1',
      chapterId: 'chapter_1',
      parentId: undefined,
      content: '很精彩',
    });
    assert.deepEqual(notificationArgs, {
      userId: 'author_1',
      type: 'COMMENT',
      title: '章节收到新评论',
      content: '《作品》「第一章」收到一条新评论：很精彩',
      link: '/chapters/chapter_1',
    });
  });
});
