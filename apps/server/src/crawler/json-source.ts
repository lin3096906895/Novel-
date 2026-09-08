import { URL } from 'node:url';

export type JsonMapping = {
  titlePath: string;
  summaryPath?: string;
  chaptersPath: string;
  chapterTitlePath: string;
  chapterContentPath: string;
  chapterUrlPath?: string;
  chapterIdPath?: string;
};

export type JsonSourceOptions = {
  url: string;
  mapping: JsonMapping;
  maxChapters?: number;
  startChapter?: number;
  endChapter?: number;
  headers?: Record<string, string>;
};

export type JsonAnalysis = {
  url: string;
  rootType: string;
  fields: Array<{ path: string; type: string; sample: unknown }>;
  arrays: Array<{ path: string; length: number; itemFields: string[] }>;
  candidates: {
    titlePaths: string[];
    summaryPaths: string[];
    chapterArrayPaths: string[];
    contentPaths: string[];
    urlPaths: string[];
  };
};

export type JsonImportedWork = {
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

const MAX_BYTES = 50 * 1024 * 1024;

export class JsonSourceClient {
  constructor(private readonly fetchImpl: typeof fetch = globalThis.fetch) {}

  async analyze(url: string, headers?: Record<string, string>): Promise<JsonAnalysis> {
    const payload = await this.fetchJson(url, headers);
    return analyzeJson(url, payload);
  }

  async fetchWork(options: JsonSourceOptions): Promise<JsonImportedWork> {
    const payload = await this.fetchJson(options.url, options.headers);
    const title = stringValue(readPath(payload, options.mapping.titlePath));
    if (!title) throw new Error(`titlePath 未找到文本：${options.mapping.titlePath}`);
    const chapterValue = readPath(payload, options.mapping.chaptersPath);
    if (!Array.isArray(chapterValue)) {
      throw new Error(`chaptersPath 未找到数组：${options.mapping.chaptersPath}`);
    }
    const startChapter = normalizeChapterNumber(options.startChapter, 1);
    const requestedEnd = options.endChapter === undefined
      ? startChapter + Math.max(1, normalizeChapterNumber(options.maxChapters, 20)) - 1
      : normalizeChapterNumber(options.endChapter, startChapter);
    if (requestedEnd < startChapter) throw new Error('结束章节不能小于起始章节');
    if (startChapter > chapterValue.length) throw new Error(`起始章节超过目录范围（共 ${chapterValue.length} 章）`);
    const selected = chapterValue.slice(startChapter - 1, Math.min(chapterValue.length, requestedEnd));
    const chapters = selected.map((item, index) => {
      const content = stringValue(readPath(item, options.mapping.chapterContentPath));
      const chapterNumber = startChapter + index;
      const chapterTitle = stringValue(readPath(item, options.mapping.chapterTitlePath)) || `第${chapterNumber}章`;
      if (!content) throw new Error(`第 ${chapterNumber} 条章节缺少正文：${options.mapping.chapterContentPath}`);
      return {
        externalId: stringValue(options.mapping.chapterIdPath ? readPath(item, options.mapping.chapterIdPath) : undefined) || String(chapterNumber),
        title: chapterTitle,
        content: content.trim(),
        url: stringValue(options.mapping.chapterUrlPath ? readPath(item, options.mapping.chapterUrlPath) : undefined) || options.url,
        wordCount: content.replace(/\s/gu, '').length,
        orderIndex: chapterNumber,
      };
    });
    return {
      title,
      summary: stringValue(options.mapping.summaryPath ? readPath(payload, options.mapping.summaryPath) : undefined) || `采集自 JSON 接口：${title}`,
      sourceName: 'JSON 接口（需确认授权）',
      sourceExternalId: options.url,
      sourceUrl: options.url,
      sourceLicense: '由作者确认已获授权',
      chapters,
      isComplete: startChapter === 1 && selected.length === chapterValue.length,
      discoveredChapterCount: chapterValue.length,
    };
  }

  private async fetchJson(url: string, headers?: Record<string, string>) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new Error('JSON 来源 URL 不合法'); }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('只允许 HTTP/HTTPS JSON 来源');
    const response = await this.fetchImpl(parsed, {
      headers: { Accept: 'application/json', 'User-Agent': 'NovelPlatformJsonImporter/1.0', ...headers },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`JSON 接口请求失败：HTTP ${response.status}`);
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BYTES) throw new Error('JSON 响应超过 5MB 限制');
    try { return JSON.parse(text) as unknown; } catch { throw new Error('响应不是合法 JSON'); }
  }
}

function normalizeChapterNumber(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value) || value === undefined) return fallback;
  return Math.max(1, Math.floor(value));
}

export function readPath(value: unknown, path: string): unknown {
  const tokens = path.replace(/^\$\.?/u, '').split(/[.[\]]+/u).filter(Boolean);
  return tokens.reduce<unknown>((current, token) => {
    if (current && typeof current === 'object') return (current as Record<string, string>)[token];
    return undefined;
  }, value);
}

export function analyzeJson(url: string, payload: unknown): JsonAnalysis {
  const fields: JsonAnalysis['fields'] = [];
  const arrays: JsonAnalysis['arrays'] = [];
  walk(payload, '$', fields, arrays);
  const paths = fields.map((field) => field.path);
  const byName = (names: string[]) => paths.filter((path) => names.some((name) => path.toLowerCase().endsWith(name)));
  return {
    url,
    rootType: typeOf(payload),
    fields: fields.slice(0, 200),
    arrays: arrays.slice(0, 100),
    candidates: {
      titlePaths: byName(['title', 'bookname', 'novelname', 'name']).slice(0, 20),
      summaryPaths: byName(['summary', 'description', 'intro', 'introduction']).slice(0, 20),
      chapterArrayPaths: arrays.map((item) => item.path).filter((path) => /chapter|section|content|data|list|items/iu.test(path)).slice(0, 20),
      contentPaths: byName(['content', 'text', 'body']).slice(0, 20),
      urlPaths: byName(['url', 'link', 'href']).slice(0, 20),
    },
  };
}

function walk(value: unknown, path: string, fields: JsonAnalysis['fields'], arrays: JsonAnalysis['arrays']) {
  if (Array.isArray(value)) {
    const first = value[0];
    arrays.push({ path, length: value.length, itemFields: first && typeof first === 'object' && !Array.isArray(first) ? Object.keys(first) : [] });
    if (first !== undefined) walk(first, `${path}[0]`, fields, arrays);
    return;
  }
  if (!value || typeof value !== 'object') {
    fields.push({ path, type: typeOf(value), sample: typeof value === 'string' ? value.slice(0, 120) : value });
    return;
  }
  for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`, fields, arrays);
}

function typeOf(value: unknown) { return Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value; }
function stringValue(value: unknown) { return typeof value === 'string' || typeof value === 'number' ? String(value) : ''; }
