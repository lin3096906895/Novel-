// -*- coding: utf-8 -*-
/**
 * 顶点小说 (www.xsbook.org) 导入 CLI
 *
 * 两种模式：
 *   1. 搜索模式：--search "书名" → 搜到结果后选书抓章节
 *   2. 分类模式：--cat 1 → 爬取分类列表，存 JSON
 *
 * 用法：
 *   # 搜索并抓取（预览）
 *   pnpm --filter @novel/server crawler:xsbook -- --search "人族镇守使" --max-chapters 10
 *
 *   # 搜索并导入数据库
 *   pnpm --filter @novel/server crawler:xsbook -- --search "人族镇守使" --category "玄幻" --commit
 *
 *   # 爬取分类列表
 *   pnpm --filter @novel/server crawler:xsbook -- --cat 1 --max-pages 5 --out F:/爬虫/xclass_1.json
 *
 *   # 指定 URL 直接抓取
 *   pnpm --filter @novel/server crawler:xsbook -- --url "http://www.xsbook.org/120_120222/" --category "玄幻" --commit
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PublicDomainImporter } from './public-domain-importer';
import { XsbookClient, XsbookFetchOptions } from './xsbook-source';

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------

interface CliOptions {
  search: string;
  url: string;
  cat: number;
  category: string;
  maxChapters: number;
  maxPages: number;
  workers: number;
  delayMs: number;
  minContentLength: number;
  out: string;
  commit: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    search: '',
    url: '',
    cat: 0,
    category: '',
    maxChapters: 20,
    maxPages: 3,
    workers: 8,
    delayMs: 800,
    minContentLength: 80,
    out: '',
    commit: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) throw new Error(`${arg} 缺少参数值`);
      i++;
      return v;
    };

    switch (arg) {
      case '--search':       opts.search = next(); break;
      case '--url':          opts.url = next(); break;
      case '--cat':          opts.cat = parseInt(next(), 10); break;
      case '--category':     opts.category = next(); break;
      case '--max-chapters': opts.maxChapters = parseInt(next(), 10); break;
      case '--all-chapters': opts.maxChapters = Infinity; break;
      case '--max-pages':    opts.maxPages = parseInt(next(), 10); break;
      case '--all-pages':    opts.maxPages = Infinity; break;
      case '--workers':      opts.workers = parseInt(next(), 10); break;
      case '--delay-ms':     opts.delayMs = parseInt(next(), 10); break;
      case '--min-content-length': opts.minContentLength = parseInt(next(), 10); break;
      case '--out':          opts.out = next(); break;
      case '--commit':       opts.commit = true; break;
      case '--help':
      case '-h':             opts.help = true; break;
      default:               throw new Error(`未知参数：${arg}`);
    }
  }

  if (!opts.help) {
    const hasSearch = opts.search.trim() !== '';
    const hasUrl = opts.url.trim() !== '';
    const hasCat = opts.cat > 0;
    if (!hasSearch && !hasUrl && !hasCat) {
      throw new Error('必须提供 --search、--url 或 --cat 之一');
    }
    if (opts.commit && !opts.category.trim()) {
      throw new Error('--commit 模式必须提供 --category');
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { printHelp(); return; }

  const client = new XsbookClient({ delayMs: opts.delayMs });

  // -------- 模式 1：分类爬取 --------
  if (opts.cat > 0) {
    console.log(`分类 ${opts.cat}，最多 ${opts.maxPages === Infinity ? '全部' : opts.maxPages} 页，抓取中...`);
    const books = await client.crawlCategory(opts.cat, opts.maxPages, (page, total, batch) => {
      console.log(`  第 ${page}/${total} 页：${batch.length} 本`);
    });

    const outPath = opts.out || `xclass_${opts.cat}.json`;
    writeFileSync(outPath, JSON.stringify(books, null, 2), 'utf-8');
    console.log(`完成！共 ${books.length} 本，已保存到 ${outPath}`);
    return;
  }

  // -------- 模式 2：搜索 / URL 抓取 --------
  const fetchOptions: XsbookFetchOptions = {
    keyword: opts.search || undefined,
    bookUrl: opts.url || undefined,
    maxChapters: opts.maxChapters,
    workers: opts.workers,
    delayMs: opts.delayMs,
    minContentLength: opts.minContentLength,
  };

  console.log(opts.search ? `搜索"${opts.search}"...` : `抓取 ${opts.url}...`);
  const work = await client.fetchWork(fetchOptions);

  console.log('');
  console.log(`书名：${work.title}`);
  console.log(`作者：${work.sourceAuthor}`);
  console.log(`摘要：${work.summary.slice(0, 120)}...`);
  console.log(`章节：${work.chapters.filter((c) => c.wordCount > 0).length}/${work.discoveredChapterCount}（来源发现）`);
  console.log(`字数：${work.chapters.reduce((s, c) => s + c.wordCount, 0)}`);
  console.log('章节预览：');
  for (const ch of work.chapters.slice(0, 10)) {
    const preview = ch.content.slice(0, 60).replace(/\n/g, ' ');
    console.log(`  ${ch.title}（${ch.wordCount} 字）${preview}...`);
  }
  if (work.chapters.length > 10) {
    console.log(`  ……其余 ${work.chapters.length - 10} 章`);
  }

  // -------- 导入数据库 --------
  if (opts.commit) {
    loadEnv();
    const prisma = new PrismaClient();
    try {
      // 适配成 PublicDomainImporter 期望的格式
      const result = await new PublicDomainImporter(prisma).importWork(
        {
          title: work.title,
          summary: work.summary,
          coverUrl: work.coverUrl,
          sourceName: work.sourceName,
          sourceExternalId: work.sourceExternalId,
          sourceUrl: work.sourceUrl,
          sourceAuthor: work.sourceAuthor,
          sourceLicense: work.sourceLicense,
          chapters: work.chapters
            .filter((c) => c.wordCount > 0)
            .map((c) => ({
              externalId: c.externalId,
              title: c.title,
              content: c.content,
              url: c.url,
              wordCount: c.wordCount,
            })),
          isComplete: work.isComplete,
          discoveredChapterCount: work.discoveredChapterCount,
        },
        { categoryName: opts.category, commit: true },
      );

      console.log('');
      console.log(`导入完成！作品 ID：${result.novelId}`);
    } finally {
      await prisma.$disconnect();
    }
  } else {
    console.log('');
    console.log('预览模式。加 --category "分类名" --commit 写入数据库。');
  }
}

// ---------------------------------------------------------------------------
// 辅助
// ---------------------------------------------------------------------------

function loadEnv() {
  if (process.env.DATABASE_URL) return;
  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), 'apps/server/.env'),
    resolve(__dirname, '../../.env'),
  ];
  for (const fp of candidates) {
    if (!existsSync(fp)) continue;
    const line = readFileSync(fp, 'utf8')
      .split(/\r?\n/)
      .find((l) => /^\s*DATABASE_URL\s*=/.test(l));
    if (!line) continue;
    const val = line.slice(line.indexOf('=') + 1).trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, '$1$2');
    if (val) { process.env.DATABASE_URL = val; return; }
  }
}

function printHelp() {
  console.log(`顶点小说 (xsbook.org) 爬虫工具

用法：
  pnpm --filter @novel/server crawler:xsbook -- [选项]

模式 1：搜索抓取
  --search <关键词>        搜索书名
  --url <URL>              直接指定书籍详情页 URL
  --category <分类名>      平台中已存在的分类（--commit 时必填）
  --max-chapters <数量>    最多抓取章节数，默认 20
  --all-chapters           抓取全部章节
  --workers <数量>         并发线程数，默认 8
  --delay-ms <毫秒>        请求间隔，默认 800
  --min-content-length <N> 最小正文字符数，默认 80
  --commit                 写入数据库，不提供则只预览

模式 2：分类爬取
  --cat <ID>               分类 ID（1玄幻 2武侠 3女频 4现代 5历史 6游戏 7科幻 8美文 9其他）
  --max-pages <数量>       最多抓取页数，默认 3
  --all-pages              抓取全部页面
  --out <路径>             输出 JSON 文件路径
  --delay-ms <毫秒>        请求间隔，默认 800

示例：
  # 搜索预览
  pnpm --filter @novel/server crawler:xsbook -- --search "人族镇守使"

  # 搜索并导入
  pnpm --filter @novel/server crawler:xsbook -- --search "人族镇守使" --category "玄幻" --commit

  # 爬分类列表
  pnpm --filter @novel/server crawler:xsbook -- --cat 1 --max-pages 5 --out F:/爬虫/xclass_1.json
`);
}

if (require.main === module) {
  void main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
