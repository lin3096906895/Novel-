import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChapterStatus,
  ChapterVersionSource,
  NovelStatus,
  Prisma,
  SensitiveWordScope,
  UserRole,
} from '@prisma/client';
import { SensitiveWordsService } from '../moderation/sensitive-words.service';
import { PrismaService } from '../prisma/prisma.service';
import { ChapterPublicationService } from '../publication/chapter-publication.service';
import { RequestUser } from '../auth/auth.types';
import { AuthorDashboardQueryDto } from './dto/author-dashboard-query.dto';
import { AssignChapterVolumeDto } from './dto/assign-chapter-volume.dto';
import { BatchDeleteChaptersDto } from './dto/batch-delete-chapters.dto';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { CreateNovelDto } from './dto/create-novel.dto';
import { CreateVolumeDto } from './dto/create-volume.dto';
import { ReorderChaptersDto } from './dto/reorder-chapters.dto';
import { ReorderVolumesDto } from './dto/reorder-volumes.dto';
import { UpdateChapterDto } from './dto/update-chapter.dto';
import { UpdateChapterScheduleDto } from './dto/update-chapter-schedule.dto';
import { UpdateNovelLifecycleDto } from './dto/update-novel-lifecycle.dto';
import { UpdateNovelDto } from './dto/update-novel.dto';
import { UpdateVolumeDto } from './dto/update-volume.dto';

const AUTOSAVE_SNAPSHOT_INTERVAL_MS = 10 * 60 * 1000;

@Injectable()
export class AuthorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publicationService: ChapterPublicationService,
    private readonly sensitiveWordsService: SensitiveWordsService,
  ) {}

  async createNovel(user: RequestUser, dto: CreateNovelDto) {
    await this.ensureCategoryExists(dto.categoryId);
    this.validateNovelForAction(dto);
    const tagNames = this.normalizeTagNames(dto.tagNames);
    if (dto.action !== 'save') {
      await this.sensitiveWordsService.assertAllowed(SensitiveWordScope.NOVEL, [
        { label: '书名', text: dto.title },
        { label: '简介', text: dto.summary },
        { label: '标签', text: tagNames.join(' ') },
      ]);
    }

    return this.prisma.novel.create({
      data: {
        title: dto.title.trim(),
        summary: dto.summary.trim(),
        coverUrl: dto.coverUrl?.trim(),
        categoryId: dto.categoryId,
        authorId: user.id,
        status: dto.action === 'save' ? NovelStatus.DRAFT : NovelStatus.REVIEWING,
        volumes: {
          create: {
            title: '正文',
            orderIndex: 1,
          },
        },
        tags: tagNames.length
          ? {
              connectOrCreate: tagNames.map((name) => ({
                where: { name },
                create: { name },
              })),
            }
          : undefined,
      },
      include: {
        category: true,
        tags: true,
        volumes: { orderBy: { orderIndex: 'asc' } },
      },
    });
  }

  async createVolume(user: RequestUser, novelId: string, dto: CreateVolumeDto) {
    await this.ensureNovelOwnership(user, novelId);
    const latest = await this.prisma.novelVolume.findFirst({
      where: { novelId },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });

    return this.prisma.novelVolume.create({
      data: {
        novelId,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        orderIndex: (latest?.orderIndex ?? 0) + 1,
      },
      include: {
        _count: { select: { chapters: { where: { deletedAt: null } } } },
      },
    });
  }

  async updateVolume(user: RequestUser, volumeId: string, dto: UpdateVolumeDto) {
    const volume = await this.prisma.novelVolume.findUnique({
      where: { id: volumeId },
      select: { id: true, novel: { select: { authorId: true } } },
    });
    if (!volume) {
      throw new NotFoundException('分卷不存在');
    }
    if (volume.novel.authorId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('只能管理自己作品的分卷');
    }

    return this.prisma.novelVolume.update({
      where: { id: volumeId },
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
      },
      include: {
        _count: { select: { chapters: { where: { deletedAt: null } } } },
      },
    });
  }

  async deleteVolume(user: RequestUser, volumeId: string) {
    const volume = await this.prisma.novelVolume.findUnique({
      where: { id: volumeId },
      include: {
        novel: { select: { authorId: true } },
        _count: { select: { chapters: { where: { deletedAt: null } } } },
      },
    });
    if (!volume) {
      throw new NotFoundException('分卷不存在');
    }
    if (volume.novel.authorId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('只能管理自己作品的分卷');
    }
    if (volume._count.chapters > 0) {
      throw new BadRequestException('分卷内仍有章节，请先移动章节后再删除');
    }

    await this.prisma.novelVolume.delete({ where: { id: volumeId } });
    return { deletedId: volumeId };
  }

  async reorderVolumes(user: RequestUser, novelId: string, dto: ReorderVolumesDto) {
    const novel = await this.prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        id: true,
        authorId: true,
        volumes: { orderBy: { orderIndex: 'asc' }, select: { id: true } },
      },
    });
    if (!novel) {
      throw new NotFoundException('作品不存在');
    }
    if (novel.authorId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('只能管理自己作品的分卷');
    }

    const currentIds = new Set(novel.volumes.map((volume) => volume.id));
    if (
      dto.volumeIds.length !== novel.volumes.length ||
      dto.volumeIds.some((volumeId) => !currentIds.has(volumeId))
    ) {
      throw new BadRequestException('分卷排序列表必须包含当前作品的全部分卷');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.reindexVolumeIds(tx, dto.volumeIds);
      return tx.novelVolume.findMany({
        where: { novelId },
        orderBy: { orderIndex: 'asc' },
        include: {
          _count: { select: { chapters: { where: { deletedAt: null } } } },
        },
      });
    });
  }

  async assignChapterVolume(user: RequestUser, chapterId: string, dto: AssignChapterVolumeDto) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId, deletedAt: null },
      select: {
        id: true,
        novelId: true,
        novel: { select: { authorId: true } },
      },
    });
    if (!chapter) {
      throw new NotFoundException('章节不存在');
    }
    if (chapter.novel.authorId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('只能管理自己作品的章节');
    }

    const volumeId = await this.validateChapterVolume(chapter.novelId, dto.volumeId ?? null);
    return this.prisma.chapter.update({
      where: { id: chapterId },
      data: { volumeId },
    });
  }

  async updateChapterSchedule(user: RequestUser, chapterId: string, dto: UpdateChapterScheduleDto) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId, deletedAt: null },
      select: {
        id: true,
        status: true,
        novel: { select: { authorId: true } },
      },
    });
    if (!chapter) {
      throw new NotFoundException('章节不存在');
    }
    if (chapter.novel.authorId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('只能管理自己作品的章节');
    }
    if (chapter.status === ChapterStatus.PUBLISHED) {
      throw new BadRequestException('已发布章节不能调整发布时间');
    }

    const schedulableStatuses: ChapterStatus[] = [
      ChapterStatus.DRAFT,
      ChapterStatus.REJECTED,
      ChapterStatus.REVIEWING,
      ChapterStatus.SCHEDULED,
    ];
    if (!schedulableStatuses.includes(chapter.status)) {
      throw new BadRequestException('当前章节状态不能调整发布时间');
    }

    const scheduledAt = this.parseScheduledAt(dto.scheduledAt);
    if (chapter.status === ChapterStatus.SCHEDULED && !scheduledAt) {
      const published = await this.publicationService.publishScheduledChapter(
        chapterId,
        new Date(),
        true,
      );
      if (!published) {
        throw new BadRequestException('章节状态已变化，请刷新后重试');
      }
      return published;
    }

    return this.prisma.chapter.update({
      where: { id: chapterId },
      data: { scheduledAt },
    });
  }

  async createChapter(user: RequestUser, novelId: string, dto: CreateChapterDto) {
    this.validateChapterForAction(dto);
    if (dto.action !== 'save') {
      await this.sensitiveWordsService.assertAllowed(SensitiveWordScope.CHAPTER, [
        { label: '章节标题', text: dto.title },
        { label: '章节正文', text: dto.content },
      ]);
    }
    const novel = await this.prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        id: true,
        authorId: true,
        volumes: { orderBy: { orderIndex: 'asc' }, select: { id: true } },
      },
    });

    if (!novel) {
      throw new NotFoundException('小说不存在');
    }

    if (novel.authorId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('只能为自己的作品添加章节');
    }

    const orderIndex = await this.getNextChapterOrderIndex(novelId);
    const wordCount = this.countWords(dto.content);
    const requestedVolumeId =
      dto.volumeId === undefined ? (novel.volumes[0]?.id ?? null) : dto.volumeId;
    const volumeId = await this.validateChapterVolume(novelId, requestedVolumeId);

    return this.prisma.chapter.create({
      data: {
        novelId,
        volumeId,
        scheduledAt: this.parseScheduledAt(dto.scheduledAt),
        title: dto.title.trim(),
        content: dto.content.trim(),
        orderIndex,
        wordCount,
        status: dto.action === 'save' ? ChapterStatus.DRAFT : ChapterStatus.REVIEWING,
      },
    });
  }

  async updateChapter(user: RequestUser, chapterId: string, dto: UpdateChapterDto) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId, deletedAt: null },
      select: {
        id: true,
        novelId: true,
        volumeId: true,
        title: true,
        content: true,
        wordCount: true,
        scheduledAt: true,
        status: true,
        novel: {
          select: {
            authorId: true,
          },
        },
      },
    });

    if (!chapter) {
      throw new NotFoundException('章节不存在');
    }

    if (chapter.novel.authorId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('只能编辑自己的章节');
    }

    const editableStatuses: ChapterStatus[] = [ChapterStatus.DRAFT, ChapterStatus.REJECTED];
    if (user.role !== UserRole.ADMIN && !editableStatuses.includes(chapter.status)) {
      throw new BadRequestException('只有草稿或已驳回章节可以编辑');
    }

    this.validateChapterForAction(dto);
    if (dto.action !== 'save') {
      await this.sensitiveWordsService.assertAllowed(SensitiveWordScope.CHAPTER, [
        { label: '章节标题', text: dto.title },
        { label: '章节正文', text: dto.content },
      ]);
    }
    const volumeId =
      dto.volumeId === undefined
        ? chapter.volumeId
        : await this.validateChapterVolume(chapter.novelId, dto.volumeId);
    const nextChapter = {
      title: dto.title.trim(),
      content: dto.content.trim(),
      wordCount: this.countWords(dto.content),
      volumeId,
      scheduledAt:
        dto.scheduledAt === undefined
          ? chapter.scheduledAt
          : this.parseScheduledAt(dto.scheduledAt),
    };
    const source =
      dto.action === 'submit'
        ? ChapterVersionSource.SUBMIT
        : dto.saveSource === 'autosave'
          ? ChapterVersionSource.AUTOSAVE
          : ChapterVersionSource.MANUAL;

    return this.prisma.$transaction(async (tx) => {
      if (this.hasChapterSnapshotChanged(chapter, nextChapter)) {
        await this.createChapterVersionIfNeeded(tx, chapter, source);
      }

      return tx.chapter.update({
        where: { id: chapterId },
        data: {
          ...nextChapter,
          status: dto.action === 'save' ? ChapterStatus.DRAFT : ChapterStatus.REVIEWING,
          publishedAt: null,
        },
        include: {
          novel: {
            select: {
              id: true,
              title: true,
              author: { select: { id: true, nickname: true } },
            },
          },
        },
      });
    });
  }

  async listChapterVersions(user: RequestUser, chapterId: string) {
    await this.ensureChapterOwnership(user, chapterId);
    return this.prisma.chapterVersion.findMany({
      where: { chapterId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 100,
    });
  }

  async restoreChapterVersion(user: RequestUser, chapterId: string, versionId: string) {
    const chapter = await this.prisma.chapter.findFirst({
      where: { id: chapterId, deletedAt: null },
      select: {
        id: true,
        novelId: true,
        volumeId: true,
        title: true,
        content: true,
        wordCount: true,
        scheduledAt: true,
        status: true,
        novel: { select: { authorId: true } },
      },
    });
    if (!chapter) {
      throw new NotFoundException('章节不存在');
    }
    if (chapter.novel.authorId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('只能恢复自己作品的章节版本');
    }
    this.ensureChaptersManageable([chapter], '恢复版本');

    const version = await this.prisma.chapterVersion.findFirst({
      where: { id: versionId, chapterId },
    });
    if (!version) {
      throw new NotFoundException('章节版本不存在');
    }
    const volumeId = await this.resolveSnapshotVolumeId(chapter.novelId, version.volumeId);

    return this.prisma.$transaction(async (tx) => {
      await this.createChapterVersionIfNeeded(tx, chapter, ChapterVersionSource.RESTORE);
      return tx.chapter.update({
        where: { id: chapterId },
        data: {
          title: version.title,
          content: version.content,
          wordCount: version.wordCount,
          volumeId,
          scheduledAt: version.scheduledAt,
          status: ChapterStatus.DRAFT,
          publishedAt: null,
        },
      });
    });
  }

  async listDeletedChapters(user: RequestUser, novelId: string) {
    await this.ensureNovelOwnership(user, novelId);
    return this.prisma.chapter.findMany({
      where: { novelId, deletedAt: { not: null } },
      orderBy: [{ deletedAt: 'desc' }, { orderIndex: 'asc' }],
      include: {
        volume: { select: { id: true, title: true, orderIndex: true } },
        _count: { select: { versions: true } },
      },
    });
  }

  async restoreDeletedChapter(user: RequestUser, chapterId: string) {
    const chapter = await this.prisma.chapter.findFirst({
      where: { id: chapterId, deletedAt: { not: null } },
      select: {
        id: true,
        novelId: true,
        status: true,
        novel: { select: { authorId: true } },
      },
    });
    if (!chapter) {
      throw new NotFoundException('回收站中没有该章节');
    }
    if (chapter.novel.authorId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('只能恢复自己作品的章节');
    }

    const orderIndex = await this.getNextChapterOrderIndex(chapter.novelId);
    return this.prisma.chapter.update({
      where: { id: chapterId },
      data: { deletedAt: null, orderIndex },
      include: {
        volume: { select: { id: true, title: true, orderIndex: true } },
      },
    });
  }

  async permanentlyDeleteChapter(user: RequestUser, chapterId: string) {
    const chapter = await this.prisma.chapter.findFirst({
      where: { id: chapterId, deletedAt: { not: null } },
      select: { id: true, novel: { select: { authorId: true } } },
    });
    if (!chapter) {
      throw new NotFoundException('回收站中没有该章节');
    }
    if (chapter.novel.authorId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('只能永久删除自己作品的章节');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.reviewLog.deleteMany({
        where: { targetType: 'chapter', targetId: chapterId },
      });
      await tx.chapter.delete({ where: { id: chapterId } });
    });
    return { deletedId: chapterId };
  }

  async deleteChapter(user: RequestUser, chapterId: string) {
    const chapter = await this.prisma.chapter.findFirst({
      where: { id: chapterId, deletedAt: null },
      select: { id: true, novelId: true },
    });

    if (!chapter) {
      throw new NotFoundException('章节不存在');
    }

    const result = await this.deleteChapters(user, chapter.novelId, { chapterIds: [chapterId] });
    return {
      deletedId: chapterId,
      deletedCount: result.deletedCount,
      chapters: result.chapters,
    };
  }

  async deleteChapters(user: RequestUser, novelId: string, dto: BatchDeleteChaptersDto) {
    const novel = await this.prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true, authorId: true },
    });

    if (!novel) {
      throw new NotFoundException('作品不存在');
    }

    if (novel.authorId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('只能管理自己作品的章节');
    }

    const chapters = await this.prisma.chapter.findMany({
      where: { id: { in: dto.chapterIds }, deletedAt: null },
      select: { id: true, novelId: true, status: true },
    });

    if (
      chapters.length !== dto.chapterIds.length ||
      chapters.some((chapter) => chapter.novelId !== novelId)
    ) {
      throw new BadRequestException('选中的章节不存在或不属于当前作品');
    }

    this.ensureChaptersManageable(chapters, '删除');

    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.chapter.updateMany({
        where: { id: { in: dto.chapterIds }, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      const remaining = await tx.chapter.findMany({
        where: { novelId, deletedAt: null },
        orderBy: { orderIndex: 'asc' },
        select: { id: true },
      });

      await this.reindexChapterIds(
        tx,
        remaining.map((chapter) => chapter.id),
      );

      return {
        deletedIds: dto.chapterIds,
        deletedCount: deleted.count,
        chapters: await tx.chapter.findMany({
          where: { novelId, deletedAt: null },
          orderBy: { orderIndex: 'asc' },
          include: {
            volume: { select: { id: true, title: true, orderIndex: true } },
          },
        }),
      };
    });
  }

  async reorderChapters(user: RequestUser, novelId: string, dto: ReorderChaptersDto) {
    const novel = await this.prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        id: true,
        authorId: true,
        chapters: {
          where: { deletedAt: null },
          orderBy: { orderIndex: 'asc' },
          select: { id: true, status: true },
        },
      },
    });

    if (!novel) {
      throw new NotFoundException('作品不存在');
    }

    if (novel.authorId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('只能管理自己作品的章节');
    }

    const currentIds = new Set(novel.chapters.map((chapter) => chapter.id));
    if (
      dto.chapterIds.length !== novel.chapters.length ||
      dto.chapterIds.some((chapterId) => !currentIds.has(chapterId))
    ) {
      throw new BadRequestException('章节排序列表必须包含当前作品的全部章节');
    }

    this.ensureChaptersManageable(novel.chapters, '调整顺序');

    return this.prisma.$transaction(async (tx) => {
      await this.reindexChapterIds(tx, dto.chapterIds);
      return tx.chapter.findMany({
        where: { novelId, deletedAt: null },
        orderBy: { orderIndex: 'asc' },
        include: {
          volume: { select: { id: true, title: true, orderIndex: true } },
        },
      });
    });
  }

  async updateNovel(user: RequestUser, novelId: string, dto: UpdateNovelDto) {
    await this.ensureCategoryExists(dto.categoryId);

    const novel = await this.prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true, authorId: true, status: true },
    });

    if (!novel) {
      throw new NotFoundException('作品不存在');
    }

    if (novel.authorId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('只能编辑自己的作品');
    }

    const editableStatuses: NovelStatus[] = [NovelStatus.DRAFT, NovelStatus.REJECTED];
    if (user.role !== UserRole.ADMIN && !editableStatuses.includes(novel.status)) {
      throw new BadRequestException('只有草稿或已驳回作品可以编辑');
    }

    this.validateNovelForAction(dto);

    const tagNames = this.normalizeTagNames(dto.tagNames);
    if (dto.action !== 'save') {
      await this.sensitiveWordsService.assertAllowed(SensitiveWordScope.NOVEL, [
        { label: '书名', text: dto.title },
        { label: '简介', text: dto.summary },
        { label: '标签', text: tagNames.join(' ') },
      ]);
    }

    return this.prisma.novel.update({
      where: { id: novelId },
      data: {
        title: dto.title.trim(),
        summary: dto.summary.trim(),
        coverUrl: dto.coverUrl?.trim() || null,
        categoryId: dto.categoryId,
        status: dto.action === 'save' ? NovelStatus.DRAFT : NovelStatus.REVIEWING,
        tags: {
          set: [],
          connectOrCreate: tagNames.map((name) => ({
            where: { name },
            create: { name },
          })),
        },
      },
      include: {
        author: { select: { id: true, nickname: true } },
        category: true,
        tags: true,
        _count: { select: { chapters: { where: { deletedAt: null } } } },
      },
    });
  }

  async deleteNovel(user: RequestUser, novelId: string) {
    const novel = await this.prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        id: true,
        authorId: true,
        status: true,
        chapters: { select: { id: true } },
      },
    });

    if (!novel) {
      throw new NotFoundException('作品不存在');
    }

    if (novel.authorId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('只能删除自己的作品');
    }

    const deletableStatuses: NovelStatus[] = [NovelStatus.DRAFT, NovelStatus.REJECTED];
    if (!deletableStatuses.includes(novel.status)) {
      throw new BadRequestException('只有草稿或已驳回作品可以删除');
    }

    const chapterIds = novel.chapters.map((chapter) => chapter.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.readingHistory.deleteMany({ where: { novelId } });
      await tx.bookshelfItem.deleteMany({ where: { novelId } });
      await tx.comment.deleteMany({ where: { novelId } });
      await tx.recommendItem.deleteMany({ where: { novelId } });
      await tx.reviewLog.deleteMany({
        where: {
          OR: [
            { targetType: 'novel', targetId: novelId },
            { targetType: 'chapter', targetId: { in: chapterIds } },
          ],
        },
      });
      await tx.chapter.deleteMany({ where: { novelId } });
      await tx.novel.delete({ where: { id: novelId } });
    });

    return { deletedId: novelId };
  }

  async updateNovelLifecycle(user: RequestUser, novelId: string, dto: UpdateNovelLifecycleDto) {
    const novel = await this.prisma.novel.findUnique({
      where: { id: novelId },
      select: {
        id: true,
        authorId: true,
        status: true,
        chapters: { where: { deletedAt: null }, select: { status: true } },
      },
    });

    if (!novel) {
      throw new NotFoundException('作品不存在');
    }

    if (novel.authorId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('只能管理自己的作品');
    }

    let nextStatus: NovelStatus;
    if (dto.action === 'complete') {
      if (novel.status !== NovelStatus.SERIALIZING) {
        throw new BadRequestException('只有连载中的作品可以设为完结');
      }
      if (
        novel.chapters.length === 0 ||
        novel.chapters.some((chapter) => chapter.status !== ChapterStatus.PUBLISHED)
      ) {
        throw new BadRequestException('作品全部章节发布后才能设为完结');
      }
      nextStatus = NovelStatus.COMPLETED;
    } else {
      if (novel.status !== NovelStatus.COMPLETED) {
        throw new BadRequestException('只有已完结作品可以恢复连载');
      }
      nextStatus = NovelStatus.SERIALIZING;
    }

    return this.prisma.novel.update({
      where: { id: novelId },
      data: { status: nextStatus },
      include: {
        author: { select: { id: true, nickname: true } },
        category: true,
        tags: true,
        chapters: { where: { deletedAt: null }, orderBy: { orderIndex: 'asc' } },
        _count: { select: { chapters: { where: { deletedAt: null } } } },
      },
    });
  }

  async getDashboard(user: RequestUser, query: AuthorDashboardQueryDto) {
    const days = query.days ?? 14;
    const today = new Date();
    const startDate = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - days + 1),
    );
    const novelWhere: Prisma.NovelWhereInput =
      user.role === UserRole.ADMIN ? {} : { authorId: user.id };

    const [novels, recentBookshelf, recentComments, recentPublishedChapters] =
      await this.prisma.$transaction([
        this.prisma.novel.findMany({
          where: novelWhere,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            title: true,
            status: true,
            updatedAt: true,
            chapters: {
              where: { deletedAt: null },
              select: { status: true, wordCount: true },
            },
            _count: {
              select: {
                chapters: { where: { deletedAt: null } },
                bookshelf: true,
                comments: true,
              },
            },
          },
        }),
        this.prisma.bookshelfItem.findMany({
          where: { novel: novelWhere, createdAt: { gte: startDate } },
          select: { createdAt: true },
        }),
        this.prisma.comment.findMany({
          where: { novel: novelWhere, createdAt: { gte: startDate } },
          select: { createdAt: true },
        }),
        this.prisma.chapter.findMany({
          where: {
            novel: novelWhere,
            status: ChapterStatus.PUBLISHED,
            deletedAt: null,
            publishedAt: { gte: startDate },
          },
          select: { publishedAt: true, wordCount: true },
        }),
      ]);

    const trend = Array.from({ length: days }, (_, index) => {
      const date = new Date(startDate);
      date.setUTCDate(startDate.getUTCDate() + index);
      return {
        date: this.dateKey(date),
        bookshelfAdds: 0,
        comments: 0,
        publishedChapters: 0,
        publishedWords: 0,
      };
    });
    const trendByDate = new Map(trend.map((item) => [item.date, item]));

    recentBookshelf.forEach((item) => {
      const point = trendByDate.get(this.dateKey(item.createdAt));
      if (point) {
        point.bookshelfAdds += 1;
      }
    });
    recentComments.forEach((item) => {
      const point = trendByDate.get(this.dateKey(item.createdAt));
      if (point) {
        point.comments += 1;
      }
    });
    recentPublishedChapters.forEach((chapter) => {
      if (!chapter.publishedAt) {
        return;
      }
      const point = trendByDate.get(this.dateKey(chapter.publishedAt));
      if (point) {
        point.publishedChapters += 1;
        point.publishedWords += chapter.wordCount;
      }
    });

    const statusCounts = new Map<NovelStatus, number>();
    const novelStats = novels.map((novel) => {
      statusCounts.set(novel.status, (statusCounts.get(novel.status) ?? 0) + 1);
      const publishedChapters = novel.chapters.filter(
        (chapter) => chapter.status === ChapterStatus.PUBLISHED,
      );
      return {
        id: novel.id,
        title: novel.title,
        status: novel.status,
        chapters: novel._count.chapters,
        publishedChapters: publishedChapters.length,
        publishedWords: publishedChapters.reduce((total, chapter) => total + chapter.wordCount, 0),
        bookshelf: novel._count.bookshelf,
        comments: novel._count.comments,
        updatedAt: novel.updatedAt,
      };
    });

    return {
      periodDays: days,
      overview: {
        novels: novels.length,
        chapters: novelStats.reduce((total, novel) => total + novel.chapters, 0),
        publishedChapters: novelStats.reduce((total, novel) => total + novel.publishedChapters, 0),
        publishedWords: novelStats.reduce((total, novel) => total + novel.publishedWords, 0),
        bookshelf: novelStats.reduce((total, novel) => total + novel.bookshelf, 0),
        comments: novelStats.reduce((total, novel) => total + novel.comments, 0),
      },
      statusBreakdown: Object.values(NovelStatus).map((status) => ({
        status,
        count: statusCounts.get(status) ?? 0,
      })),
      trend,
      novels: novelStats,
    };
  }

  async findMyNovels(user: RequestUser) {
    const novels = await this.prisma.novel.findMany({
      where: user.role === UserRole.ADMIN ? undefined : { authorId: user.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        category: true,
        tags: true,
        chapters: {
          where: { deletedAt: null },
          orderBy: { orderIndex: 'asc' },
          include: {
            volume: {
              select: { id: true, title: true, orderIndex: true },
            },
          },
        },
        volumes: {
          orderBy: { orderIndex: 'asc' },
          include: {
            _count: { select: { chapters: { where: { deletedAt: null } } } },
          },
        },
        announcements: {
          orderBy: [{ isPinned: 'desc' }, { publishedAt: 'desc' }, { updatedAt: 'desc' }],
        },
        _count: { select: { chapters: { where: { deletedAt: null } } } },
      },
    });

    const novelIds = novels.map((novel) => novel.id);
    const chapterIds = novels.flatMap((novel) => novel.chapters.map((chapter) => chapter.id));
    const targetIds = [...novelIds, ...chapterIds];

    if (targetIds.length === 0) {
      return novels;
    }

    const logs = await this.prisma.reviewLog.findMany({
      where: {
        action: 'reject',
        targetId: { in: targetIds },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        reviewer: { select: { id: true, nickname: true } },
      },
    });

    const latestLogByTarget = new Map<string, (typeof logs)[number]>();
    logs.forEach((log) => {
      const key = `${log.targetType}:${log.targetId}`;
      if (!latestLogByTarget.has(key)) {
        latestLogByTarget.set(key, log);
      }
    });

    return novels.map((novel) => ({
      ...novel,
      latestRejection: latestLogByTarget.get(`novel:${novel.id}`) ?? null,
      chapters: novel.chapters.map((chapter) => ({
        ...chapter,
        latestRejection: latestLogByTarget.get(`chapter:${chapter.id}`) ?? null,
      })),
    }));
  }

  private async ensureCategoryExists(categoryId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });

    if (!category) {
      throw new NotFoundException('分类不存在');
    }
  }

  private async ensureNovelOwnership(user: RequestUser, novelId: string) {
    const novel = await this.prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true, authorId: true },
    });
    if (!novel) {
      throw new NotFoundException('作品不存在');
    }
    if (novel.authorId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('只能管理自己的作品');
    }
    return novel;
  }

  private async ensureChapterOwnership(user: RequestUser, chapterId: string) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true, novel: { select: { authorId: true } } },
    });
    if (!chapter) {
      throw new NotFoundException('章节不存在');
    }
    if (chapter.novel.authorId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('只能管理自己作品的章节');
    }
    return chapter;
  }

  private async validateChapterVolume(novelId: string, volumeId?: string | null) {
    if (!volumeId) {
      return null;
    }

    const volume = await this.prisma.novelVolume.findFirst({
      where: { id: volumeId, novelId },
      select: { id: true },
    });
    if (!volume) {
      throw new BadRequestException('分卷不存在或不属于当前作品');
    }
    return volume.id;
  }

  private async resolveSnapshotVolumeId(novelId: string, volumeId?: string | null) {
    if (!volumeId) {
      return null;
    }
    const volume = await this.prisma.novelVolume.findFirst({
      where: { id: volumeId, novelId },
      select: { id: true },
    });
    return volume?.id ?? null;
  }

  private async getNextChapterOrderIndex(novelId: string) {
    const latest = await this.prisma.chapter.findFirst({
      where: { novelId, deletedAt: null },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });

    return (latest?.orderIndex ?? 0) + 1;
  }

  private hasChapterSnapshotChanged(
    current: {
      title: string;
      content: string;
      volumeId: string | null;
      scheduledAt: Date | null;
    },
    next: {
      title: string;
      content: string;
      volumeId: string | null;
      scheduledAt: Date | null;
    },
  ) {
    return (
      current.title !== next.title ||
      current.content !== next.content ||
      current.volumeId !== next.volumeId ||
      current.scheduledAt?.getTime() !== next.scheduledAt?.getTime()
    );
  }

  private async createChapterVersionIfNeeded(
    tx: Prisma.TransactionClient,
    chapter: {
      id: string;
      title: string;
      content: string;
      volumeId: string | null;
      scheduledAt: Date | null;
      wordCount: number;
    },
    source: ChapterVersionSource,
  ) {
    const latestVersion = await tx.chapterVersion.findFirst({
      where: { chapterId: chapter.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        title: true,
        content: true,
        volumeId: true,
        scheduledAt: true,
        wordCount: true,
      },
    });
    if (
      latestVersion &&
      latestVersion.title === chapter.title &&
      latestVersion.content === chapter.content &&
      latestVersion.volumeId === chapter.volumeId &&
      latestVersion.scheduledAt?.getTime() === chapter.scheduledAt?.getTime() &&
      latestVersion.wordCount === chapter.wordCount
    ) {
      return null;
    }

    if (source === ChapterVersionSource.AUTOSAVE) {
      const recentAutosave = await tx.chapterVersion.findFirst({
        where: {
          chapterId: chapter.id,
          source: ChapterVersionSource.AUTOSAVE,
          createdAt: { gte: new Date(Date.now() - AUTOSAVE_SNAPSHOT_INTERVAL_MS) },
        },
        select: { id: true },
      });
      if (recentAutosave) {
        return null;
      }
    }

    return tx.chapterVersion.create({
      data: {
        chapterId: chapter.id,
        title: chapter.title,
        content: chapter.content,
        volumeId: chapter.volumeId,
        scheduledAt: chapter.scheduledAt,
        wordCount: chapter.wordCount,
        source,
      },
    });
  }

  private async reindexVolumeIds(tx: Prisma.TransactionClient, volumeIds: string[]) {
    for (let index = 0; index < volumeIds.length; index += 1) {
      await tx.novelVolume.update({
        where: { id: volumeIds[index] },
        data: { orderIndex: -(index + 1) },
      });
    }
    for (let index = 0; index < volumeIds.length; index += 1) {
      await tx.novelVolume.update({
        where: { id: volumeIds[index] },
        data: { orderIndex: index + 1 },
      });
    }
  }

  private normalizeTagNames(tagNames?: string[]) {
    return Array.from(
      new Set((tagNames ?? []).map((name) => name.trim()).filter((name) => name.length > 0)),
    ).slice(0, 8);
  }

  private countWords(content: string) {
    return content.replace(/\s/g, '').length;
  }

  private dateKey(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private ensureChaptersManageable(chapters: Array<{ status: ChapterStatus }>, action: string) {
    const manageableStatuses: ChapterStatus[] = [ChapterStatus.DRAFT, ChapterStatus.REJECTED];
    if (chapters.some((chapter) => !manageableStatuses.includes(chapter.status))) {
      throw new BadRequestException(`只有草稿或已驳回章节可以${action}`);
    }
  }

  private async reindexChapterIds(tx: Prisma.TransactionClient, chapterIds: string[]) {
    for (const [index, chapterId] of chapterIds.entries()) {
      await tx.chapter.update({
        where: { id: chapterId },
        data: { orderIndex: -(index + 1) },
      });
    }

    for (const [index, chapterId] of chapterIds.entries()) {
      await tx.chapter.update({
        where: { id: chapterId },
        data: { orderIndex: index + 1 },
      });
    }
  }

  private validateNovelForAction(dto: CreateNovelDto | UpdateNovelDto) {
    if (dto.action !== 'save' && dto.summary.trim().length < 10) {
      throw new BadRequestException('提交审核时，作品简介至少需要 10 个字');
    }
  }

  private validateChapterForAction(dto: CreateChapterDto | UpdateChapterDto) {
    if (dto.scheduledAt) {
      this.parseScheduledAt(dto.scheduledAt);
    }
    if (dto.action !== 'save' && dto.content.trim().length < 20) {
      throw new BadRequestException('提交审核时，章节正文至少需要 20 个字');
    }
  }

  private parseScheduledAt(value?: string | null) {
    if (!value) {
      return null;
    }
    const scheduledAt = new Date(value);
    if (scheduledAt.getTime() <= Date.now()) {
      throw new BadRequestException('定时发布时间必须晚于当前时间');
    }
    return scheduledAt;
  }
}
