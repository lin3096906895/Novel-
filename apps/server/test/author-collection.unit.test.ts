import { GoneException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WikisourceClient, type WikisourceWork } from '../src/crawler/wikisource';
import {
  XsbookClient,
  type XsbookFetchOptions,
  type XsbookImportedWork,
} from '../src/crawler/xsbook-source';
import { AuthorCollectionService } from '../src/modules/author/author-collection.service';
import type { RequestUser } from '../src/modules/auth/auth.types';
import type { PrismaService } from '../src/modules/prisma/prisma.service';

const author: RequestUser = {
  id: 'author_1',
  email: 'author@novel.local',
  role: UserRole.AUTHOR,
  sessionId: 'session_1',
};

const work: WikisourceWork = {
  title: '测试公版作品',
  summary: '测试作品简介',
  sourceName: '中文维基文库',
  sourceExternalId: 'root_1',
  sourceUrl: 'https://zh.wikisource.org/wiki/test',
  sourceAuthor: '原作者',
  sourceLicense: '公版',
  chapters: [
    {
      externalId: 'chapter_1',
      title: '第一章',
      content: '第一章测试正文',
      url: 'https://zh.wikisource.org/wiki/test/1',
      wordCount: 7,
    },
  ],
  isComplete: true,
  discoveredChapterCount: 1,
};

class TestAuthorCollectionService extends AuthorCollectionService {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  protected createClient() {
    return {
      fetchWork: async () => work,
    } as unknown as WikisourceClient;
  }
}

class TestXsbookCollectionService extends AuthorCollectionService {
  readonly calls: XsbookFetchOptions[] = [];

  constructor(prisma: PrismaService, private readonly xsbookWork: XsbookImportedWork) {
    super(prisma);
  }

  protected createXsbookClient() {
    return {
      fetchWork: async (options: XsbookFetchOptions) => {
        this.calls.push(options);
        return this.xsbookWork;
      },
    } as XsbookClient;
  }
}

function createPrisma() {
  const chapterWrites: Array<Record<string, any>> = [];
  const transaction = {
    category: {
      findUnique: async () => ({ id: 'category_1', name: '历史' }),
    },
    user: {
      upsert: async () => ({ id: 'library_author' }),
    },
    authorProfile: {
      upsert: async () => ({ id: 'library_profile' }),
    },
    novel: {
      upsert: async () => ({ id: 'imported_novel' }),
      update: async () => ({ id: 'imported_novel' }),
    },
    novelVolume: {
      upsert: async () => ({ id: 'main_volume' }),
    },
    chapter: {
      upsert: async (args: Record<string, any>) => {
        chapterWrites.push(args);
        return { id: 'imported_chapter' };
      },
      aggregate: async () => ({ _sum: { wordCount: 7 } }),
    },
  };
  return {
    prisma: {
      category: transaction.category,
      $transaction: async (callback: (client: typeof transaction) => Promise<string>) =>
        callback(transaction),
    } as unknown as PrismaService,
    chapterWrites,
  };
}

describe('AuthorCollectionService', () => {
  it('creates an owner-bound preview without returning chapter content', async () => {
    const { prisma } = createPrisma();
    const preview = await new TestAuthorCollectionService(prisma).preview(author, {
      title: '测试公版作品',
      categoryId: 'category_1',
      sourceAuthor: '原作者',
      maxChapters: 20,
      rightsConfirmed: true,
    });

    assert.equal(preview.title, work.title);
    assert.equal(preview.chapterCount, 1);
    assert.equal(preview.category.name, '历史');
    assert.equal('content' in preview.chapters[0], false);
  });

  it('prevents another author from committing the preview task', async () => {
    const { prisma } = createPrisma();
    const service = new TestAuthorCollectionService(prisma);
    const preview = await service.preview(author, {
      title: work.title,
      categoryId: 'category_1',
      rightsConfirmed: true,
    });

    await assert.rejects(
      () =>
        service.commit(
          { ...author, id: 'author_2', email: 'another-author@novel.local' },
          preview.taskId,
        ),
      GoneException,
    );
  });

  it('commits the cached preview once and removes the completed task', async () => {
    const { prisma, chapterWrites } = createPrisma();
    const service = new TestAuthorCollectionService(prisma);
    const preview = await service.preview(author, {
      title: work.title,
      categoryId: 'category_1',
      rightsConfirmed: true,
    });

    const result = await service.commit(author, preview.taskId);
    assert.equal(result.novelId, 'imported_novel');
    assert.equal(result.chapterCount, 1);
    assert.equal(chapterWrites.length, 1);
    await assert.rejects(() => service.commit(author, preview.taskId), GoneException);
  });

  it('routes an xsbook category URL through site search and preserves the chapter range', async () => {
    const { prisma } = createPrisma();
    const xsbookWork: XsbookImportedWork = {
      ...work,
      sourceName: '顶点小说(xsbook.org)',
      sourceUrl: 'http://www.xsbook.org/1_300/',
      sourceExternalId: 'http://www.xsbook.org/1_300/',
      sourceLicense: '已确认授权',
      chapters: work.chapters.map((chapter) => ({ ...chapter, orderIndex: 12 })),
    };
    const service = new TestXsbookCollectionService(prisma, xsbookWork);

    const preview = await service.preview(author, {
      sourceType: 'html',
      sourceUrl: 'http://www.xsbook.org/xclass/1/1.html',
      title: '目标作品',
      sourceAuthor: '作者乙',
      categoryId: 'category_1',
      startChapter: 12,
      endChapter: 12,
      rightsConfirmed: true,
    });

    assert.equal(service.calls.length, 1);
    assert.equal(service.calls[0].keyword, '目标作品');
    assert.equal(service.calls[0].bookUrl, undefined);
    assert.equal(service.calls[0].sourceAuthor, '作者乙');
    assert.equal(service.calls[0].startChapter, 12);
    assert.equal(service.calls[0].endChapter, 12);
    assert.equal(preview.chapters[0].orderIndex, 12);
  });
});
