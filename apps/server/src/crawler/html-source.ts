import { URL } from 'node:url';

export type HtmlSourceMapping = {
  titleSelector?: string;
  summarySelector?: string;
  chapterLinkSelector?: string;
  chapterContentSelector?: string;
};

export type HtmlSourceOptions = {
  url: string;
  title: string;
  mapping?: HtmlSourceMapping;
  maxChapters?: number;
  startChapter?: number;
  endChapter?: number;
  allowedHosts?: string[];
};

export type HtmlImportedWork = {
  title: string;
  summary: string;
  coverUrl?: string;
  sourceName: string;
  sourceExternalId: string;
  sourceUrl: string;
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
};

type HtmlClientOptions = {
  fetchImpl?: typeof fetch;
  delayMs?: number;
};

const MAX_BYTES = 50 * 1024 * 1024;

export class HtmlSourceClient {
  private readonly fetchImpl: typeof fetch;
  private readonly delayMs: number;
  private lastRequestAt = 0;

  constructor(options: HtmlClientOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.delayMs = options.delayMs ?? 800;
  }

  async analyze(url: string, allowedHosts: string[] = []) {
    const html = await this.fetchHtml(url, allowedHosts);
    const anchors = extractAnchors(html);
    return {
      url,
      rootType: 'html',
      title: extractTextBySelector(html, 'h1') || extractTextBySelector(html, 'title'),
      candidates: {
        titleSelectors: ['h1', '#info h1', '.bookname', 'title'].filter((selector) => Boolean(extractTextBySelector(html, selector))),
        summarySelectors: ['#intro', '.intro', '[class*=intro]', 'meta[name="description"]'].filter((selector) => Boolean(extractTextBySelector(html, selector))),
        chapterLinkSelectors: ['a[rel="chapter"]', '#list a[href*=".html"]', '.listmain a[href]'].filter((selector) => selectAnchors(html, selector).length > 0),
        contentSelectors: ['#chaptercontent', '#booktxt', '.content', '.read-content'].filter((selector) => Boolean(extractTextBySelector(html, selector))),
      },
      counts: {
        links: anchors.length,
        chapterLinks: selectAnchors(html, 'a[rel="chapter"]').length,
      },
    };
  }

  async fetchWork(options: HtmlSourceOptions): Promise<HtmlImportedWork> {
    const mapping = options.mapping ?? {};
    const allowedHosts = options.allowedHosts ?? [];
    const startUrl = validateUrl(options.url, allowedHosts);
    let detailUrl = startUrl.toString();
    let detailHtml = await this.fetchHtml(detailUrl, allowedHosts);
    let chapterLinks = selectAnchors(detailHtml, mapping.chapterLinkSelector ?? 'a[rel="chapter"]');

    // A category/list page can be used as the entry URL. Select the requested title's detail link.
    if (chapterLinks.length === 0) {
      const candidates = extractAnchors(detailHtml).filter((anchor) => normalizeText(anchor.text) === normalizeText(options.title));
      if (candidates.length === 0) throw new Error('页面没有找到章节链接，也没有找到匹配作品的详情链接');
      for (const candidate of candidates.slice(0, 5)) {
        const candidateUrl = new URL(candidate.href, startUrl);
        if (candidateUrl.origin !== startUrl.origin) continue;
        const candidateHtml = await this.fetchHtml(candidateUrl.toString(), allowedHosts);
        const candidateLinks = selectAnchors(candidateHtml, mapping.chapterLinkSelector ?? 'a[rel="chapter"]');
        if (candidateLinks.length === 0) continue;
        detailUrl = candidateUrl.toString();
        detailHtml = candidateHtml;
        chapterLinks = candidateLinks;
        break;
      }
    }
    if (chapterLinks.length === 0) throw new Error('详情页没有找到章节链接');

    const orderedLinks = orderChapterLinks(dedupeByHref(chapterLinks));
    const startChapter = normalizeChapterNumber(options.startChapter, 1);
    const requestedEnd = options.endChapter === undefined
      ? startChapter + Math.max(1, normalizeChapterNumber(options.maxChapters, 20)) - 1
      : normalizeChapterNumber(options.endChapter, startChapter);
    if (requestedEnd < startChapter) throw new Error('结束章节不能小于起始章节');
    if (startChapter > orderedLinks.length) throw new Error(`起始章节超过目录范围（共 ${orderedLinks.length} 章）`);
    const uniqueLinks = orderedLinks.slice(startChapter - 1, Math.min(orderedLinks.length, requestedEnd));
    const chapters = [];
    for (const [selectedIndex, link] of uniqueLinks.entries()) {
      const chapterUrl = new URL(link.href, detailUrl).toString();
      const chapterHtml = await this.fetchHtml(chapterUrl, allowedHosts);
      const content = extractTextBySelector(chapterHtml, mapping.chapterContentSelector ?? '#booktxt') || extractTextBySelector(chapterHtml, '#chaptercontent') || extractTextBySelector(chapterHtml, '.content');
      if (!content || content.length < 20) continue;
      const chapterTitle: string = normalizeText(link.title || link.text) || `第${chapters.length + 1}章`;
      chapters.push({
        externalId: chapterUrl,
        title: chapterTitle,
        content,
        url: chapterUrl,
        wordCount: content.replace(/\s/gu, '').length,
        orderIndex: startChapter + selectedIndex,
      });
    }
    if (chapters.length === 0) throw new Error('章节页面没有提取到有效正文');
    const title = normalizeText(extractTextBySelector(detailHtml, mapping.titleSelector ?? '#info h1') || extractTextBySelector(detailHtml, 'h1') || options.title);
    const summary = normalizeText(extractTextBySelector(detailHtml, mapping.summarySelector ?? '#intro') || extractTextBySelector(detailHtml, 'meta[name="description"]'));
    return {
      title,
      summary: summary || `采集自 HTML 页面：${title}`,
      sourceName: 'HTML 页面（需确认授权）',
      sourceExternalId: detailUrl,
      sourceUrl: detailUrl,
      sourceLicense: '由作者确认已获授权',
      chapters,
      isComplete: startChapter === 1 && chapters.length === orderedLinks.length,
      discoveredChapterCount: chapterLinks.length,
    };
  }

  private async fetchHtml(url: string, allowedHosts: string[]) {
    const parsed = validateUrl(url, allowedHosts);
    const wait = this.delayMs - (Date.now() - this.lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequestAt = Date.now();
    const response = await this.fetchImpl(parsed, { headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': 'NovelPlatformHtmlImporter/1.0' }, signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`HTML 页面请求失败：HTTP ${response.status}`);
    const html = await response.text();
    if (new TextEncoder().encode(html).byteLength > MAX_BYTES) throw new Error('HTML 响应超过 5MB 限制');
    return html;
  }
}

export function validateUrl(value: string, allowedHosts: string[]) {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('HTML 来源 URL 不合法'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('只允许 HTTP/HTTPS HTML 来源');
  if (allowedHosts.length > 0 && !allowedHosts.some((host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) {
    throw new Error(`HTML 来源域名未加入允许列表：${parsed.hostname}`);
  }
  return parsed;
}

type Anchor = { href: string; text: string; title: string };

export function extractAnchors(html: string): Anchor[] {
  return extractAnchorMatches(html).map((item) => item.anchor);
}

function selectAnchors(html: string, selector: string): Anchor[] {
  const descendant = selector.match(/^(.+?)\s+(a(?:\[[^\]]+\])?)$/iu);
  if (descendant) {
    const parentHtml = extractElementHtmlBySelector(html, descendant[1].trim());
    return parentHtml ? selectAnchors(parentHtml, descendant[2]) : [];
  }
  const anchorSelector = selector.match(/^a(?:\[([^\]]+)\])?$/iu);
  if (!anchorSelector) return [];
  const attributeSelector = anchorSelector[1]?.trim();
  return extractAnchorMatches(html)
    .filter(({ attrs }) => !attributeSelector || matchesAttributeSelector(attrs, attributeSelector))
    .map((item) => item.anchor);
}

export function extractTextBySelector(html: string, selector: string): string {
  if (selector.startsWith('meta[')) {
    const match = html.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/iu);
    return match ? decodeHtml(match[1]) : '';
  }
  const descendantMatch = selector.match(/^(.+?)\s+([a-z][\w-]*)$/iu);
  if (descendantMatch) {
    const parentHtml = extractElementHtmlBySelector(html, descendantMatch[1].trim());
    return parentHtml ? extractTextBySelector(parentHtml, descendantMatch[2]) : '';
  }
  const idMatch = selector.match(/^#([\w-]+)$/u) || selector.match(/^[\w-]+#([\w-]+)$/u);
  if (idMatch) return extractElementByAttribute(html, 'id', idMatch[1]);
  const classMatch = selector.match(/^\.([\w-]+)$/u) || selector.match(/^[\w-]+\.([\w-]+)$/u);
  if (classMatch) return extractElementByAttribute(html, 'class', classMatch[1]);
  const tag = selector.match(/^([a-z][\w-]*)$/iu)?.[1];
  if (tag) {
    const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'iu'));
    return match ? stripHtml(match[1]) : '';
  }
  return '';
}

function extractElementByAttribute(html: string, attributeName: string, attributeValue: string) {
  return stripHtml(extractElementHtmlByAttribute(html, attributeName, attributeValue));
}

function extractElementHtmlBySelector(html: string, selector: string) {
  const idMatch = selector.match(/^#([\w-]+)$/u);
  if (idMatch) return extractElementHtmlByAttribute(html, 'id', idMatch[1]);
  const classMatch = selector.match(/^\.([\w-]+)$/u);
  if (classMatch) return extractElementHtmlByAttribute(html, 'class', classMatch[1]);
  return '';
}

function extractElementHtmlByAttribute(html: string, attributeName: string, attributeValue: string) {
  const opening = new RegExp(`<([a-z][\\w-]*)\\b[^>]*\\b${attributeName}=["'][^"']*\\b${attributeValue}\\b[^"']*["'][^>]*>`, 'iu').exec(html);
  if (!opening) return '';
  const tagName = opening[1];
  const contentStart = opening.index + opening[0].length;
  if (/\/\s*>$/u.test(opening[0])) return '';
  const tokenPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'giu');
  tokenPattern.lastIndex = contentStart;
  let depth = 1;
  let token: RegExpExecArray | null;
  while ((token = tokenPattern.exec(html))) {
    if (/^<\//u.test(token[0])) {
      depth -= 1;
      if (depth === 0) return html.slice(contentStart, token.index);
    } else if (!/\/\s*>$/u.test(token[0])) {
      depth += 1;
    }
  }
  return html.slice(contentStart);
}

function extractAnchorMatches(html: string) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/giu)]
    .map((match) => {
      const attrs = match[1];
      return {
        attrs,
        anchor: {
          href: decodeHtml(attribute(attrs, 'href')),
          title: decodeHtml(attribute(attrs, 'title')),
          text: stripHtml(match[2]),
        },
      };
    })
    .filter((item) => item.anchor.href);
}

function matchesAttributeSelector(attrs: string, selector: string) {
  const match = selector.match(/^([\w:-]+)\s*(?:(\*=|\^=|\$=|~=|=)\s*(?:["']([^"']*)["']|([^\s]+)))?$/u);
  if (!match) return false;
  const name = match[1];
  const operator = match[2];
  const expected = decodeHtml(match[3] ?? match[4] ?? '');
  const actual = decodeHtml(attribute(attrs, name));
  if (!operator) return Boolean(actual);
  if (operator === '=') return actual === expected;
  if (operator === '*=') return actual.includes(expected);
  if (operator === '^=') return actual.startsWith(expected);
  if (operator === '$=') return actual.endsWith(expected);
  if (operator === '~=') return actual.split(/\s+/u).includes(expected);
  return false;
}

function attribute(attrs: string, name: string) { return attrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'iu'))?.[1] ?? ''; }
function stripHtml(value: string) { return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/giu, '').replace(/<style[\s\S]*?<\/style>/giu, '').replace(/<br\s*\/?>(?=.)/giu, '\n').replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim()); }
function decodeHtml(value: string) { return value.replace(/&nbsp;/giu, ' ').replace(/&amp;/giu, '&').replace(/&quot;/giu, '"').replace(/&#39;/giu, "'").replace(/&lt;/giu, '<').replace(/&gt;/giu, '>'); }
function normalizeText(value: string) { return value.replace(/\s+/gu, ' ').trim(); }
function dedupeByHref(anchors: Anchor[]) { return [...new Map(anchors.map((anchor) => [anchor.href, anchor])).values()]; }

function normalizeChapterNumber(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || value === undefined) return fallback;
  return Math.max(1, Math.floor(value));
}

function orderChapterLinks(links: Anchor[]) {
  const numbered = links.map((link, index) => ({ link, index, number: extractChapterOrdinal(link) }));
  if (numbered.length < 2 || numbered.some((item) => item.number === undefined)) return links;
  return numbered
    .sort((left, right) => (left.number! - right.number!) || (left.index - right.index))
    .map((item) => item.link);
}

function extractChapterOrdinal(anchor: Anchor) {
  const text = `${anchor.title} ${anchor.text} ${anchor.href}`;
  const arabic = text.match(/(?:第\s*)?(\d{1,8})(?:\s*[章节回]|$)/u)?.[1] ?? text.match(/(?:^|[/_-])(\d{1,8})(?:\.html)?(?:$|[/?#])/u)?.[1];
  if (arabic) return Number(arabic);
  const chinese = text.match(/第\s*([零〇一二两三四五六七八九十百千万]+)\s*[章节回]/u)?.[1];
  return chinese ? chineseNumeral(chinese) : undefined;
}

function chineseNumeral(value: string) {
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (![...value].some((char) => ['十', '百', '千', '万'].includes(char))) return digits[value] ?? undefined;
  let total = 0;
  let section = 0;
  let current = 0;
  for (const char of value) {
    if (char in digits) current = digits[char];
    else {
      const unit = char === '十' ? 10 : char === '百' ? 100 : char === '千' ? 1000 : 10000;
      if (unit === 10000) { section = (section + current) * unit; total += section; section = 0; }
      else { section += (current || 1) * unit; }
      current = 0;
    }
  }
  return total + section + current;
}
