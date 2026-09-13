// -*- coding: utf-8 -*-
/**
 * 顶点小说 (www.xsbook.org) 爬虫客户端
 * 纯 Node.js 实现，无额外依赖，直接对接 PublicDomainImporter
 *
 * 能力：
 *   - Cookie JS 挑战绕过（双请求模式）
 *   - 分类列表抓取（爬全站）
 *   - 书名搜索
 *   - 章节列表解析 + 并发抓取正文
 *   - 输出 HtmlImportedWork 格式，可直接入库
 */
import { URL } from 'node:url';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface XsbookCategoryBook {
  title: string;
  url: string;
  cover: string;
  intro: string;
  author: string;
  wordCount: string;
  updateDate: string;
}

export interface XsbookSearchResult {
  title: string;
  author: string;
  url: string;
}

export interface XsbookChapter {
  title: string;
  url: string;
}

export interface XsbookWork {
  title: string;
  author: string;
  summary: string;
  coverUrl?: string;
  sourceName: string;
  sourceExternalId: string;
  sourceUrl: string;
  sourceLicense: string;
  chapters: XsbookChapter[];
  discoveredChapterCount: number;
}

export interface XsbookFetchOptions {
  /** 书名关键词（用于搜索） */
  keyword?: string;
  /** 可选作者名；搜索到同名作品时用于精确筛选 */
  sourceAuthor?: string;
  /** 或者直接指定书籍详情页 URL */
  bookUrl?: string;
  /** 最多抓取多少章，默认 20 */
  maxChapters?: number;
  /** 从第几章开始抓取，默认 1 */
  startChapter?: number;
  /** 抓取到第几章（包含），不填时由 maxChapters 决定 */
  endChapter?: number;
  /** 并发线程数，默认 8 */
  workers?: number;
  /** 请求间隔毫秒，默认 800 */
  delayMs?: number;
  /** 最小章节正文字符数，低于此值跳过，默认 80 */
  minContentLength?: number;
}

export interface XsbookImportedWork {
  title: string;
  summary: string;
  coverUrl?: string;
  sourceName: string;
  sourceExternalId: string;
  sourceUrl: string;
  sourceAuthor: string;
  sourceLicense: string;
  chapters: Array<{
    externalId: string;
    title: string;
    content: string;
    url: string;
    wordCount: number;
    orderIndex?: number;
  }>;
  isComplete: boolean;
  discoveredChapterCount: number;
}

export interface XsbookCrawlOptions {
  /** 分类 ID：1玄幻 2武侠 3女频 4现代 5历史 6游戏 7科幻 8美文 9其他 */
  catId?: number;
  /** 最多抓取多少页，默认 3，设置 Infinity 抓全站 */
  maxPages?: number;
  /** 请求间隔毫秒，默认 1000 */
  delayMs?: number;
}

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

const BASE = 'http://www.xsbook.org';
const SOURCE_NAME = '顶点小说(xsbook.org)';
const DEFAULT_LICENSE = '来源网络，仅供学习交流，版权归原作者所有';

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9',
};

const MAX_BYTES = 50 * 1024 * 1024; // 50MB，远大于原 5MB 限制

// ---------------------------------------------------------------------------
// 工具函数：纯 JS 的 HTML 解析（不依赖 cheerio）
// ---------------------------------------------------------------------------

function decodeHtml(s: string) {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripHtml(html: string): string {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function attr(attrs: string, name: string): string {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return decodeHtml(m?.[1] ?? '');
}

/** 提取 meta 标签的 content，兼容 name/property 两种写法 */
function extractMetaContent(html: string, key: string): string {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(
    new RegExp(
      `<meta\\b[^>]*(?:name|property)=["']${escapedKey}["'][^>]*content=["']([^"']*)["'][^>]*>`,
      'i',
    ),
  );
  return decodeHtml(match?.[1] ?? '');
}

/** 提取所有 <a> 标签的 href + text + title */
function extractAnchors(html: string): { href: string; text: string; title: string }[] {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .map((m) => ({
      href: attr(m[1], 'href'),
      title: attr(m[1], 'title'),
      text: stripHtml(m[2]),
    }))
    .filter((a) => a.href);
}

/** 提取所有 <img> 标签的 src */
function extractImages(html: string): { src: string; dataOriginal: string }[] {
  return [...html.matchAll(/<img\b([^>]*)\/?>/gi)].map((m) => {
    const attrs = m[1];
    return { src: attr(attrs, 'src'), dataOriginal: attr(attrs, 'data-original') };
  });
}

/** 提取所有 <em> 标签的文本 */
function extractEms(html: string): string[] {
  return [...html.matchAll(/<em\b[^>]*>([\s\S]*?)<\/em>/gi)].map((m) => stripHtml(m[1]));
}

/** 从 HTML 中按 class 提取元素内容 */
function extractByClass(html: string, className: string): string {
  const re = new RegExp(`<[a-z][\\w-]*\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/[a-z][\\w-]*>`, 'i');
  return stripHtml(html.match(re)?.[1] ?? '');
}

/** 从 HTML 中按 id 提取元素内容 */
function extractById(html: string, id: string): string {
  return stripHtml(extractElementHtmlById(html, id));
}

/** 提取所有带指定 class 的元素的 innerHTML */
function extractElementsByClass(html: string, className: string): string[] {
  const results: string[] = [];
  const re = new RegExp(`<([a-z][\\w-]*)\\b[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const tagName = match[1];
    const start = match.index + match[0].length;
    const tokenRe = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
    tokenRe.lastIndex = start;
    let depth = 1;
    let token: RegExpExecArray | null;
    while ((token = tokenRe.exec(html))) {
      if (/^<\//i.test(token[0])) {
        depth -= 1;
        if (depth === 0) {
          results.push(html.slice(start, token.index));
          re.lastIndex = tokenRe.lastIndex;
          break;
        }
      } else if (!/\/\s*>$/.test(token[0])) {
        depth += 1;
      }
    }
  }
  return results;
}

/** 提取指定 id 元素的 innerHTML，并正确处理同名嵌套标签 */
function extractElementHtmlById(html: string, id: string): string {
  const opening = new RegExp(`<([a-z][\\w-]*)\\b[^>]*id=["']${id}["'][^>]*>`, 'i').exec(html);
  if (!opening) return '';
  const tagName = opening[1];
  const start = opening.index + opening[0].length;
  const tokenRe = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tokenRe.lastIndex = start;
  let depth = 1;
  let token: RegExpExecArray | null;
  while ((token = tokenRe.exec(html))) {
    if (/^<\//i.test(token[0])) {
      depth -= 1;
      if (depth === 0) return html.slice(start, token.index);
    } else if (!/\/\s*>$/.test(token[0])) {
      depth += 1;
    }
  }
  return html.slice(start);
}

/** 提取特定标签的第一个元素内容 */
function extractByTag(html: string, tag: string): string {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  return stripHtml(html.match(re)?.[1] ?? '');
}

/** 提取所有指定 rel 属性的 a 标签 */
function extractByRel(html: string, rel: string): { href: string; title: string; text: string }[] {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .filter((m) => {
      const relAttr = m[1].match(/rel\s*=\s*["']([^"']*)["']/i)?.[1] ?? '';
      return relAttr === rel;
    })
    .map((m) => ({
      href: attr(m[1], 'href'),
      title: attr(m[1], 'title'),
      text: stripHtml(m[2]),
    }));
}

// ---------------------------------------------------------------------------
// HTTP 层
// ---------------------------------------------------------------------------

export class XsbookClient {
  private readonly fetchImpl: typeof fetch;
  private readonly delayMs: number;
  private lastRequestAt = 0;
  private cookieJar: string | null = null;
  private initialized = false;
  private searchPath = '/search3c.html';

  constructor(options: { fetchImpl?: typeof fetch; delayMs?: number } = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.delayMs = options.delayMs ?? 800;
  }

  // ---- Cookie 挑战绕过 ----

  async init(): Promise<void> {
    if (this.initialized) return;
    const url = `${BASE}/xclass/1/1.html`;

    // 第一次请求：触发 JS 挑战，set cookie
    const r1 = await this.rawFetch(url);
    const setCookie = r1.headers.get('set-cookie');
    if (setCookie) {
      this.cookieJar = setCookie;
    }

    // 第二次请求：带 cookie 和 Referer
    await this.sleep(500);
    const r2 = await this.rawFetch(url, { Referer: url });
    const setCookie2 = r2.headers.get('set-cookie');
    if (setCookie2) {
      this.cookieJar = this.mergeCookies(this.cookieJar, setCookie2);
    }
    if (!r2.ok) throw new Error(`HTTP ${r2.status}: ${url}`);
    const initHtml = await r2.text();
    const searchForm = initHtml.match(/<form\b[^>]*(?:id|name)=["']search["'][^>]*action=["']([^"']+)["'][^>]*>/i)
      ?? initHtml.match(/<form\b[^>]*action=["']([^"']*search[^"']*)["'][^>]*>/i);
    if (searchForm?.[1]) {
      this.searchPath = new URL(searchForm[1], BASE).pathname;
    }

    this.initialized = true;
  }

  // ---- 公开 API ----

  /** 搜索书名 */
  async search(keyword: string): Promise<XsbookSearchResult[]> {
    await this.init();
    const searchUrl = new URL(this.searchPath, BASE);
    searchUrl.searchParams.set('searchkey', keyword);
    const url = searchUrl.toString();
    const html = await this.fetchHtml(url);
    const results: XsbookSearchResult[] = [];

    const items = extractElementsByClass(html, 'item');
    for (const itemHtml of items) {
      const anchors = extractAnchors(itemHtml);
      const dt = anchors[0];
      if (!dt) continue;
      const authorEl = itemHtml.match(/<a\b[^>]*>([\s\S]*?)<\/a>/gi);
      let author = '';
      // 找 btm 里的 author a
      const btmMatch = itemHtml.match(/<div\b[^>]*class=["'][^"]*btm[^"]*["'][^>]*>([\s\S]*?)<\/div>/i);
      if (btmMatch) {
        const btmA = btmMatch[1].match(/<a\b[^>]*>([\s\S]*?)<\/a>/i);
        if (btmA) author = stripHtml(btmA[1]);
      }

      results.push({
        title: dt.title || dt.text,
        author,
        url: dt.href,
      });
    }
    return results;
  }

  /** 获取分类列表 */
  async crawlCategory(catId: number, maxPages = 3, onPage?: (page: number, total: number, books: XsbookCategoryBook[]) => void): Promise<XsbookCategoryBook[]> {
    await this.init();
    const firstUrl = `${BASE}/xclass/${catId}/1.html`;
    const firstHtml = await this.fetchHtml(firstUrl);
    const total = parseTotalPages(firstHtml);
    const pages = maxPages === Infinity ? total : Math.min(total, maxPages);

    const allBooks: XsbookCategoryBook[] = [];
    for (let page = 1; page <= pages; page++) {
      const html = page === 1 ? firstHtml : await this.fetchHtml(`${BASE}/xclass/${catId}/${page}.html`);
      const books = parseCategoryPage(html);
      allBooks.push(...books);
      onPage?.(page, pages, books);
    }
    return allBooks;
  }

  /** 获取书籍详情 + 章节列表 */
  async getBookInfo(bookUrl: string): Promise<XsbookWork> {
    await this.init();
    const fullUrl = bookUrl.startsWith('http') ? bookUrl : `${BASE}${bookUrl}`;
    const html = await this.fetchHtml(fullUrl);

    const title = extractByTag(html, 'h1') || extractByTag(html, 'title');
    const authorEl = html.match(/<a\b[^>]*href=["']\/author[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);
    const author = authorEl ? stripHtml(authorEl[1]) : '';
    const summary =
      extractById(html, 'intro') ||
      extractByClass(html, 'intro') ||
      extractByClass(html, 'description') ||
      extractMetaContent(html, 'og:description') ||
      extractMetaContent(html, 'description');
    const coverUrl = extractCoverUrl(html, fullUrl);

    // 章节列表：第二个 dt 后才是完整正文目录，第一个区域通常只是“最新章节”。
    const listHtml = extractElementHtmlById(html, 'list');
    let chapters: XsbookChapter[] = [];
    if (listHtml) {
      const directoryHtml = extractMainChapterDirectory(listHtml);
      chapters = extractByRel(directoryHtml, 'chapter')
        .map((a) => ({ title: a.title || a.text, url: a.href }));
    }
    // 回退：直接找所有 rel=chapter 的锚点
    if (chapters.length === 0) {
      chapters = extractByRel(html, 'chapter')
        .map((a) => ({ title: a.title || a.text, url: a.href }));
    }
    chapters = orderChapters(dedupeChapters(chapters));

    return {
      title: title || '未知书名',
      author,
      summary: summary || `${title}，作者${author}`,
      coverUrl,
      sourceName: SOURCE_NAME,
      sourceExternalId: fullUrl,
      sourceUrl: fullUrl,
      sourceLicense: DEFAULT_LICENSE,
      chapters,
      discoveredChapterCount: chapters.length,
    };
  }

  /** 并发抓取章节正文 */
  async fetchChapters(
    chapters: XsbookChapter[],
    workers = 8,
    minContentLength = 80,
  ): Promise<{ title: string; content: string; url: string; wordCount: number }[]> {
    await this.init();

    const tasks = chapters.map((ch, i) => ({ ...ch, index: i }));
    const results: Map<number, { title: string; content: string; url: string; wordCount: number }> = new Map();

    // 并发控制
    const queue = [...tasks];
    let completed = 0;

    const worker = async () => {
      while (queue.length > 0) {
        const task = queue.shift()!;
        const result = await this.fetchOneChapter(task.title, task.url, minContentLength);
        results.set(task.index, result);
        completed++;
      }
    };

    const pool = Array.from({ length: Math.min(workers, tasks.length) }, () => worker());
    await Promise.all(pool);

    // 按原始顺序返回
    return chapters.map((_, i) => results.get(i)!);
  }

  /** 一站式抓取：搜索 → 选书 → 抓章节 → 输出 HtmlImportedWork */
  async fetchWork(options: XsbookFetchOptions): Promise<XsbookImportedWork> {
    let bookUrl = options.bookUrl;

    if (!bookUrl && options.keyword) {
      const results = await this.search(options.keyword);
      if (results.length === 0) throw new Error(`未找到匹配"${options.keyword}"的结果`);
      bookUrl = chooseSearchResult(results, options.keyword, options.sourceAuthor).url;
    }

    if (!bookUrl) throw new Error('必须提供 keyword 或 bookUrl');

    const maxChapters = normalizePositiveInteger(options.maxChapters, 20);
    const startChapter = normalizePositiveInteger(options.startChapter, 1);
    const workers = options.workers ?? 8;
    const minContentLength = options.minContentLength ?? 80;

    const info = await this.getBookInfo(bookUrl);
    const requestedEnd = options.endChapter === undefined
      ? startChapter + maxChapters - 1
      : normalizePositiveInteger(options.endChapter, startChapter);
    if (requestedEnd < startChapter) throw new Error('结束章节不能小于起始章节');
    if (startChapter > info.chapters.length) {
      throw new Error(`起始章节超过目录范围（共 ${info.chapters.length} 章）`);
    }
    const selected = info.chapters.slice(startChapter - 1, Math.min(requestedEnd, info.chapters.length));
    const fetchedChapters = await this.fetchChapters(selected, workers, minContentLength);

    const mappedChapters = fetchedChapters
      .map((ch, index) => ({
        externalId: ch.url,
        title: ch.title,
        content: ch.content,
        url: ch.url,
        wordCount: ch.wordCount,
        orderIndex: startChapter + index,
      }))
      .filter((chapter) => chapter.wordCount > 0);
    if (mappedChapters.length === 0) throw new Error('章节页面没有提取到有效正文');

    return {
      title: info.title,
      summary: info.summary,
      coverUrl: info.coverUrl,
      sourceName: SOURCE_NAME,
      sourceExternalId: info.sourceExternalId,
      sourceUrl: info.sourceUrl,
      sourceAuthor: info.author,
      sourceLicense: DEFAULT_LICENSE,
      chapters: mappedChapters,
      isComplete: startChapter === 1
        && selected.length === info.discoveredChapterCount
        && mappedChapters.length === info.discoveredChapterCount,
      discoveredChapterCount: info.discoveredChapterCount,
    };
  }

  // ---- 内部 ----

  private async fetchOneChapter(
    chTitle: string,
    chUrl: string,
    minContentLength: number,
  ): Promise<{ title: string; content: string; url: string; wordCount: number }> {
    const parts: string[] = [];
    let url = chUrl.startsWith('http') ? chUrl : `${BASE}${chUrl}`;

    // 跟 Python 脚本一样：跟随 #next_url 翻页，拼接多页正文
    for (let hop = 0; hop < 20; hop++) {
      try {
        const html = await this.fetchHtml(url);
        // 正文按 HTML 块级结构转为纯文本，保留段落换行供阅读端分段渲染。
        const contentHtml = extractElementHtmlById(html, 'chaptercontent')
          || extractElementHtmlById(html, 'booktxt');
        const content = contentHtml
          ? cleanChapterHtml(contentHtml)
          : extractByClass(html, 'content') || extractByClass(html, 'read-content') || '';

        if (content) {
          parts.push(content);
        }

        // 找下一页链接
        const nextMatch = html.match(/<a\b[^>]*id=["']next_url["'][^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/i);
        const nextText = nextMatch ? stripHtml(nextMatch[2]) : '';
        if (nextMatch && nextMatch[1] && /下一页/u.test(nextText) && !nextMatch[1].startsWith('javascript')) {
          url = nextMatch[1].startsWith('http') ? nextMatch[1] : `${BASE}${nextMatch[1]}`;
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    const fullText = parts.join('\n');
    const wordCount = fullText.replace(/\s/g, '').length;

    if (wordCount < minContentLength) {
      return { title: chTitle, content: '', url: chUrl, wordCount: 0 };
    }

    return { title: chTitle, content: fullText, url: chUrl, wordCount };
  }

  private async fetchHtml(url: string): Promise<string> {
    await this.init();
    const wait = this.delayMs - (Date.now() - this.lastRequestAt);
    if (wait > 0) await this.sleep(wait);
    this.lastRequestAt = Date.now();

    const resp = await this.rawFetch(url, { Referer: url });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${url}`);
    const text = await resp.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BYTES) {
      throw new Error('响应体超过 50MB 限制');
    }
    return text;
  }

  private async rawFetch(url: string, extraHeaders?: Record<string, string>) {
    const headers: Record<string, string> = { ...HEADERS, ...extraHeaders };
    if (this.cookieJar) {
      headers['Cookie'] = this.cookieJar;
    }
    return this.fetchImpl(url, {
      headers,
      signal: AbortSignal.timeout(30_000),
      redirect: 'follow',
    });
  }

  private mergeCookies(existing: string | null, setCookie: string): string {
    const map = new Map<string, string>();
    if (existing) {
      for (const part of existing.split(';')) {
        const eq = part.indexOf('=');
        if (eq > 0) map.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
      }
    }
    for (const part of setCookie.split(';')) {
      const kv = part.split(',')[0].trim(); // 取第一个 key=value
      const eq = kv.indexOf('=');
      if (eq > 0) map.set(kv.slice(0, eq).trim(), kv.slice(eq + 1).trim());
    }
    return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ---------------------------------------------------------------------------
// 纯函数：HTML 解析（不依赖实例）
// ---------------------------------------------------------------------------

function extractCoverUrl(html: string, detailUrl: string) {
  const metaTags = [...html.matchAll(/<meta\b([^>]*)>/gi)];
  const ogImage = metaTags.find((match) => attr(match[1], 'property').toLowerCase() === 'og:image');
  const imageCandidates = extractImages(html);
  const rawUrl = (ogImage ? attr(ogImage[1], 'content') : '')
    || imageCandidates.find((image) => image.dataOriginal)?.dataOriginal
    || imageCandidates.find((image) => image.src && !/nocover/iu.test(image.src))?.src
    || '';
  if (!rawUrl) return undefined;
  try {
    return new URL(rawUrl, detailUrl).toString();
  } catch {
    return undefined;
  }
}

export function cleanChapterHtml(html: string) {
  const text = decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(?:p|div|section|article|li|blockquote|h[1-6])\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ');

  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function extractMainChapterDirectory(listHtml: string) {
  const headings = [...listHtml.matchAll(/<dt\b[^>]*>[\s\S]*?<\/dt>/gi)];
  if (headings.length < 2) return listHtml;
  const start = headings[1].index + headings[1][0].length;
  // 第三个 dt 是“点击展开更多章节”，后面的链接仍属于正文目录，不能截断。
  return listHtml.slice(start);
}

function dedupeChapters(chapters: XsbookChapter[]) {
  return [...new Map(chapters.map((chapter) => [chapter.url, chapter])).values()];
}

function orderChapters(chapters: XsbookChapter[]) {
  const numbered = chapters.map((chapter, index) => ({
    chapter,
    index,
    ordinal: extractChapterOrdinal(chapter.title),
  }));
  if (numbered.length < 2 || numbered.some((item) => item.ordinal === undefined)) return chapters;
  return numbered
    .sort((left, right) => (left.ordinal! - right.ordinal!) || (left.index - right.index))
    .map((item) => item.chapter);
}

function extractChapterOrdinal(value: string) {
  const arabic = value.match(/(?:第\s*)?(\d{1,8})(?:\s*[章节回]|$)/)?.[1];
  if (arabic) return Number(arabic);
  const chinese = value.match(/第\s*([零〇一二两三四五六七八九十百千万]+)\s*[章节回]/)?.[1];
  return chinese ? chineseNumeral(chinese) : undefined;
}

function chineseNumeral(value: string) {
  const digits: Record<string, number> = {
    零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4,
    五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
  };
  if (![...value].some((char) => ['十', '百', '千', '万'].includes(char))) {
    return digits[value];
  }
  let total = 0;
  let section = 0;
  let current = 0;
  for (const char of value) {
    if (char in digits) {
      current = digits[char];
      continue;
    }
    const unit = char === '十' ? 10 : char === '百' ? 100 : char === '千' ? 1000 : 10000;
    if (unit === 10000) {
      total += (section + current) * unit;
      section = 0;
    } else {
      section += (current || 1) * unit;
    }
    current = 0;
  }
  return total + section + current;
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

function chooseSearchResult(
  results: XsbookSearchResult[],
  keyword: string,
  sourceAuthor?: string,
) {
  const expectedTitle = normalizeLookupText(keyword);
  const expectedAuthor = normalizeLookupText(sourceAuthor ?? '');
  return results
    .map((result, index) => {
      const title = normalizeLookupText(result.title);
      const author = normalizeLookupText(result.author);
      let score = 0;
      if (title === expectedTitle) score += 100;
      else if (title.includes(expectedTitle)) score += 70;
      else if (expectedTitle.includes(title)) score += 40;
      if (expectedAuthor) {
        if (author === expectedAuthor) score += 30;
        else if (author.includes(expectedAuthor) || expectedAuthor.includes(author)) score += 10;
      }
      return { result, index, score };
    })
    .sort((left, right) => (right.score - left.score) || (left.index - right.index))[0].result;
}

function normalizeLookupText(value: string) {
  return value
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s·•:：,，。.!！?？、"'“”‘’《》【】()[\]（）…—_-]+/gu, '');
}

function parseTotalPages(html: string): number {
  const lastMatch = html.match(/<a\b[^>]*class=["'][^"]*last[^"]*["'][^>]*href=["']\/(\d+)\.html["']/i);
  if (lastMatch) return parseInt(lastMatch[1], 10);
  // 回退：找分页栏中最大的页码
  const pageNums = [...html.matchAll(/<a\b[^>]*href=["']\/[^"']*\/(\d+)\.html["']/gi)]
    .map((m) => parseInt(m[1], 10))
    .filter((n) => n > 0);
  return pageNums.length > 0 ? Math.max(...pageNums) : 1;
}

function parseCategoryPage(html: string): XsbookCategoryBook[] {
  const books: XsbookCategoryBook[] = [];
  const items = extractElementsByClass(html, 'item');

  for (const itemHtml of items) {
    const anchors = extractAnchors(itemHtml);
    const dt = anchors[0];
    if (!dt) continue;

    const imgs = extractImages(itemHtml);
    const cover = imgs[0]?.dataOriginal || imgs[0]?.src || '';

    const intro = extractByClass(itemHtml, 'intro') ||
      itemHtml.match(/<dd\b[^>]*>([\s\S]*?)<\/dd>/i)?.[1] || '';
    const introText = stripHtml(typeof intro === 'string' ? intro : '');

    // author
    let author = '';
    const btmMatch = itemHtml.match(/<div\b[^>]*class=["'][^"]*btm[^"]*["'][^>]*>([\s\S]*?)<\/div>/i);
    if (btmMatch) {
      const btmA = btmMatch[1].match(/<a\b[^>]*>([\s\S]*?)<\/a>/i);
      if (btmA) author = stripHtml(btmA[1]);
    }

    // word_count / update_date from em tags
    let wordCount = '';
    let updateDate = '';
    if (btmMatch) {
      const ems = extractEms(btmMatch[1]);
      for (const em of ems) {
        if (/万字/.test(em)) wordCount = em;
        else if (/^\d{2}-\d{2}/.test(em)) updateDate = em;
      }
    }

    books.push({
      title: dt.title || dt.text,
      url: dt.href,
      cover,
      intro: introText,
      author,
      wordCount,
      updateDate,
    });
  }
  return books;
}
