import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PublicDomainImporter } from './public-domain-importer';
import { WikisourceClient, WIKISOURCE_DEFAULT_LICENSE } from './wikisource';

interface CliOptions {
  title: string;
  category: string;
  sourceAuthor?: string;
  summary?: string;
  sourceLicense: string;
  tags: string[];
  maxChapters: number;
  minContentLength: number;
  delayMs: number;
  commit: boolean;
  help: boolean;
}

export function parseCliArguments(argv: string[]): CliOptions {
  const options: CliOptions = {
    title: '',
    category: '',
    sourceLicense: WIKISOURCE_DEFAULT_LICENSE,
    tags: [],
    maxChapters: 20,
    minContentLength: 80,
    delayMs: 800,
    commit: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} 缺少参数值`);
      }
      index += 1;
      return value;
    };

    switch (argument) {
      case '--title':
        options.title = nextValue();
        break;
      case '--category':
        options.category = nextValue();
        break;
      case '--source-author':
        options.sourceAuthor = nextValue();
        break;
      case '--summary':
        options.summary = nextValue();
        break;
      case '--license':
        options.sourceLicense = nextValue();
        break;
      case '--tags':
        options.tags = nextValue().split(',').map((tag) => tag.trim()).filter(Boolean);
        break;
      case '--max-chapters':
        options.maxChapters = parsePositiveInteger(argument, nextValue());
        break;
      case '--all-chapters':
        options.maxChapters = Number.POSITIVE_INFINITY;
        break;
      case '--min-content-length':
        options.minContentLength = parsePositiveInteger(argument, nextValue());
        break;
      case '--delay-ms':
        options.delayMs = parseNonNegativeInteger(argument, nextValue());
        break;
      case '--commit':
        options.commit = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`未知参数：${argument}`);
    }
  }

  if (!options.help && (!options.title.trim() || !options.category.trim())) {
    throw new Error('必须同时提供 --title 和 --category');
  }
  return options;
}

async function main() {
  const options = parseCliArguments(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  console.log(`正在从中文维基文库读取《${options.title}》……`);
  const client = new WikisourceClient({ delayMs: options.delayMs });
  let work = await client.fetchWork({
    title: options.title,
    sourceAuthor: options.sourceAuthor,
    sourceLicense: options.sourceLicense,
    maxChapters: options.maxChapters,
    minContentLength: options.minContentLength,
  });
  if (options.summary?.trim()) {
    work = { ...work, summary: options.summary.trim() };
  }

  loadDatabaseEnvironment();
  const prisma = new PrismaClient();
  try {
    const result = await new PublicDomainImporter(prisma).importWork(work, {
      categoryName: options.category,
      tags: options.tags,
      commit: options.commit,
    });

    console.log('');
    console.log(`作品：${result.title}`);
    console.log(`章节：${result.chapterCount}（来源发现 ${work.discoveredChapterCount} 个章节页面）`);
    console.log(`字数：${result.wordCount}`);
    console.log(`状态：${result.isComplete ? '已获取完整目录' : '本次只获取部分章节'}`);
    console.log(`来源：${work.sourceUrl}`);
    console.log('章节预览：');
    for (const chapter of work.chapters.slice(0, 10)) {
      console.log(`  ${chapter.title}（${chapter.wordCount} 字）`);
    }
    if (work.chapters.length > 10) {
      console.log(`  ……其余 ${work.chapters.length - 10} 章`);
    }

    if (result.mode === 'preview') {
      console.log('');
      console.log('当前是预览模式，数据库没有变化。核对来源页版权状态和章节内容后，加 --commit 正式导入。');
    } else {
      console.log('');
      console.log(`导入完成，作品 ID：${result.novelId}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

function loadDatabaseEnvironment() {
  if (process.env.DATABASE_URL) return;
  const candidates = [resolve(process.cwd(), '.env'), resolve(process.cwd(), 'apps/server/.env'), resolve(__dirname, '../../.env')];
  for (const filePath of candidates) {
    if (!existsSync(filePath)) continue;
    const line = readFileSync(filePath, 'utf8')
      .split(/\r?\n/u)
      .find((entry) => /^\s*DATABASE_URL\s*=/.test(entry));
    if (!line) continue;
    const value = line.slice(line.indexOf('=') + 1).trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, '$1$2');
    if (value) {
      process.env.DATABASE_URL = value;
      return;
    }
  }
}

function parsePositiveInteger(name: string, rawValue: string) {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} 必须是正整数`);
  }
  return value;
}

function parseNonNegativeInteger(name: string, rawValue: string) {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} 必须是大于或等于 0 的整数`);
  }
  return value;
}

function printUsage() {
  console.log(`用法：
  pnpm --filter @novel/server crawler:wikisource -- --title "红楼梦" --category "古代言情" [选项]

必填：
  --title <页面名>               中文维基文库根页面标题
  --category <分类名>            平台中已经存在的分类

选项：
  --source-author <姓名>         原作者
  --summary <简介>               覆盖自动生成的作品简介
  --license <许可说明>           覆盖默认许可说明
  --tags <标签1,标签2>           添加作品标签
  --max-chapters <数量>          最多导入多少章，默认 20
  --all-chapters                 导入检测到的全部章节
  --min-content-length <字符数>  过滤过短页面，默认 80
  --delay-ms <毫秒>              API 请求间隔，默认 800
  --commit                       写入数据库；不提供时只预览
  --help                         显示帮助`);
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
