import { UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ParagraphCommentsService } from '../src/modules/comments/paragraph-comments.service';

const reader = {
  id: 'reader_1',
  email: 'reader@example.com',
  role: UserRole.READER,
};

const publicChapter = {
  id: 'chapter_1',
  title: '第一章',
  content: '第一段\n第二段',
  novel: { title: '测试作品', authorId: 'author_1' },
};

describe('ParagraphCommentsService', () => {
  it('summarizes visible comments by paragraph', async () => {
    const service = new ParagraphCommentsService(
      {
        chapter: { findFirst: async () => publicChapter },
        paragraphComment: {
          groupBy: async () => [
            { paragraphIndex: 0, _count: { _all: 2 } },
            { paragraphIndex: 1, _count: { _all: 1 } },
          ],
        },
      } as never,
      {} as never,
      { assertAllowed: async () => undefined } as never,
    );

    const result = await service.summary('chapter_1');

    assert.deepEqual(result, {
      items: [
        { paragraphIndex: 0, count: 2 },
        { paragraphIndex: 1, count: 1 },
      ],
      total: 3,
    });
  });

  it('creates a reply under a root comment and notifies its owner', async () => {
    let createArgs: unknown;
    let notificationArgs: unknown;
    const service = new ParagraphCommentsService(
      {
        chapter: { findFirst: async () => publicChapter },
        paragraphComment: {
          findFirst: async () => ({ id: 'root_1', userId: 'reader_2' }),
        },
        $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            paragraphComment: {
              create: async (args: unknown) => {
                createArgs = args;
                return {
                  id: 'reply_1',
                  userId: reader.id,
                  chapterId: 'chapter_1',
                  paragraphIndex: 0,
                  parentId: 'root_1',
                  content: '回复内容',
                  isDeleted: false,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  user: { id: reader.id, nickname: '读者', role: UserRole.READER },
                  likes: [],
                  _count: { likes: 0 },
                };
              },
            },
          }),
      } as never,
      {
        create: async (args: unknown) => {
          notificationArgs = args;
        },
      } as never,
      { assertAllowed: async () => undefined } as never,
    );

    const result = await service.create(reader, 'chapter_1', 0, {
      content: ' 回复内容 ',
      parentId: 'root_1',
    });

    assert.deepEqual(createArgs, {
      data: {
        userId: reader.id,
        chapterId: 'chapter_1',
        paragraphIndex: 0,
        parentId: 'root_1',
        content: '回复内容',
      },
      include: {
        user: { select: { id: true, nickname: true, role: true } },
        likes: { select: { userId: true } },
        _count: { select: { likes: true } },
      },
    });
    assert.equal(result.parentId, 'root_1');
    assert.deepEqual(notificationArgs, {
      userId: 'reader_2',
      type: 'COMMENT',
      title: '你的段评收到新回复',
      content: '回复内容',
      link: '/chapters/chapter_1?paragraph=0',
    });
  });

  it('soft deletes a root comment when replies still exist', async () => {
    let updateArgs: unknown;
    const service = new ParagraphCommentsService(
      {
        paragraphComment: {
          findFirst: async () => ({
            id: 'root_1',
            parentId: null,
            isDeleted: false,
            _count: { replies: 2 },
          }),
          update: async (args: unknown) => {
            updateArgs = args;
          },
        },
      } as never,
      {} as never,
      { assertAllowed: async () => undefined } as never,
    );

    const result = await service.remove(reader, 'root_1');

    assert.deepEqual(updateArgs, {
      where: { id: 'root_1' },
      data: { isDeleted: true, content: '' },
    });
    assert.deepEqual(result, { id: 'root_1', deleted: true, softDeleted: true });
  });
});
