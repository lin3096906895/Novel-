import { ChapterStatus, NovelStatus, Prisma, PrismaClient, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import type { WikisourceWork } from './wikisource';

const LIBRARY_EMAIL = 'public-domain-library@novel.local';
const LIBRARY_NAME = '公版图书馆';

type ImportTransaction = Pick<
  Prisma.TransactionClient,
  'user' | 'authorProfile' | 'category' | 'novel' | 'novelVolume' | 'chapter'
>;

export interface PublicDomainImportOptions {
  categoryName: string;
  tags?: string[];
  commit?: boolean;
}

export interface PublicDomainImportResult {
  mode: 'preview' | 'committed';
  novelId?: string;
  title: string;
  categoryName: string;
  chapterCount: number;
  wordCount: number;
  isComplete: boolean;
}

export class PublicDomainImporter {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly passwordHashFactory = () => hash(randomBytes(48).toString('hex'), 12),
  ) {}

  async importWork(
    work: WikisourceWork,
    options: PublicDomainImportOptions,
  ): Promise<PublicDomainImportResult> {
    const categoryName = options.categoryName.trim();
    if (!categoryName) {
      throw new Error('导入分类不能为空');
    }

    const preview = {
      title: work.title,
      categoryName,
      chapterCount: work.chapters.length,
      wordCount: work.chapters.reduce((total, chapter) => total + chapter.wordCount, 0),
      isComplete: work.isComplete,
    };
    if (!options.commit) {
      return { mode: 'preview', ...preview };
    }

    const passwordHash = await this.passwordHashFactory();
    const novelId = await this.prisma.$transaction(
      (transaction) => this.persistWork(transaction, work, categoryName, options.tags ?? [], passwordHash),
      { timeout: 30_000 },
    );

    return {
      mode: 'committed',
      novelId,
      ...preview,
    };
  }

  private async persistWork(
    transaction: ImportTransaction,
    work: WikisourceWork,
    categoryName: string,
    tags: string[],
    passwordHash: string,
  ) {
    const category = await transaction.category.findUnique({ where: { name: categoryName } });
    if (!category) {
      throw new Error(`分类“${categoryName}”不存在，请先在管理端创建该分类或更换 --category`);
    }

    const libraryUser = await transaction.user.upsert({
      where: { email: LIBRARY_EMAIL },
      update: {
        nickname: LIBRARY_NAME,
        role: UserRole.AUTHOR,
      },
      create: {
        email: LIBRARY_EMAIL,
        nickname: LIBRARY_NAME,
        passwordHash,
        role: UserRole.AUTHOR,
      },
    });
    await transaction.authorProfile.upsert({
      where: { userId: libraryUser.id },
      update: {
        penName: LIBRARY_NAME,
        bio: '收录已核对为公版或具有明确自由许可的作品；原作者与来源请查看作品详情。',
      },
      create: {
        userId: libraryUser.id,
        penName: LIBRARY_NAME,
        bio: '收录已核对为公版或具有明确自由许可的作品；原作者与来源请查看作品详情。',
      },
    });

    const cleanTags = [...new Set(['公版', '经典', ...tags].map((tag) => tag.trim()).filter(Boolean))];
    const tagWrites = cleanTags.map((name) => ({
      where: { name },
      create: { name },
    }));
    const sourceKey = buildSourceKey(work.sourceName, work.sourceExternalId);
    const novel = await transaction.novel.upsert({
      where: { sourceKey },
      update: {
        title: work.title,
        summary: work.summary,
        ...(work.coverUrl ? { coverUrl: work.coverUrl } : {}),
        authorId: libraryUser.id,
        categoryId: category.id,
        sourceName: work.sourceName,
        sourceExternalId: work.sourceExternalId,
        sourceUrl: work.sourceUrl,
        sourceAuthor: work.sourceAuthor ?? null,
        sourceLicense: work.sourceLicense,
        ...(work.isComplete ? { status: NovelStatus.COMPLETED } : {}),
        tags: { connectOrCreate: tagWrites },
      },
      create: {
        title: work.title,
        summary: work.summary,
        coverUrl: work.coverUrl,
        authorId: libraryUser.id,
        categoryId: category.id,
        status: work.isComplete ? NovelStatus.COMPLETED : NovelStatus.SERIALIZING,
        sourceKey,
        sourceName: work.sourceName,
        sourceExternalId: work.sourceExternalId,
        sourceUrl: work.sourceUrl,
        sourceAuthor: work.sourceAuthor,
        sourceLicense: work.sourceLicense,
        tags: { connectOrCreate: tagWrites },
      },
    });

    const volume = await transaction.novelVolume.upsert({
      where: {
        novelId_orderIndex: {
          novelId: novel.id,
          orderIndex: 1,
        },
      },
      update: { title: '正文' },
      create: {
        novelId: novel.id,
        title: '正文',
        orderIndex: 1,
      },
    });

    const importedAt = new Date();
    for (const [index, chapter] of work.chapters.entries()) {
      const chapterSourceKey = buildSourceKey(work.sourceName, chapter.externalId);
      const orderIndex = chapter.orderIndex ?? index + 1;
      await transaction.chapter.upsert({
        where: { sourceKey: chapterSourceKey },
        update: {
          novelId: novel.id,
          volumeId: volume.id,
          title: chapter.title,
          content: chapter.content,
          orderIndex,
          status: ChapterStatus.PUBLISHED,
          wordCount: chapter.wordCount,
          deletedAt: null,
          sourceName: work.sourceName,
          sourceExternalId: chapter.externalId,
          sourceUrl: chapter.url,
        },
        create: {
          novelId: novel.id,
          volumeId: volume.id,
          title: chapter.title,
          content: chapter.content,
          orderIndex,
          status: ChapterStatus.PUBLISHED,
          wordCount: chapter.wordCount,
          publishedAt: importedAt,
          sourceKey: chapterSourceKey,
          sourceName: work.sourceName,
          sourceExternalId: chapter.externalId,
          sourceUrl: chapter.url,
        },
      });
    }

    const wordCount = await transaction.chapter.aggregate({
      where: {
        novelId: novel.id,
        status: ChapterStatus.PUBLISHED,
        deletedAt: null,
      },
      _sum: { wordCount: true },
    });
    await transaction.novel.update({
      where: { id: novel.id },
      data: { wordCount: wordCount._sum.wordCount ?? 0 },
    });

    return novel.id;
  }
}

export function buildSourceKey(sourceName: string, externalId: string) {
  return `${sourceName}:${externalId}`;
}
