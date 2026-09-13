import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { NovelMemoryType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from '../auth/auth.types';
import { CreateNovelMemoryDto } from './dto/create-novel-memory.dto';
import { UpdateNovelMemoryDto } from './dto/update-novel-memory.dto';

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
