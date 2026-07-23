import { UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AnnotationsService } from '../src/modules/annotations/annotations.service';

const user = {
  id: 'reader_1',
  email: 'reader@example.com',
  role: UserRole.READER,
};

describe('AnnotationsService', () => {
  it('creates a verified non-overlapping paragraph annotation', async () => {
    let createArgs: unknown;
    const service = new AnnotationsService({
      chapter: {
        findFirst: async () => ({ id: 'chapter_1', content: '凌晨三点，信号抵达。\n第二段。' }),
      },
      readingAnnotation: {
        findFirst: async () => null,
        create: async (args: unknown) => {
          createArgs = args;
          return { id: 'annotation_1' };
        },
      },
    } as never);

    const result = await service.create(user, 'chapter_1', {
      paragraphIndex: 0,
      startOffset: 0,
      endOffset: 4,
      selectedText: '凌晨三点',
      note: '  开场时间  ',
      color: 'YELLOW',
    });

    assert.deepEqual(result, { id: 'annotation_1' });
    assert.deepEqual(createArgs, {
      data: {
        userId: user.id,
        chapterId: 'chapter_1',
        paragraphIndex: 0,
        startOffset: 0,
        endOffset: 4,
        selectedText: '凌晨三点',
        note: '开场时间',
        color: 'YELLOW',
      },
    });
  });

  it('rejects a range that does not match the chapter text', async () => {
    const service = new AnnotationsService({
      chapter: {
        findFirst: async () => ({ id: 'chapter_1', content: '真实原文' }),
      },
    } as never);

    await assert.rejects(
      () =>
        service.create(user, 'chapter_1', {
          paragraphIndex: 0,
          startOffset: 0,
          endOffset: 2,
          selectedText: '伪造',
          color: 'GREEN',
        }),
      /划线范围与章节原文不匹配/,
    );
  });

  it('rejects overlapping highlights in the same paragraph', async () => {
    const service = new AnnotationsService({
      chapter: {
        findFirst: async () => ({ id: 'chapter_1', content: '凌晨三点，信号抵达。' }),
      },
      readingAnnotation: {
        findFirst: async () => ({ id: 'existing_annotation' }),
      },
    } as never);

    await assert.rejects(
      () =>
        service.create(user, 'chapter_1', {
          paragraphIndex: 0,
          startOffset: 0,
          endOffset: 4,
          selectedText: '凌晨三点',
          color: 'PINK',
        }),
      /所选文字已存在划线或批注/,
    );
  });
});
