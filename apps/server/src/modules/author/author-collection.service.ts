import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PublicDomainImporter } from '../../crawler/public-domain-importer';
import { WikisourceClient, type WikisourceWork } from '../../crawler/wikisource';
import { JsonSourceClient, type JsonImportedWork } from '../../crawler/json-source';
import { HtmlSourceClient, type HtmlImportedWork, validateUrl } from '../../crawler/html-source';
import { XsbookClient, type XsbookImportedWork } from '../../crawler/xsbook-source';
import { RequestUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { UploadsService } from '../uploads/uploads.service';
import { PreviewCollectionTaskDto } from './dto/preview-collection-task.dto';

const TASK_TTL_MS = 30 * 60 * 1000;
const MAX_CACHED_TASKS = 100;

type CollectionWork = WikisourceWork | JsonImportedWork | HtmlImportedWork | XsbookImportedWork;

interface CachedCollectionTask {
  id: string;
  ownerId: string;
  categoryId: string;
  categoryName: string;
  work: CollectionWork;
  createdAt: Date;
  expiresAt: Date;
  committing: boolean;
}

@Injectable()
export class AuthorCollectionService {
  private readonly tasks = new Map<string, CachedCollectionTask>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly uploadsService?: UploadsService,
  ) {}

  async preview(user: RequestUser, dto: PreviewCollectionTaskDto) {
    this.purgeExpiredTasks();
    const startChapter = dto.startChapter ?? 1;
    if (dto.endChapter !== undefined && dto.endChapter < startChapter) {
      throw new BadRequestException('结束章节不能小于起始章节');
    }
    if (dto.endChapter !== undefined && dto.endChapter - startChapter + 1 > 50) {
      throw new BadRequestException('单次最多采集 50 章，请拆分为多个章节范围');
    }
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
      select: { id: true, name: true },
    });
    if (!category) {
      throw new NotFoundException('所选作品分类不存在');
    }

    let work: CollectionWork;
    try {
      if (dto.sourceType === 'html') {
        if (!dto.sourceUrl) throw new Error('HTML 采集需要 sourceUrl');
        const allowedHosts = this.getAllowedHosts();
        const sourceUrl = validateUrl(dto.sourceUrl, allowedHosts);
        if (isXsbookHostname(sourceUrl.hostname)) {
          work = await this.createXsbookClient().fetchWork({
            bookUrl: resolveXsbookBookUrl(sourceUrl),
            keyword: resolveXsbookBookUrl(sourceUrl) ? undefined : dto.title,
            sourceAuthor: dto.sourceAuthor,
            maxChapters: dto.maxChapters ?? 20,
            startChapter: dto.startChapter,
            endChapter: dto.endChapter,
          });
        } else {
          work = await new HtmlSourceClient().fetchWork({
            url: sourceUrl.toString(),
            title: dto.title,
            maxChapters: dto.maxChapters ?? 20,
            startChapter: dto.startChapter,
            endChapter: dto.endChapter,
            allowedHosts,
            mapping: {
              titleSelector: dto.titleSelector,
              summarySelector: dto.summarySelector,
              chapterLinkSelector: dto.chapterLinkSelector,
              chapterContentSelector: dto.chapterContentSelector,
            },
          });
        }
      } else if (dto.sourceType === 'json') {
        if (!dto.sourceUrl || !dto.titlePath || !dto.chaptersPath || !dto.chapterTitlePath || !dto.chapterContentPath) {
          throw new Error('JSON 采集需要 sourceUrl、titlePath、chaptersPath、chapterTitlePath、chapterContentPath');
        }
        work = await new JsonSourceClient().fetchWork({
          url: dto.sourceUrl,
          maxChapters: dto.maxChapters ?? 20,
          startChapter: dto.startChapter,
          endChapter: dto.endChapter,
          mapping: {
            titlePath: dto.titlePath,
            summaryPath: dto.summaryPath,
            chaptersPath: dto.chaptersPath,
            chapterTitlePath: dto.chapterTitlePath,
            chapterContentPath: dto.chapterContentPath,
            chapterUrlPath: dto.chapterUrlPath,
            chapterIdPath: dto.chapterIdPath,
          },
        });
      } else {
        work = await this.createClient().fetchWork({
          title: dto.title,
          sourceAuthor: dto.sourceAuthor,
          maxChapters: dto.maxChapters ?? 20,
          startChapter: dto.startChapter,
          endChapter: dto.endChapter,
        });
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : '未知错误';
      throw new BadGatewayException(`采集来源连接失败：${reason}`);
    }

    const taskId = randomUUID();
    const now = new Date();
    const task: CachedCollectionTask = {
      id: taskId,
      ownerId: user.id,
      categoryId: category.id,
      categoryName: category.name,
      work,
      createdAt: now,
      expiresAt: new Date(now.getTime() + TASK_TTL_MS),
      committing: false,
    };
    this.makeCacheRoom();
    this.tasks.set(taskId, task);

    return this.toPreview(task);
  }

  async commit(user: RequestUser, taskId: string) {
    this.purgeExpiredTasks();
    const task = this.tasks.get(taskId);
    if (!task || task.ownerId !== user.id) {
      throw new GoneException('采集任务不存在或预览已过期，请重新采集');
    }
    if (task.committing) {
      throw new ConflictException('该采集任务正在导入，请勿重复提交');
    }

    task.committing = true;
    try {
      const work = await this.localizeCover(task.work);
      const result = await new PublicDomainImporter(this.prisma).importWork(work, {
        categoryName: task.categoryName,
        commit: true,
      });
      this.tasks.delete(task.id);
      return {
        ...result,
        sourceName: task.work.sourceName,
        sourceUrl: task.work.sourceUrl,
      };
    } catch (error) {
      task.committing = false;
      throw error;
    }
  }

  protected createClient() {
    return new WikisourceClient();
  }

  protected createXsbookClient() {
    return new XsbookClient();
  }

  async analyzeJsonSource(url: string) {
    return new JsonSourceClient().analyze(url);
  }

  async analyzeHtmlSource(url: string) {
    return new HtmlSourceClient().analyze(url, this.getAllowedHosts());
  }

  private getAllowedHosts() {
    return (process.env.CRAWLER_ALLOWED_DOMAINS ?? '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }

  private async localizeCover(work: CollectionWork): Promise<CollectionWork> {
    if (!work.coverUrl || !this.uploadsService || work.coverUrl.startsWith('/api/uploads/covers/')) {
      return work;
    }
    try {
      const saved = await this.uploadsService.saveRemoteCover(work.coverUrl);
      return { ...work, coverUrl: saved.url };
    } catch {
      // 封面失败不应阻断正文导入；保留来源 URL 作为回退。
      return work;
    }
  }

  private toPreview(task: CachedCollectionTask) {
    return {
      taskId: task.id,
      createdAt: task.createdAt.toISOString(),
      expiresAt: task.expiresAt.toISOString(),
      title: task.work.title,
      summary: task.work.summary,
      coverUrl: task.work.coverUrl ?? null,
      category: {
        id: task.categoryId,
        name: task.categoryName,
      },
      sourceName: task.work.sourceName,
      sourceUrl: task.work.sourceUrl,
      sourceAuthor: 'sourceAuthor' in task.work ? task.work.sourceAuthor ?? null : null,
      sourceLicense: task.work.sourceLicense,
      chapterCount: task.work.chapters.length,
      discoveredChapterCount: task.work.discoveredChapterCount,
      wordCount: task.work.chapters.reduce((total, chapter) => total + chapter.wordCount, 0),
      isComplete: task.work.isComplete,
      chapters: task.work.chapters.map((chapter, index) => ({
        externalId: chapter.externalId,
        title: chapter.title,
        wordCount: chapter.wordCount,
        sourceUrl: chapter.url,
        orderIndex: chapter.orderIndex ?? index + 1,
      })),
    };
  }

  private purgeExpiredTasks() {
    const now = Date.now();
    for (const [taskId, task] of this.tasks) {
      if (task.expiresAt.getTime() <= now && !task.committing) {
        this.tasks.delete(taskId);
      }
    }
  }

  private makeCacheRoom() {
    if (this.tasks.size < MAX_CACHED_TASKS) return;
    const oldest = [...this.tasks.values()]
      .filter((task) => !task.committing)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())[0];
    if (oldest) this.tasks.delete(oldest.id);
  }
}

function isXsbookHostname(hostname: string) {
  return hostname.toLowerCase() === 'xsbook.org' || hostname.toLowerCase() === 'www.xsbook.org';
}

function resolveXsbookBookUrl(url: URL) {
  if (/^\/\d+_\d+\/?$/u.test(url.pathname)) return url.toString();
  const chapterMatch = url.pathname.match(/^\/(\d+_\d+)\/\d+(?:_\d+)?\.html$/u);
  return chapterMatch ? new URL(`/${chapterMatch[1]}/`, url.origin).toString() : undefined;
}
