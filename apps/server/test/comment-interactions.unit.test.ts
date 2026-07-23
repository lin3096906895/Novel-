import { UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { removeCommentPreservingReplies } from '../src/modules/comments/comment-removal';
import { CommentsService } from '../src/modules/comments/comments.service';

const reader = {
  id: 'reader_1',
  email: 'reader@example.com',
  role: UserRole.READER,
  sessionId: 'session_1',
};

describe('CommentsService ordinary comment interactions', () => {
  it('creates a one-level reply and notifies the root comment owner', async () => {
    let createArgs: unknown;
    let notificationArgs: unknown;
    const tx = {
      comment: {
        create: async (args: unknown) => {
          createArgs = args;
          return {
            id: 'reply_1',
            userId: reader.id,
            novelId: 'novel_1',
            chapterId: null,
            parentId: 'comment_1',
            content: '回复内容',
            isDeleted: false,
            createdAt: new Date(),
            user: { id: reader.id, nickname: '读者', role: UserRole.READER },
            likes: [],
            _count: { likes: 0 },
          };
        },
      },
    };
    const service = new CommentsService(
      {
        novel: {
          findFirst: async () => ({ id: 'novel_1', title: '作品', authorId: 'author_1' }),
        },
        comment: {
          findFirst: async () => ({ id: 'comment_1', userId: 'root_owner' }),
        },
        $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
      } as never,
      {} as never,
      {
        create: async (args: unknown) => {
          notificationArgs = args;
        },
      } as never,
      { assertAllowed: async () => undefined } as never,
    );

    const result = await service.create(reader, 'novel_1', {
      content: '回复内容',
      parentId: 'comment_1',
    });

    assert.equal(result.parentId, 'comment_1');
    assert.equal((createArgs as { data: { parentId: string } }).data.parentId, 'comment_1');
    assert.deepEqual(notificationArgs, {
      userId: 'root_owner',
      type: 'COMMENT',
      title: '你的书评收到新回复',
      content: '回复内容',
      link: '/novels/novel_1',
    });
  });

  it('likes a public comment idempotently', async () => {
    let upsertArgs: unknown;
    const service = new CommentsService(
      {
        comment: { findFirst: async () => ({ id: 'comment_1' }) },
        commentLike: {
          upsert: async (args: unknown) => {
            upsertArgs = args;
          },
          count: async () => 3,
        },
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.like(reader, 'comment_1');

    assert.deepEqual(result, { commentId: 'comment_1', isLiked: true, likeCount: 3 });
    assert.deepEqual(upsertArgs, {
      where: { userId_commentId: { userId: reader.id, commentId: 'comment_1' } },
      create: { userId: reader.id, commentId: 'comment_1' },
      update: {},
    });
  });
});

describe('ordinary comment deletion', () => {
  it('soft deletes a root comment when replies still exist', async () => {
    const operations: string[] = [];
    const tx = {
      comment: {
        findUnique: async () => ({
          id: 'comment_1',
          parentId: null,
          isDeleted: false,
          _count: { replies: 2 },
        }),
        update: async () => {
          operations.push('comment.update');
        },
      },
      commentLike: {
        deleteMany: async () => {
          operations.push('likes.deleteMany');
        },
      },
    };

    const result = await removeCommentPreservingReplies(tx as never, 'comment_1');

    assert.deepEqual(result, { deleted: true, softDeleted: true });
    assert.deepEqual(operations, ['likes.deleteMany', 'comment.update']);
  });
});
