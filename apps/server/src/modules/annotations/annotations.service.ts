import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChapterStatus, NovelStatus } from '@prisma/client';
import { RequestUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAnnotationDto } from './dto/create-annotation.dto';
import { UpdateAnnotationDto } from './dto/update-annotation.dto';

const publicNovelStatuses = [NovelStatus.SERIALIZING, NovelStatus.COMPLETED];

@Injectable()
export class AnnotationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForChapter(user: RequestUser, chapterId: string) {
    await this.ensurePublicChapter(chapterId);

    return this.prisma.readingAnnotation.findMany({
      where: { userId: user.id, chapterId },
      orderBy: [{ paragraphIndex: 'asc' }, { startOffset: 'asc' }],
    });
  }

  async listMine(user: RequestUser) {
    return this.prisma.readingAnnotation.findMany({
      where: {
        userId: user.id,
        chapter: {
          status: ChapterStatus.PUBLISHED,
          novel: { status: { in: publicNovelStatuses } },
        },
      },
      orderBy: { updatedAt: 'desc' },
      include: {
        chapter: {
          select: {
            id: true,
            title: true,
            orderIndex: true,
            novel: { select: { id: true, title: true } },
          },
        },
      },
    });
  }

  async create(user: RequestUser, chapterId: string, dto: CreateAnnotationDto) {
    const chapter = await this.ensurePublicChapter(chapterId);
    const paragraphs = chapter.content.split(/\n+/);
    const paragraph = paragraphs[dto.paragraphIndex];

    if (
      paragraph === undefined ||
      dto.startOffset >= dto.endOffset ||
      dto.endOffset > paragraph.length ||
      paragraph.slice(dto.startOffset, dto.endOffset) !== dto.selectedText
    ) {
      throw new BadRequestException('划线范围与章节原文不匹配');
    }

    const overlapping = await this.prisma.readingAnnotation.findFirst({
      where: {
        userId: user.id,
        chapterId,
        paragraphIndex: dto.paragraphIndex,
        startOffset: { lt: dto.endOffset },
        endOffset: { gt: dto.startOffset },
      },
      select: { id: true },
    });

    if (overlapping) {
      throw new BadRequestException('所选文字已存在划线或批注');
    }

    return this.prisma.readingAnnotation.create({
      data: {
        userId: user.id,
        chapterId,
        paragraphIndex: dto.paragraphIndex,
        startOffset: dto.startOffset,
        endOffset: dto.endOffset,
        selectedText: dto.selectedText,
        note: normalizeNote(dto.note),
        color: dto.color,
      },
    });
  }

  async update(user: RequestUser, annotationId: string, dto: UpdateAnnotationDto) {
    const annotation = await this.prisma.readingAnnotation.findFirst({
      where: { id: annotationId, userId: user.id },
      select: { id: true },
    });

    if (!annotation) {
      throw new NotFoundException('批注不存在');
    }

    return this.prisma.readingAnnotation.update({
      where: { id: annotationId },
      data: {
        ...(dto.note !== undefined ? { note: normalizeNote(dto.note) } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
      },
    });
  }

  async remove(user: RequestUser, annotationId: string) {
    const deleted = await this.prisma.readingAnnotation.deleteMany({
      where: { id: annotationId, userId: user.id },
    });

    if (deleted.count === 0) {
      throw new NotFoundException('批注不存在');
    }

    return { deleted: true };
  }

  private async ensurePublicChapter(chapterId: string) {
    const chapter = await this.prisma.chapter.findFirst({
      where: {
        id: chapterId,
        status: ChapterStatus.PUBLISHED,
        novel: { status: { in: publicNovelStatuses } },
      },
      select: { id: true, content: true },
    });

    if (!chapter) {
      throw new NotFoundException('章节不存在或尚未发布');
    }

    return chapter;
  }
}

function normalizeNote(value?: string) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
