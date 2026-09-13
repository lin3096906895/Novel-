import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AuthorRagService } from '../modules/author/author-rag.service';
import { PrismaService } from '../modules/prisma/prisma.service';

type CliOptions = {
  novelId?: string;
  title?: string;
  maxChapterOrder?: number;
};

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.novelId && !options.title) {
    throw new Error('请使用 --novel-id <ID> 或 --title <书名> 指定作品。');
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const prisma = app.get(PrismaService, { strict: false });
    const rag = app.get(AuthorRagService, { strict: false });
    const novel = await prisma.novel.findFirst({
      where: options.novelId ? { id: options.novelId } : { title: options.title },
      select: { id: true, title: true, _count: { select: { chapters: true } } },
    });
    if (!novel) {
      throw new Error('没有找到指定作品。');
    }

    const before = await rag.getNovelIndexStatus(novel.id);
    const result = await rag.indexNovel({
      novelId: novel.id,
      ...(options.maxChapterOrder ? { maxChapterOrder: options.maxChapterOrder } : {}),
    });
    const after = await rag.getNovelIndexStatus(novel.id);
    process.stdout.write(
      `${JSON.stringify({ novel, before, result, after }, null, 2)}\n`,
    );
  } finally {
    await app.close();
  }
}

function parseArguments(args: string[]): CliOptions {
  const options: CliOptions = {};
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index + 1];
    if (args[index] === '--novel-id' && value) {
      options.novelId = value;
      index += 1;
    } else if (args[index] === '--title' && value) {
      options.title = value;
      index += 1;
    } else if (args[index] === '--max-chapter-order' && value) {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error('--max-chapter-order 必须是大于 0 的整数。');
      }
      options.maxChapterOrder = parsed;
      index += 1;
    }
  }
  return options;
}

main().catch((error) => {
  Logger.error(error instanceof Error ? error.message : error, 'RagReindexCli');
  process.exitCode = 1;
});
