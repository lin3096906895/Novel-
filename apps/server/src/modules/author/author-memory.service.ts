import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NovelMemoryConfidence,
  NovelMemoryDraftStatus,
  NovelMemoryType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../auth/auth.types';
import { CreateNovelMemoryDto } from './dto/create-novel-memory.dto';
import { UpdateNovelMemoryDto } from './dto/update-novel-memory.dto';
import { ReviewNovelMemoryDraftDto } from './dto/review-novel-memory-draft.dto';
import { BatchReviewNovelMemoryDraftsDto } from './dto/batch-review-novel-memory-drafts.dto';

type ExtractedMemoryDraftInput = {
  type: Extract<NovelMemoryType, 'CHARACTER' | 'RELATIONSHIP' | 'FORESHADOWING'>;
  title: string;
  content: string;
  confidence: 'high' | 'medium' | 'low';
  evidence?: string;
};

const memoryDraftInclude = {
  sourceChapter: { select: { id: true, title: true, orderIndex: true } },
  acceptedMemory: { select: { id: true, type: true, title: true, isConfirmed: true } },
} as const;

@Injectable()
export class AuthorMemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: RequestUser, novelId: string) {
    await this.assertNovelAccess(user, novelId);
    return this.prisma.novelMemory.findMany({
      where: { novelId },
      orderBy: [{ type: 'asc' }, { orderIndex: 'asc' }, { updatedAt: 'desc' }],
      include: {
        sourceChapter: { select: { id: true, title: true, orderIndex: true } },
      },
    });
  }

  async create(user: RequestUser, novelId: string, dto: CreateNovelMemoryDto) {
    await this.assertNovelAccess(user, novelId);
    await this.assertSourceChapter(novelId, dto.sourceChapterId);
    const orderIndex = dto.orderIndex ?? (await this.nextOrderIndex(novelId, dto.type));
    return this.prisma.novelMemory.create({
      data: {
        novelId,
        type: dto.type,
        title: dto.title.trim(),
        content: dto.content.trim(),
        sourceChapterId: dto.sourceChapterId || null,
        isConfirmed: dto.isConfirmed ?? false,
        orderIndex,
      },
      include: {
        sourceChapter: { select: { id: true, title: true, orderIndex: true } },
      },
    });
  }

  async update(user: RequestUser, memoryId: string, dto: UpdateNovelMemoryDto) {
    const memory = await this.prisma.novelMemory.findUnique({
      where: { id: memoryId },
      select: { id: true, novelId: true },
    });
    if (!memory) throw new NotFoundException('记忆条目不存在');
    await this.assertNovelAccess(user, memory.novelId);
    await this.assertSourceChapter(memory.novelId, dto.sourceChapterId);
    return this.prisma.novelMemory.update({
      where: { id: memoryId },
      data: {
        ...(dto.type === undefined ? {} : { type: dto.type }),
        ...(dto.title === undefined ? {} : { title: dto.title.trim() }),
        ...(dto.content === undefined ? {} : { content: dto.content.trim() }),
        ...(dto.sourceChapterId === undefined ? {} : { sourceChapterId: dto.sourceChapterId }),
        ...(dto.isConfirmed === undefined ? {} : { isConfirmed: dto.isConfirmed }),
        ...(dto.orderIndex === undefined ? {} : { orderIndex: dto.orderIndex }),
      },
      include: {
        sourceChapter: { select: { id: true, title: true, orderIndex: true } },
      },
    });
  }

  async delete(user: RequestUser, memoryId: string) {
    const memory = await this.prisma.novelMemory.findUnique({
      where: { id: memoryId },
      select: { id: true, novelId: true },
    });
    if (!memory) throw new NotFoundException('记忆条目不存在');
    await this.assertNovelAccess(user, memory.novelId);
    await this.prisma.novelMemory.delete({ where: { id: memoryId } });
    return { deletedId: memoryId };
  }

  async listDrafts(user: RequestUser, novelId: string, status?: NovelMemoryDraftStatus) {
    await this.assertNovelAccess(user, novelId);
    return this.prisma.novelMemoryDraft.findMany({
      where: { novelId, ...(status ? { status } : {}) },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: memoryDraftInclude,
    });
  }

  async saveExtractedDrafts(
    user: RequestUser,
    novelId: string,
    sourceChapterId: string | undefined,
    drafts: ExtractedMemoryDraftInput[],
  ) {
    await this.assertNovelAccess(user, novelId);
    await this.assertSourceChapter(novelId, sourceChapterId);
    if (drafts.length === 0) return [];

    const confidenceMap: Record<ExtractedMemoryDraftInput['confidence'], NovelMemoryConfidence> = {
      high: NovelMemoryConfidence.HIGH,
      medium: NovelMemoryConfidence.MEDIUM,
      low: NovelMemoryConfidence.LOW,
    };
    const created = await this.prisma.$transaction(
      drafts.slice(0, 12).map((draft) =>
        this.prisma.novelMemoryDraft.create({
          data: {
            novelId,
            sourceChapterId: sourceChapterId || null,
            type: draft.type,
            title: draft.title.trim(),
            content: draft.content.trim(),
            confidence: confidenceMap[draft.confidence],
            evidence: draft.evidence?.trim() || null,
          },
          include: memoryDraftInclude,
        }),
      ),
    );
    return created;
  }

  async reviewDraft(user: RequestUser, draftId: string, dto: ReviewNovelMemoryDraftDto) {
    const draft = await this.prisma.novelMemoryDraft.findUnique({
      where: { id: draftId },
      include: memoryDraftInclude,
    });
    if (!draft) throw new NotFoundException('AI 设定草稿不存在');
    await this.assertNovelAccess(user, draft.novelId);

    if (draft.status !== NovelMemoryDraftStatus.PENDING) {
      return draft;
    }
    if (dto.action === 'REJECT') {
      return this.prisma.$transaction(async (tx) => {
        await tx.novelMemoryDraft.updateMany({
          where: { id: draftId, status: NovelMemoryDraftStatus.PENDING },
          data: { status: NovelMemoryDraftStatus.REJECTED, reviewedAt: new Date() },
        });
        return tx.novelMemoryDraft.findUniqueOrThrow({
          where: { id: draftId },
          include: memoryDraftInclude,
        });
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.novelMemoryDraft.updateMany({
        where: { id: draftId, status: NovelMemoryDraftStatus.PENDING },
        data: { status: NovelMemoryDraftStatus.ACCEPTED, reviewedAt: new Date() },
      });
      if (claimed.count === 0) {
        return tx.novelMemoryDraft.findUniqueOrThrow({
          where: { id: draftId },
          include: memoryDraftInclude,
        });
      }
      const current = await tx.novelMemoryDraft.findUniqueOrThrow({ where: { id: draftId } });
      const type = dto.type ?? current.type;
      const latest = await tx.novelMemory.findFirst({
        where: { novelId: current.novelId, type },
        orderBy: { orderIndex: 'desc' },
        select: { orderIndex: true },
      });
      const memory = await tx.novelMemory.create({
        data: {
          novelId: current.novelId,
          type,
          title: dto.title?.trim() || current.title,
          content: dto.content?.trim() || current.content,
          sourceChapterId: current.sourceChapterId,
          isConfirmed: true,
          orderIndex: (latest?.orderIndex ?? -1) + 1,
        },
      });
      return tx.novelMemoryDraft.update({
        where: { id: draftId },
        data: {
          acceptedMemoryId: memory.id,
        },
        include: memoryDraftInclude,
      });
    });
  }

  async batchReviewDrafts(
    user: RequestUser,
    novelId: string,
    dto: BatchReviewNovelMemoryDraftsDto,
  ) {
    await this.assertNovelAccess(user, novelId);
    const available = await this.prisma.novelMemoryDraft.findMany({
      where: {
        novelId,
        id: { in: dto.draftIds },
        status: NovelMemoryDraftStatus.PENDING,
      },
      select: { id: true },
    });
    const availableIds = new Set(available.map((item) => item.id));
    const items = [];
    for (const draftId of dto.draftIds) {
      if (!availableIds.has(draftId)) continue;
      items.push(await this.reviewDraft(user, draftId, { action: dto.action }));
    }
    return {
      requested: dto.draftIds.length,
      processed: items.length,
      skippedIds: dto.draftIds.filter((id) => !availableIds.has(id)),
      items,
    };
  }

  private async nextOrderIndex(novelId: string, type: NovelMemoryType) {
    const latest = await this.prisma.novelMemory.findFirst({
      where: { novelId, type },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });
    return (latest?.orderIndex ?? -1) + 1;
  }

  private async assertSourceChapter(novelId: string, sourceChapterId?: string | null) {
    if (!sourceChapterId) return;
    const chapter = await this.prisma.chapter.findFirst({
      where: { id: sourceChapterId, novelId, deletedAt: null },
      select: { id: true },
    });
    if (!chapter) throw new BadRequestException('引用章节不存在或不属于当前作品');
  }

  private async assertNovelAccess(user: RequestUser, novelId: string) {
    const novel = await this.prisma.novel.findUnique({
      where: { id: novelId },
      select: { id: true, authorId: true },
    });
    if (!novel) throw new NotFoundException('作品不存在');
    if (novel.authorId !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('只能管理自己的作品');
    }
  }
}
