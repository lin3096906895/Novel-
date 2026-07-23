import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SensitiveWordScope } from '@prisma/client';
import { RequestUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSensitiveWordRuleDto } from './dto/create-sensitive-word-rule.dto';
import { ListSensitiveWordRulesDto } from './dto/list-sensitive-word-rules.dto';
import { UpdateSensitiveWordRuleDto } from './dto/update-sensitive-word-rule.dto';

@Injectable()
export class SensitiveWordsService {
  constructor(private readonly prisma: PrismaService) {}

  async assertAllowed(
    scope: Exclude<SensitiveWordScope, 'ALL'>,
    fields: Array<{ label: string; text?: string | null }>,
  ) {
    const rules = await this.prisma.sensitiveWordRule.findMany({
      where: {
        isEnabled: true,
        scope: { in: [SensitiveWordScope.ALL, scope] },
      },
      select: { term: true, normalizedTerm: true },
      orderBy: { normalizedTerm: 'desc' },
    });
    if (rules.length === 0) {
      return;
    }

    const matches: Array<{ label: string; term: string }> = [];
    fields.forEach((field) => {
      const normalizedText = field.text?.toLocaleLowerCase('zh-CN') ?? '';
      rules.forEach((rule) => {
        if (
          normalizedText.includes(rule.normalizedTerm) &&
          !matches.some((match) => match.label === field.label && match.term === rule.term)
        ) {
          matches.push({ label: field.label, term: rule.term });
        }
      });
    });

    if (matches.length > 0) {
      const preview = matches
        .slice(0, 3)
        .map((match) => `${match.label}“${match.term}”`)
        .join('、');
      throw new BadRequestException(`内容包含不适宜词语：${preview}`);
    }
  }

  async list(query: ListSensitiveWordRulesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const keyword = query.keyword?.trim();
    const where: Prisma.SensitiveWordRuleWhereInput = {
      scope: query.scope,
      isEnabled: query.enabled,
      OR: keyword
        ? [
            { term: { contains: keyword, mode: 'insensitive' } },
            { note: { contains: keyword, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.sensitiveWordRule.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [{ updatedAt: 'desc' }, { term: 'asc' }],
        include: { createdBy: { select: { id: true, nickname: true, email: true } } },
      }),
      this.prisma.sensitiveWordRule.count({ where }),
    ]);
    return {
      items,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  async create(user: RequestUser, dto: CreateSensitiveWordRuleDto) {
    const term = dto.term.trim();
    const normalizedTerm = this.normalizeTerm(term);
    await this.ensureUnique(normalizedTerm, dto.scope);
    return this.prisma.sensitiveWordRule.create({
      data: {
        term,
        normalizedTerm,
        scope: dto.scope,
        note: dto.note?.trim() || null,
        isEnabled: dto.isEnabled ?? true,
        createdById: user.id,
      },
      include: { createdBy: { select: { id: true, nickname: true, email: true } } },
    });
  }

  async update(ruleId: string, dto: UpdateSensitiveWordRuleDto) {
    const rule = await this.prisma.sensitiveWordRule.findUnique({ where: { id: ruleId } });
    if (!rule) {
      throw new NotFoundException('敏感词规则不存在');
    }

    const term = dto.term?.trim() ?? rule.term;
    const normalizedTerm = this.normalizeTerm(term);
    const scope = dto.scope ?? rule.scope;
    if (normalizedTerm !== rule.normalizedTerm || scope !== rule.scope) {
      await this.ensureUnique(normalizedTerm, scope, ruleId);
    }

    return this.prisma.sensitiveWordRule.update({
      where: { id: ruleId },
      data: {
        term: dto.term === undefined ? undefined : term,
        normalizedTerm: dto.term === undefined ? undefined : normalizedTerm,
        scope: dto.scope,
        note: dto.note === undefined ? undefined : dto.note.trim() || null,
        isEnabled: dto.isEnabled,
      },
      include: { createdBy: { select: { id: true, nickname: true, email: true } } },
    });
  }

  async delete(ruleId: string) {
    const deleted = await this.prisma.sensitiveWordRule.deleteMany({ where: { id: ruleId } });
    if (deleted.count === 0) {
      throw new NotFoundException('敏感词规则不存在');
    }
    return { deletedId: ruleId };
  }

  private normalizeTerm(term: string) {
    const normalized = term.toLocaleLowerCase('zh-CN');
    if (!normalized) {
      throw new BadRequestException('敏感词不能为空');
    }
    return normalized;
  }

  private async ensureUnique(
    normalizedTerm: string,
    scope: SensitiveWordScope,
    excludeId?: string,
  ) {
    const existing = await this.prisma.sensitiveWordRule.findFirst({
      where: { normalizedTerm, scope, id: excludeId ? { not: excludeId } : undefined },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('相同范围内已存在该敏感词');
    }
  }
}
