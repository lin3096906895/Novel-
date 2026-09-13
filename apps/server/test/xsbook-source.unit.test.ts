import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanChapterHtml, XsbookClient } from '../src/crawler/xsbook-source';

const baseUrl = 'http://www.xsbook.org';
const categoryUrl = `${baseUrl}/xclass/1/1.html`;
const keyword = '目标作品';
const searchUrl = `${baseUrl}/search3c.html?searchkey=${encodeURIComponent(keyword)}`;
const wrongDetailUrl = `${baseUrl}/1_200/`;
const detailUrl = `${baseUrl}/1_300/`;

const pages = new Map<string, string>([
  [categoryUrl, '<html><body>分类页</body></html>'],
  [searchUrl, `
    <div class="item"><dt><a href="/1_200/" title="目标作品">目标作品</a></dt><div class="nested"></div><div class="btm"><a>其他作者</a></div></div>
    <div class="item"><dt><a href="/1_300/" title="目标作品">目标作品</a></dt><div class="nested"></div><div class="btm"><a>作者乙</a></div></div>
  `],
  [wrongDetailUrl, '<h1>错误作品</h1><div id="list"></div>'],
  [detailUrl, `
    <meta property="og:image" content="http://img.xsbook.org/1/300/300s.jpg" />
    <h1>目标作品</h1><a href="/author/2/">作者乙</a><div class="intro">作品简介</div>
    <div id="list">
      <dt>最新章节</dt><a rel="chapter" href="/1_300/30003.html">第3章 最新</a>
      <dt>正文</dt>
      <a rel="chapter" href="/1_300/30001.html">第1章 开始</a>
      <dt>点击展开更多章节</dt>
      <a rel="chapter" href="/1_300/30003.html">第3章 结束</a>
      <a rel="chapter" href="/1_300/30002.html">第2章 发展</a>
    </div>
  `],
  [`${baseUrl}/1_300/30001.html`, '<div id="chaptercontent">第一章正文内容，长度足够用于测试。</div>'],
  [`${baseUrl}/1_300/30002.html`, '<div id="chaptercontent">第二章上半页正文内容，长度足够用于测试。</div><a id="next_url" href="/1_300/30002_2.html">下一页</a>'],
  [`${baseUrl}/1_300/30002_2.html`, '<div id="chaptercontent">第二章下半页正文内容，长度足够用于测试。</div><a id="next_url" href="/1_300/30003.html">下一章</a>'],
  [`${baseUrl}/1_300/30003.html`, '<div id="chaptercontent">第三章正文内容，长度足够用于测试。</div>'],
]);

function fetchImpl(input: string | URL | Request) {
  const html = pages.get(String(input));
  return Promise.resolve(new Response(html ?? '', {
    status: html ? 200 : 404,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  }));
}

describe('XsbookClient', () => {
  it('uses site search, author matching, the main directory, and a selected chapter range', async () => {
    const work = await new XsbookClient({ fetchImpl, delayMs: 0 }).fetchWork({
      keyword,
      sourceAuthor: '作者乙',
      startChapter: 2,
      endChapter: 3,
      maxChapters: 20,
      minContentLength: 5,
      workers: 2,
    });

    assert.equal(work.sourceUrl, detailUrl);
    assert.equal(work.coverUrl, 'http://img.xsbook.org/1/300/300s.jpg');
    assert.equal(work.discoveredChapterCount, 3);
    assert.deepEqual(work.chapters.map((chapter) => chapter.title), ['第2章 发展', '第3章 结束']);
    assert.deepEqual(work.chapters.map((chapter) => chapter.orderIndex), [2, 3]);
    assert.match(work.chapters[0].content, /第二章上半页/);
    assert.match(work.chapters[0].content, /第二章下半页/);
    assert.doesNotMatch(work.chapters[0].content, /第三章正文/);
    assert.equal(work.isComplete, false);
  });

  it('keeps paragraph boundaries when converting chapter HTML to plain text', () => {
    assert.equal(
      cleanChapterHtml('<div id="booktxt"><p>第一段。</p><p> </p><p>第二段。<br>仍在第二段。</p></div>'),
      '第一段。\n第二段。\n仍在第二段。',
    );
  });

  it('extracts the detail-page summary from id intro before falling back', async () => {
    const detailWithId = `${baseUrl}/1_301/`;
    const pagesWithId = new Map(pages);
    pagesWithId.set(
      detailWithId,
      '<h1>目标作品</h1><a href="/author/2/">作者乙</a><div id="intro">详情页真实简介</div><div id="list"><a rel="chapter" href="/1_301/30101.html">第一章</a></div>',
    );
    pagesWithId.set(
      `${baseUrl}/1_301/30101.html`,
      '<div id="chaptercontent">第一章正文内容，长度足够用于测试。</div>',
    );

    const work = await new XsbookClient({
      fetchImpl: (input) => {
        const html = pagesWithId.get(String(input));
        return Promise.resolve(new Response(html ?? '', { status: html ? 200 : 404 }));
      },
      delayMs: 0,
    }).fetchWork({
      bookUrl: detailWithId,
      maxChapters: 1,
      minContentLength: 5,
    });

    assert.equal(work.summary, '详情页真实简介');
  });
});
