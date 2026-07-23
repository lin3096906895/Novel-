import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { RequestUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCategoryDto,
  CreateChannelDto,
  CreateTagDto,
  UpdateCategoryDto,
  UpdateChannelDto,
  UpdateTagDto,
} from './dto/taxonomy.dto';

@Injectable()
export class TaxonomyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AdminAuditService,
  ) {}

  async overview() {
    const [channels, categories, tags] = await this.prisma.$transaction([
      this.prisma.contentChannel.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.category.findMany({
        orderBy: [{ channel: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        include: { _count: { select: { novels: true } } },
      }),
      this.prisma.tag.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: { _count: { select: { novels: true } } },
      }),
    ]);
    const counts = new Map<string, number>();
    for (const category of categories) {
      counts.set(category.channel, (counts.get(category.channel) ?? 0) + 1);
    }
    return {
      channels: channels.map((item) => ({
        ...item,
        categoryCount: counts.get(item.code) ?? 0,
      })),
      categories,
      tags,
    };
  }

  async createChannel(user: RequestUser, dto: CreateChannelDto) {
    const code = dto.code.trim().toLowerCase();
    const name = dto.name.trim();
    if (await this.prisma.contentChannel.findFirst({ where: { OR: [{ code }, { name }] } })) {
      throw new ConflictException('频道代码或名称已存在');
    }
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.contentChannel.create({
        data: { code, name, sortOrder: dto.sortOrder ?? 0 },
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'taxonomy.channel.create',
          targetType: 'content_channel',
          targetId: created.id,
          summary: `创建频道《${created.name}》`,
          after: toAuditJson(created),
        },
        tx,
      );
      return created;
    });
  }

  async updateChannel(user: RequestUser, id: string, dto: UpdateChannelDto) {
    const current = await this.prisma.contentChannel.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('频道不存在');
    const name = dto.name?.trim();
    if (name && name !== current.name) {
      const duplicate = await this.prisma.contentChannel.findUnique({ where: { name } });
      if (duplicate) throw new ConflictException('频道名称已存在');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.contentChannel.update({
        where: { id },
        data: {
          ...(name ? { name } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'taxonomy.channel.update',
          targetType: 'content_channel',
          targetId: id,
          summary: `更新频道《${updated.name}》`,
          before: toAuditJson(current),
          after: toAuditJson(updated),
        },
        tx,
      );
      return updated;
    });
  }

  async deleteChannel(user: RequestUser, id: string) {
    const current = await this.prisma.contentChannel.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('频道不存在');
    const categoryCount = await this.prisma.category.count({ where: { channel: current.code } });
    if (categoryCount > 0) throw new BadRequestException('频道下仍有分类，不能删除');
    await this.prisma.$transaction(async (tx) => {
      await tx.contentChannel.delete({ where: { id } });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'taxonomy.channel.delete',
          targetType: 'content_channel',
          targetId: id,
          summary: `删除频道《${current.name}》`,
          before: toAuditJson(current),
        },
        tx,
      );
    });
    return { deletedId: id };
  }

  async createCategory(user: RequestUser, dto: CreateCategoryDto) {
    const name = dto.name.trim();
    await this.ensureChannel(dto.channel);
    if (await this.prisma.category.findUnique({ where: { name } })) {
      throw new ConflictException('分类名称已存在');
    }
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.category.create({
        data: { name, channel: dto.channel, sortOrder: dto.sortOrder ?? 0 },
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'taxonomy.category.create',
          targetType: 'category',
          targetId: created.id,
          summary: `创建分类《${created.name}》`,
          after: toAuditJson(created),
        },
        tx,
      );
      return created;
    });
  }

  async updateCategory(user: RequestUser, id: string, dto: UpdateCategoryDto) {
    const current = await this.prisma.category.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('分类不存在');
    if (dto.channel) await this.ensureChannel(dto.channel);
    const name = dto.name?.trim();
    if (
      name &&
      name !== current.name &&
      (await this.prisma.category.findUnique({ where: { name } }))
    ) {
      throw new ConflictException('分类名称已存在');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.category.update({
        where: { id },
        data: {
          ...(name ? { name } : {}),
          ...(dto.channel ? { channel: dto.channel } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'taxonomy.category.update',
          targetType: 'category',
          targetId: id,
          summary: `更新分类《${updated.name}》`,
          before: toAuditJson(current),
          after: toAuditJson(updated),
        },
        tx,
      );
      return updated;
    });
  }

  async deleteCategory(user: RequestUser, id: string) {
    const current = await this.prisma.category.findUnique({
      where: { id },
      include: { _count: { select: { novels: true } } },
    });
    if (!current) throw new NotFoundException('分类不存在');
    if (current._count.novels > 0) throw new BadRequestException('分类仍被作品使用，不能删除');
    await this.prisma.$transaction(async (tx) => {
      await tx.category.delete({ where: { id } });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'taxonomy.category.delete',
          targetType: 'category',
          targetId: id,
          summary: `删除分类《${current.name}》`,
          before: toAuditJson(current),
        },
        tx,
      );
    });
    return { deletedId: id };
  }

  async createTag(user: RequestUser, dto: CreateTagDto) {
    const name = dto.name.trim();
    if (await this.prisma.tag.findUnique({ where: { name } })) {
      throw new ConflictException('标签名称已存在');
    }
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.tag.create({ data: { name, sortOrder: dto.sortOrder ?? 0 } });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'taxonomy.tag.create',
          targetType: 'tag',
          targetId: created.id,
          summary: `创建标签《${created.name}》`,
          after: toAuditJson(created),
        },
        tx,
      );
      return created;
    });
  }

  async updateTag(user: RequestUser, id: string, dto: UpdateTagDto) {
    const current = await this.prisma.tag.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('标签不存在');
    const name = dto.name?.trim();
    if (name && name !== current.name && (await this.prisma.tag.findUnique({ where: { name } }))) {
      throw new ConflictException('标签名称已存在');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tag.update({
        where: { id },
        data: {
          ...(name ? { name } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'taxonomy.tag.update',
          targetType: 'tag',
          targetId: id,
          summary: `更新标签《${updated.name}》`,
          before: toAuditJson(current),
          after: toAuditJson(updated),
        },
        tx,
      );
      return updated;
    });
  }

  async deleteTag(user: RequestUser, id: string) {
    const current = await this.prisma.tag.findUnique({
      where: { id },
      include: { _count: { select: { novels: true } } },
    });
    if (!current) throw new NotFoundException('标签不存在');
    if (current._count.novels > 0) throw new BadRequestException('标签仍被作品使用，不能删除');
    await this.prisma.$transaction(async (tx) => {
      await tx.tag.delete({ where: { id } });
      await this.audit.record(
        {
          actorId: user.id,
          action: 'taxonomy.tag.delete',
          targetType: 'tag',
          targetId: id,
          summary: `删除标签《${current.name}》`,
          before: toAuditJson(current),
        },
        tx,
      );
    });
    return { deletedId: id };
  }

  private async ensureChannel(code: string) {
    const channel = await this.prisma.contentChannel.findUnique({ where: { code } });
    if (!channel) throw new BadRequestException('频道不存在');
  }
}

function toAuditJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
