const WIKISOURCE_API_URL = 'https://zh.wikisource.org/w/api.php';
const WIKISOURCE_SITE_URL = 'https://zh.wikisource.org/wiki/';

export const WIKISOURCE_SOURCE_NAME = '中文维基文库';
export const WIKISOURCE_DEFAULT_LICENSE = '公版/自由许可（具体状态以来源页标注为准）';

const DEFAULT_USER_AGENT =
  'NovelPlatformPublicDomainImporter/1.0 (public-domain import via MediaWiki API)';
const PAGE_BATCH_SIZE = 20;
const MAX_DISCOVERED_SUBPAGES = 5000;

interface MediaWikiPage {
  pageid?: number;
  ns?: number;
  title: string;
  extract?: string;
  fullurl?: string;
  missing?: boolean;
}

interface MediaWikiResponse {
  batchcomplete?: boolean | string;
  continue?: {
    apcontinue?: string;
    continue?: string;
  };
  error?: {
    code?: string;
    info?: string;
  };
  query?: {
    pages?: MediaWikiPage[];
    allpages?: MediaWikiPage[];
  };
}

export interface ImportedChapterSource {
  externalId: string;
  title: string;
  content: string;
  url: string;
  wordCount: number;
  orderIndex?: number;
}

export interface WikisourceWork {
  title: string;
  summary: string;
  coverUrl?: string;
  sourceName: string;
  sourceExternalId: string;
  sourceUrl: string;
  sourceAuthor?: string;
  sourceLicense: string;
  chapters: ImportedChapterSource[];
  isComplete: boolean;
  discoveredChapterCount: number;
}

export interface WikisourceFetchOptions {
  title: string;
  sourceAuthor?: string;
  maxChapters?: number;
  startChapter?: number;
  endChapter?: number;
  minContentLength?: number;
  sourceLicense?: string;
}

interface WikisourceClientOptions {
  fetchImpl?: typeof fetch;
  delayMs?: number;
  userAgent?: string;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class WikisourceClient {
  private readonly fetchImpl: typeof fetch;
  private readonly delayMs: number;
  private readonly userAgent: string;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private hasRequested = false;

  constructor(options: WikisourceClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.delayMs = options.delayMs ?? 800;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async fetchWork(options: WikisourceFetchOptions): Promise<WikisourceWork> {
    const requestedTitle = options.title.trim();
    if (!requestedTitle) {
      throw new Error('维基文库页面标题不能为空');
    }

    const startChapter = normalizeChapterNumber(options.startChapter, 1);
    const maxChapters = options.maxChapters ?? 20;
    const requestedEnd = options.endChapter === undefined
      ? (maxChapters === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : startChapter + Math.max(1, normalizeChapterNumber(maxChapters, 20)) - 1)
      : normalizeChapterNumber(options.endChapter, startChapter);
    if (requestedEnd < startChapter) throw new Error('结束章节不能小于起始章节');
    if (!Number.isFinite(maxChapters) && maxChapters !== Number.POSITIVE_INFINITY) {
      throw new Error('maxChapters 必须是正整数或 Infinity');
    }
    if (maxChapters <= 0) {
      throw new Error('maxChapters 必须大于 0');
    }

    const minContentLength = options.minContentLength ?? 80;
    const rootPage = await this.fetchSinglePage(requestedTitle);
    if (!rootPage.pageid || rootPage.missing) {
      throw new Error(`中文维基文库中未找到页面“${requestedTitle}”`);
    }

    const discovery = await this.listSubpages(rootPage.title);
    const sortedSubpages = naturalSortPages(discovery.pages, rootPage.title);
    const fetchLimit = Number.isFinite(requestedEnd)
      ? Math.min(sortedSubpages.length, requestedEnd)
      : sortedSubpages.length;
    const candidatePages = sortedSubpages.slice(startChapter - 1, fetchLimit);
    const detailedPages = await this.fetchPages(candidatePages.map((page) => page.title));
    const detailById = new Map(
      detailedPages
        .filter((page): page is MediaWikiPage & { pageid: number } => Boolean(page.pageid))
        .map((page) => [String(page.pageid), page]),
    );

    let chapters = candidatePages
      .map((page) => detailById.get(String(page.pageid)) ?? page)
      .map((page, index) => toImportedChapter(page, rootPage.title, startChapter + index))
      .filter((chapter): chapter is ImportedChapterSource => chapter !== null)
      .filter((chapter) => chapter.wordCount >= minContentLength);

    const limitedByOption = startChapter > 1 || requestedEnd < discovery.pages.length;

    let usedRootAsChapter = false;
    if (chapters.length === 0) {
      const rootContent = cleanWikisourceText(rootPage.extract ?? '');
      if (countContentCharacters(rootContent) >= minContentLength) {
        usedRootAsChapter = true;
        chapters = [
          {
            externalId: String(rootPage.pageid),
            title: '正文',
            content: rootContent,
            url: rootPage.fullurl ?? buildPageUrl(rootPage.title),
            wordCount: countContentCharacters(rootContent),
            orderIndex: 1,
          },
        ];
      }
    }

    if (chapters.length === 0) {
      throw new Error(
        `页面“${rootPage.title}”没有找到可导入正文。请确认该作品使用“书名/章节”子页面，或降低 --min-content-length。`,
      );
    }

    const rootExtract = cleanWikisourceText(rootPage.extract ?? '');
    const discoveredChapterCount = discovery.pages.length || (usedRootAsChapter ? 1 : 0);
    const isComplete = usedRootAsChapter
      ? true
      : startChapter === 1 && !discovery.hasMore && !limitedByOption && chapters.length >= discovery.pages.length;

    return {
      title: requestedTitle,
      summary: buildSummary(rootExtract, requestedTitle, options.sourceAuthor),
      sourceName: WIKISOURCE_SOURCE_NAME,
      sourceExternalId: String(rootPage.pageid),
      sourceUrl: rootPage.fullurl ?? buildPageUrl(rootPage.title),
      sourceAuthor: options.sourceAuthor?.trim() || undefined,
      sourceLicense: options.sourceLicense?.trim() || WIKISOURCE_DEFAULT_LICENSE,
      chapters,
      isComplete,
      discoveredChapterCount,
    };
  }

  private async fetchSinglePage(title: string) {
    const response = await this.request({
      action: 'query',
      prop: 'extracts|info',
      titles: title,
      redirects: '1',
      explaintext: '1',
      exsectionformat: 'plain',
      inprop: 'url',
    });
    const page = response.query?.pages?.[0];
    if (!page) {
      throw new Error(`维基文库 API 没有返回页面“${title}”`);
    }
    return page;
  }

  private async listSubpages(rootTitle: string) {
    const pages: MediaWikiPage[] = [];
    let apcontinue: string | undefined;
    let hasMore = false;

    do {
      const response = await this.request({
        action: 'query',
        list: 'allpages',
        apprefix: `${rootTitle}/`,
        apnamespace: '0',
        aplimit: 'max',
        ...(apcontinue ? { apcontinue } : {}),
      });
      pages.push(...(response.query?.allpages ?? []));
      apcontinue = response.continue?.apcontinue;
      hasMore = Boolean(apcontinue);
    } while (apcontinue && pages.length < MAX_DISCOVERED_SUBPAGES);

    return {
      pages: pages.slice(0, MAX_DISCOVERED_SUBPAGES),
      hasMore,
    };
  }

  private async fetchPages(titles: string[]) {
    const pages: MediaWikiPage[] = [];
    for (let index = 0; index < titles.length; index += PAGE_BATCH_SIZE) {
      const batch = titles.slice(index, index + PAGE_BATCH_SIZE);
      const response = await this.request({
        action: 'query',
        prop: 'extracts|info',
        titles: batch.join('|'),
        redirects: '1',
        explaintext: '1',
        exsectionformat: 'plain',
        exlimit: 'max',
        inprop: 'url',
      });
      pages.push(...(response.query?.pages ?? []));
    }
    return pages;
  }

  private async request(parameters: Record<string, string>) {
    if (this.hasRequested && this.delayMs > 0) {
      await this.sleep(this.delayMs);
    }
    this.hasRequested = true;

    const url = new URL(WIKISOURCE_API_URL);
    url.search = new URLSearchParams({
      format: 'json',
      formatversion: '2',
      utf8: '1',
      ...parameters,
    }).toString();

    const response = await this.fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'Api-User-Agent': this.userAgent,
        'User-Agent': this.userAgent,
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      throw new Error(`维基文库 API 请求失败：HTTP ${response.status}`);
    }

    const payload = (await response.json()) as MediaWikiResponse;
    if (payload.error) {
      throw new Error(`维基文库 API 错误：${payload.error.info ?? payload.error.code ?? '未知错误'}`);
    }
    return payload;
  }
}

export function cleanWikisourceText(input: string) {
  const removableLine = /^(?:来自维基文库|出自维基文库|檢索自|检索自|上一页|下一页|上一頁|下一頁|返回目录|返回目錄|←\s*上一|下一\s*→)$/u;
  const normalizedLines = input
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, '').trimStart())
    .filter((line) => !removableLine.test(line.trim()));

  return normalizedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function countContentCharacters(content: string) {
  return content.replace(/\s/gu, '').length;
}

export function naturalSortPages(pages: MediaWikiPage[], rootTitle: string) {
  const collator = new Intl.Collator('zh-CN', {
    numeric: true,
    sensitivity: 'base',
  });
  return [...pages].sort((left, right) => {
    const leftTitle = relativePageTitle(left.title, rootTitle);
    const rightTitle = relativePageTitle(right.title, rootTitle);
    const leftOrdinals = extractOrdinalSequence(leftTitle);
    const rightOrdinals = extractOrdinalSequence(rightTitle);
    if (leftOrdinals.length > 0 && rightOrdinals.length > 0) {
      const comparableLength = Math.min(leftOrdinals.length, rightOrdinals.length);
      for (let index = 0; index < comparableLength; index += 1) {
        if (leftOrdinals[index] !== rightOrdinals[index]) {
          return leftOrdinals[index] - rightOrdinals[index];
        }
      }
      if (leftOrdinals.length !== rightOrdinals.length) {
        return leftOrdinals.length - rightOrdinals.length;
      }
    }
    return collator.compare(leftTitle, rightTitle);
  });
}

export function chineseOrdinalToNumber(input: string) {
  if (/^\d+$/u.test(input)) return Number(input);
  const digits: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    兩: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  const units: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };
  if (![...input].some((character) => character in units)) {
    const value = [...input].map((character) => digits[character]).join('');
    return value ? Number(value) : Number.NaN;
  }

  let result = 0;
  let currentDigit = 0;
  for (const character of input) {
    if (character in digits) {
      currentDigit = digits[character];
      continue;
    }
    const unit = units[character];
    if (unit) {
      result += (currentDigit || 1) * unit;
      currentDigit = 0;
    }
  }
  return result + currentDigit;
}

function toImportedChapter(page: MediaWikiPage, rootTitle: string, orderIndex?: number): ImportedChapterSource | null {
  if (!page.pageid || page.missing) return null;
  const content = cleanWikisourceText(page.extract ?? '');
  if (!content) return null;
  return {
    externalId: String(page.pageid),
    title: relativePageTitle(page.title, rootTitle).replace(/\//g, ' · '),
    content,
    url: page.fullurl ?? buildPageUrl(page.title),
    wordCount: countContentCharacters(content),
    orderIndex,
  };
}

function normalizeChapterNumber(value: number | undefined, fallback: number) {
  if (value === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY;
  if (!Number.isFinite(value) || value === undefined) return fallback;
  return Math.max(1, Math.floor(value));
}

function relativePageTitle(title: string, rootTitle: string) {
  const prefix = `${rootTitle}/`;
  return title.startsWith(prefix) ? title.slice(prefix.length) : title;
}

function extractOrdinalSequence(title: string) {
  const ordinals: number[] = [];
  for (const match of title.matchAll(/(?:第)?([\d零〇一二两兩三四五六七八九十百千]+)(?=[回章节節卷篇])/gu)) {
    const ordinal = chineseOrdinalToNumber(match[1]);
    if (Number.isFinite(ordinal)) ordinals.push(ordinal);
  }
  return ordinals;
}

function buildPageUrl(title: string) {
  return `${WIKISOURCE_SITE_URL}${encodeURIComponent(title.replace(/ /g, '_'))}`;
}

function buildSummary(extract: string, title: string, sourceAuthor?: string) {
  const firstParagraph = extract
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .find((paragraph) => countContentCharacters(paragraph) >= 20);
  if (firstParagraph) {
    const compact = firstParagraph.replace(/\s+/gu, ' ');
    return compact.length > 420 ? `${compact.slice(0, 420)}……` : compact;
  }
  return `${sourceAuthor?.trim() ? `${sourceAuthor.trim()}所著` : '公版'}作品《${title}》，内容导入自中文维基文库。`;
}
