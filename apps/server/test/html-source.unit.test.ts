import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractTextBySelector, HtmlSourceClient } from '../src/crawler/html-source';

const categoryUrl = 'http://www.xsbook.org/xclass/1/1.html';
const detailUrl = 'http://www.xsbook.org/1_100/';
const chapterUrl = 'http://www.xsbook.org/1_100/10001.html';
const reverseDetailUrl = 'http://www.xsbook.org/1_200/';

const pages = new Map([
  [categoryUrl, '<h2>推荐</h2><a href="/1_100/">测试作品</a>'],
  [detailUrl, '<h1>站点名称</h1><div id="info"><h1>测试作品</h1><p>作者：作者甲</p></div><div id="intro">这是测试简介</div><div id="list"><a rel="chapter" href="/1_100/10001.html" title="第一章">第一章</a></div>'],
  [chapterUrl, '<h1 class="bookname">第一章</h1><div id="chaptercontent"><div id="booktxt"><p>这是一段足够长的测试章节正文，用于验证 HTML 页面解析和章节内容提取逻辑。</p></div></div>'],
  [reverseDetailUrl, '<div id="info"><h1>倒序作品</h1></div><div id="list"><a rel="chapter" href="/1_200/20003.html">第3章 终章</a><a rel="chapter" href="/1_200/20002.html">第2章 发展</a><a rel="chapter" href="/1_200/20001.html">第1章 开始</a></div>'],
  ['http://www.xsbook.org/1_200/20001.html', '<div id="booktxt">第一章正文内容足够长，用来确认倒序目录能够被纠正为正序采集。</div>'],
  ['http://www.xsbook.org/1_200/20002.html', '<div id="booktxt">第二章正文内容足够长，用来确认指定章节范围能够正确截取章节。</div>'],
  ['http://www.xsbook.org/1_200/20003.html', '<div id="booktxt">第三章正文内容足够长，用来确认结束章节范围能够正确生效。</div>'],
]);

function fetchImpl(input: string | URL | Request) {
  const html = pages.get(String(input));
  return Promise.resolve({
    ok: Boolean(html),
    status: html ? 200 : 404,
    text: async () => html ?? '',
  } as Response);
}

describe('HtmlSourceClient', () => {
  it('analyzes selectors and extracts a detail page from a category URL', async () => {
    const client = new HtmlSourceClient({ fetchImpl, delayMs: 0 });
    const analysis = await client.analyze(categoryUrl, ['xsbook.org']);
    assert.equal(analysis.rootType, 'html');
    assert.ok(Array.isArray(analysis.candidates.chapterLinkSelectors));

    const work = await client.fetchWork({
      url: categoryUrl,
      title: '测试作品',
      maxChapters: 5,
      allowedHosts: ['xsbook.org'],
    });
    assert.equal(work.title, '测试作品');
    assert.equal(work.summary, '这是测试简介');
    assert.equal(work.chapters.length, 1);
    assert.match(work.chapters[0].content, /测试章节正文/);
  });

  it('extracts descendant selectors without leaking nested container markup', () => {
    const html = '<h1>站点名称</h1><section id="info"><div><h1>作品名称</h1></div></section>';
    assert.equal(extractTextBySelector(html, '#info h1'), '作品名称');
  });

  it('supports custom descendant anchor selectors', async () => {
    const client = new HtmlSourceClient({ fetchImpl, delayMs: 0 });
    const work = await client.fetchWork({
      url: detailUrl,
      title: '测试作品',
      maxChapters: 5,
      allowedHosts: ['xsbook.org'],
      mapping: {
        chapterLinkSelector: '#list a[href*=".html"]',
        chapterContentSelector: '#chaptercontent',
      },
    });
    assert.equal(work.chapters.length, 1);
  });

  it('normalizes a reversed directory and supports a selected chapter range', async () => {
    const client = new HtmlSourceClient({ fetchImpl, delayMs: 0 });
    const fromBeginning = await client.fetchWork({
      url: reverseDetailUrl,
      title: '倒序作品',
      maxChapters: 2,
      allowedHosts: ['xsbook.org'],
    });
    assert.deepEqual(fromBeginning.chapters.map((chapter) => chapter.title), ['第1章 开始', '第2章 发展']);

    const selected = await client.fetchWork({
      url: reverseDetailUrl,
      title: '倒序作品',
      startChapter: 2,
      endChapter: 3,
      maxChapters: 20,
      allowedHosts: ['xsbook.org'],
    });
    assert.deepEqual(selected.chapters.map((chapter) => chapter.title), ['第2章 发展', '第3章 终章']);
  });

  it('rejects a source outside the allowlist', async () => {
    const client = new HtmlSourceClient({ fetchImpl, delayMs: 0 });
    await assert.rejects(
      () => client.analyze('http://not-allowed.example/book', ['xsbook.org']),
      /未加入允许列表/,
    );
  });
});
