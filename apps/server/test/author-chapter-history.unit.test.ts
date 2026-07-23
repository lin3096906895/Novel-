import { ChapterStatus, ChapterVersionSource, UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthorService } from '../src/modules/author/author.service';

const author = {
  id: 'author_1',
  email: 'author@novel.local',
  role: UserRole.AUTHOR,
};

const currentChapter = {
  id: 'chapter_1',
  novelId: 'novel_1',
  volumeId: null,
  title: '第一章 旧标题',
  content: '这是保存前的章节内容',
  wordCount: 10,
  scheduledAt: null,
  status: ChapterStatus.DRAFT,
  novel: { authorId: author.id },
};

function createService(
  prismaOverrides: Record<string, unknown>,
  sensitiveWordsOverrides: Record<string, unknown> = { assertAllowed: async () => undefined },
) {
  return new AuthorService(prismaOverrides as never, {} as never, sensitiveWordsOverrides as never);
}

function createUpdateTransaction(calls: Record<string, unknown>, recentAutosave = false) {
  return {
    chapterVersion: {
      findFirst: async (args: { where: { source?: ChapterVersionSource } }) => {
        if (args.where.source === ChapterVersionSource.AUTOSAVE && recentAutosave) {
          return { id: 'recent_autosave' };
        }
        return null;
      },
      create: async (args: unknown) => {
        calls.versionCreate = args;
        return { id: 'version_1' };
      },
    },
    chapter: {
      update: async (args: unknown) => {
        calls.chapterUpdate = args;
        return { id: 'chapter_1', status: ChapterStatus.DRAFT };
      },
    },
  };
}

describe('AuthorService chapter snapshots', () => {
  it('records a manual snapshot before changing an editable chapter', async () => {
    const calls: Record<string, unknown> = {};
    const tx = createUpdateTransaction(calls);
    const service = createService({
      chapter: { findUnique: async () => currentChapter },
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    });

    await service.updateChapter(author, currentChapter.id, {
      title: '第一章 新标题',
      content: '这是手动保存后的章节内容',
      action: 'save',
      saveSource: 'manual',
    });

    const version = calls.versionCreate as {
      data: { title: string; content: string; source: ChapterVersionSource };
    };
    assert.equal(version.data.title, currentChapter.title);
    assert.equal(version.data.content, currentChapter.content);
    assert.equal(version.data.source, ChapterVersionSource.MANUAL);
  });

  it('records a submit snapshot and runs content moderation', async () => {
    const calls: Record<string, unknown> = {};
    const tx = createUpdateTransaction(calls);
    let moderationCalls = 0;
    const service = createService(
      {
        chapter: { findUnique: async () => currentChapter },
        $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
      },
      {
        assertAllowed: async () => {
          moderationCalls += 1;
        },
      },
    );

    await service.updateChapter(author, currentChapter.id, {
      title: '第一章 提交标题',
      content: '这是一段长度足够并且可以提交审核的完整章节测试正文内容。',
      action: 'submit',
    });

    assert.equal(moderationCalls, 1);
    assert.equal(
      (calls.versionCreate as { data: { source: ChapterVersionSource } }).data.source,
      ChapterVersionSource.SUBMIT,
    );
  });

  it('throttles autosave snapshots inside the ten minute window', async () => {
    const calls: Record<string, unknown> = {};
    const tx = createUpdateTransaction(calls, true);
    const service = createService({
      chapter: { findUnique: async () => currentChapter },
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    });

    await service.updateChapter(author, currentChapter.id, {
      title: '第一章 自动保存',
      content: '自动保存后的正文',
      action: 'save',
      saveSource: 'autosave',
    });

    assert.equal(calls.versionCreate, undefined);
    assert.ok(calls.chapterUpdate);
  });

  it('snapshots the current chapter before restoring an older version', async () => {
    const calls: Record<string, unknown> = {};
    const version = {
      id: 'version_old',
      chapterId: currentChapter.id,
      title: '第一章 历史标题',
      content: '历史版本正文',
      volumeId: null,
      scheduledAt: null,
      wordCount: 6,
      source: ChapterVersionSource.MANUAL,
      createdAt: new Date(),
    };
    const tx = createUpdateTransaction(calls);
    const service = createService({
      chapter: { findFirst: async () => currentChapter },
      chapterVersion: { findFirst: async () => version },
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    });

    await service.restoreChapterVersion(author, currentChapter.id, version.id);

    assert.equal(
      (calls.versionCreate as { data: { source: ChapterVersionSource } }).data.source,
      ChapterVersionSource.RESTORE,
    );
    assert.deepEqual((calls.chapterUpdate as { data: unknown }).data, {
      title: version.title,
      content: version.content,
      wordCount: version.wordCount,
      volumeId: null,
      scheduledAt: null,
      status: ChapterStatus.DRAFT,
      publishedAt: null,
    });
  });
});

describe('AuthorService chapter recycle bin', () => {
  it('restores a deleted chapter at the end of the active chapter list', async () => {
    let findFirstCall = 0;
    let updateArgs: unknown;
    const service = createService({
      chapter: {
        findFirst: async () => {
          findFirstCall += 1;
          return findFirstCall === 1
            ? {
                id: currentChapter.id,
                novelId: currentChapter.novelId,
                status: ChapterStatus.DRAFT,
                novel: { authorId: author.id },
              }
            : { orderIndex: 3 };
        },
        update: async (args: unknown) => {
          updateArgs = args;
          return { id: currentChapter.id, orderIndex: 4, deletedAt: null };
        },
      },
    });

    const restored = await service.restoreDeletedChapter(author, currentChapter.id);

    assert.equal(restored.orderIndex, 4);
    assert.deepEqual((updateArgs as { data: unknown }).data, {
      deletedAt: null,
      orderIndex: 4,
    });
  });

  it('permanently deletes only a chapter already in the recycle bin', async () => {
    const operations: string[] = [];
    const tx = {
      reviewLog: {
        deleteMany: async () => {
          operations.push('reviewLog');
        },
      },
      chapter: {
        delete: async () => {
          operations.push('chapter');
        },
      },
    };
    const service = createService({
      chapter: {
        findFirst: async () => ({
          id: currentChapter.id,
          novel: { authorId: author.id },
        }),
      },
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    });

    const result = await service.permanentlyDeleteChapter(author, currentChapter.id);

    assert.deepEqual(result, { deletedId: currentChapter.id });
    assert.deepEqual(operations, ['reviewLog', 'chapter']);
  });
});
