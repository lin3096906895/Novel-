import { ChapterStatus, NovelStatus, PrismaClient } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCliArguments } from '../src/crawler/import-wikisource.cli';
import { buildSourceKey, PublicDomainImporter } from '../src/crawler/public-domain-importer';
import {
  chineseOrdinalToNumber,
  cleanWikisourceText,
  naturalSortPages,
  WikisourceClient,
  type WikisourceWork,
} from '../src/crawler/wikisource';

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sampleWork(): WikisourceWork {
  return {
    title: '测试公版小说',
    summary: '测试简介',
    coverUrl: '/api/uploads/covers/test-cover.jpg',
    sourceName: '中文维基文库',
    sourceExternalId: '100',
    sourceUrl: 'https://zh.wikisource.org/wiki/test',
    sourceAuthor: '原作者',
    sourceLicense: '公版',
    isComplete: true,
    discoveredChapterCount: 2,
    chapters: [
      {
        externalId: '101',
        title: '第一回',
        content: '第一回正文内容',
        url: 'https://zh.wikisource.org/wiki/test/1',
        wordCount: 7,
      },
      {
        externalId: '102',
        title: '第二回',
        content: '第二回正文内容',
        url: 'https://zh.wikisource.org/wiki/test/2',
        wordCount: 7,
      },
    ],
  };
}

describe('WikisourceClient', () => {
  it('follows allpages continuation, naturally sorts chapters, cleans text and filters short pages', async () => {
    const requestedTitles: string[] = [];
    let allPagesRequests = 0;
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const list = url.searchParams.get('list');
      const titles = url.searchParams.get('titles');
      if (list === 'allpages') {
        allPagesRequests += 1;
        if (!url.searchParams.has('apcontinue')) {
          return jsonResponse({
            continue: { apcontinue: 'next', continue: '-||' },
            query: {
              allpages: [
                { pageid: 110, ns: 0, title: '测试作品/第十回' },
                { pageid: 102, ns: 0, title: '测试作品/第二回' },
              ],
            },
          });
        }
        return jsonResponse({
          batchcomplete: true,
          query: {
            allpages: [
              { pageid: 101, ns: 0, title: '测试作品/第一回' },
              { pageid: 103, ns: 0, title: '测试作品/说明' },
            ],
          },
        });
      }

      if (titles === '测试作品') {
        return jsonResponse({
          query: {
            pages: [
              {
                pageid: 100,
                ns: 0,
                title: '测试作品',
                extract: '这是一段用于作品简介的根页面文字，长度足够生成简介。',
                fullurl: 'https://zh.wikisource.org/wiki/test',
              },
            ],
          },
        });
      }

      requestedTitles.push(...(titles?.split('|') ?? []));
      const content = '来自维基文库\n\n这是章节正文，包含足够多的文字用于通过最小长度过滤。\n\n返回目录';
      return jsonResponse({
        query: {
          pages: (titles?.split('|') ?? []).map((title) => {
            const pageId = Number(title.match(/第([一二十]+)/u)?.[1] === '一' ? 101 : title.includes('第二') ? 102 : title.includes('第十') ? 110 : 103);
            return {
              pageid: pageId,
              ns: 0,
              title,
              extract: title.endsWith('/说明') ? '太短' : content,
              fullurl: `https://zh.wikisource.org/wiki/${pageId}`,
            };
          }),
        },
      });
    }) as typeof fetch;

    const work = await new WikisourceClient({
      fetchImpl,
      delayMs: 0,
    }).fetchWork({
      title: '测试作品',
      sourceAuthor: '测试作者',
      maxChapters: 10,
      minContentLength: 10,
    });

    assert.equal(allPagesRequests, 2);
    assert.deepEqual(requestedTitles, ['测试作品/第一回', '测试作品/第二回', '测试作品/第十回', '测试作品/说明']);
    assert.deepEqual(work.chapters.map((chapter) => chapter.title), ['第一回', '第二回', '第十回']);
    assert.doesNotMatch(work.chapters[0].content, /来自维基文库|返回目录/u);
    assert.equal(work.isComplete, false, 'filtered non-chapter pages make completeness conservative');
  });

  it('uses a sufficiently long root page as a single chapter when no subpages exist', async () => {
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.searchParams.get('list') === 'allpages') {
        return jsonResponse({ query: { allpages: [] } });
      }
      return jsonResponse({
        query: {
          pages: [
            {
              pageid: 200,
              title: '短篇作品',
              extract: '这是一篇直接放在根页面中的完整短篇正文，内容长度已经足够，因此应当作为单章导入。',
              fullurl: 'https://zh.wikisource.org/wiki/short',
            },
          ],
        },
      });
    }) as typeof fetch;

    const work = await new WikisourceClient({ fetchImpl, delayMs: 0 }).fetchWork({
      title: '短篇作品',
      minContentLength: 20,
    });
    assert.equal(work.chapters.length, 1);
    assert.equal(work.chapters[0].title, '正文');
    assert.equal(work.isComplete, true);
  });
});

describe('Wikisource helpers', () => {
  it('sorts Arabic and Chinese chapter ordinals naturally', () => {
    const sorted = naturalSortPages(
      [
        { title: '书/第十回' },
        { title: '书/第二回' },
        { title: '书/第一回' },
      ],
      '书',
    );
    assert.deepEqual(sorted.map((page) => page.title), ['书/第一回', '书/第二回', '书/第十回']);
    assert.equal(chineseOrdinalToNumber('一百零二'), 102);
    assert.equal(chineseOrdinalToNumber('〇九'), 9);
  });

  it('normalizes whitespace and removes exact navigation lines', () => {
    assert.equal(cleanWikisourceText('来自维基文库\r\n\r\n正文  \r\n\r\n\r\n返回目录'), '正文');
  });
});

describe('PublicDomainImporter', () => {
  it('does not touch Prisma in preview mode', async () => {
    let transactionCalled = false;
    const prisma = {
      $transaction: async () => {
        transactionCalled = true;
      },
    } as unknown as PrismaClient;
    const result = await new PublicDomainImporter(prisma).importWork(sampleWork(), {
      categoryName: '历史',
    });
    assert.equal(result.mode, 'preview');
    assert.equal(transactionCalled, false);
  });

  it('upserts deterministic source keys and publishes chapters on commit', async () => {
    const chapterWrites: Array<Record<string, any>> = [];
    let novelWrite: Record<string, any> | undefined;
    let novelWordCount = 0;
    const transaction = {
      category: { findUnique: async () => ({ id: 'category_1' }) },
      user: { upsert: async () => ({ id: 'library_author' }) },
      authorProfile: { upsert: async () => ({ id: 'profile_1' }) },
      novel: {
        upsert: async (args: Record<string, any>) => {
          novelWrite = args;
          return { id: 'novel_1' };
        },
        update: async (args: Record<string, any>) => {
          novelWordCount = args.data.wordCount;
          return { id: 'novel_1' };
        },
      },
      novelVolume: { upsert: async () => ({ id: 'volume_1' }) },
      chapter: {
        upsert: async (args: Record<string, any>) => {
          chapterWrites.push(args);
          return { id: `chapter_${chapterWrites.length}` };
        },
        aggregate: async () => ({ _sum: { wordCount: 14 } }),
      },
    };
    const prisma = {
      $transaction: async (callback: (client: typeof transaction) => Promise<string>) => callback(transaction),
    } as unknown as PrismaClient;

    const result = await new PublicDomainImporter(prisma, async () => 'unused-random-password-hash').importWork(
      {
        ...sampleWork(),
        chapters: sampleWork().chapters.map((chapter, index) => ({ ...chapter, orderIndex: index + 11 })),
      },
      { categoryName: '历史', commit: true },
    );

    assert.equal(result.mode, 'committed');
    assert.equal(novelWrite?.where.sourceKey, buildSourceKey('中文维基文库', '100'));
    assert.equal(novelWrite?.create.status, NovelStatus.COMPLETED);
    assert.equal(novelWrite?.create.coverUrl, '/api/uploads/covers/test-cover.jpg');
    assert.equal(novelWrite?.update.coverUrl, '/api/uploads/covers/test-cover.jpg');
    assert.deepEqual(chapterWrites.map((write) => write.where.sourceKey), [
      buildSourceKey('中文维基文库', '101'),
      buildSourceKey('中文维基文库', '102'),
    ]);
    assert.ok(chapterWrites.every((write) => write.create.status === ChapterStatus.PUBLISHED));
    assert.deepEqual(chapterWrites.map((write) => write.create.orderIndex), [11, 12]);
    assert.equal(novelWordCount, 14);
  });
});

describe('crawler CLI arguments', () => {
  it('defaults to dry-run and supports an explicit all-chapters commit', () => {
    const preview = parseCliArguments(['--title', '红楼梦', '--category', '古代言情']);
    assert.equal(preview.commit, false);
    assert.equal(preview.maxChapters, 20);

    const committed = parseCliArguments([
      '--title',
      '红楼梦',
      '--category',
      '古代言情',
      '--all-chapters',
      '--commit',
    ]);
    assert.equal(committed.commit, true);
    assert.equal(committed.maxChapters, Number.POSITIVE_INFINITY);
  });
});
