import { BadRequestException, ConflictException } from '@nestjs/common';
import { SensitiveWordScope, UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SensitiveWordsService } from '../src/modules/moderation/sensitive-words.service';

const admin = {
  id: 'admin_1',
  email: 'admin@example.com',
  role: UserRole.ADMIN,
};

describe('SensitiveWordsService', () => {
  it('rejects matching content with field context', async () => {
    const service = new SensitiveWordsService({
      sensitiveWordRule: {
        findMany: async () => [{ term: '禁词', normalizedTerm: '禁词' }],
      },
    } as never);

    await assert.rejects(
      () =>
        service.assertAllowed(SensitiveWordScope.CHAPTER, [
          { label: '章节标题', text: '普通标题' },
          { label: '章节正文', text: '正文中出现了禁词内容' },
        ]),
      (error: unknown) =>
        error instanceof BadRequestException &&
        error.message.includes('章节正文') &&
        error.message.includes('禁词'),
    );
  });

  it('allows content when enabled rules do not match', async () => {
    const service = new SensitiveWordsService({
      sensitiveWordRule: {
        findMany: async () => [{ term: '禁词', normalizedTerm: '禁词' }],
      },
    } as never);

    await service.assertAllowed(SensitiveWordScope.COMMENT, [
      { label: '评论', text: '这是一条正常评论' },
    ]);
  });

  it('normalizes new rules and rejects duplicates in the same scope', async () => {
    let createArgs: unknown;
    const service = new SensitiveWordsService({
      sensitiveWordRule: {
        findFirst: async () => null,
        create: async (args: unknown) => {
          createArgs = args;
          return { id: 'rule_1' };
        },
      },
    } as never);

    await service.create(admin, {
      term: '  BlockWord  ',
      scope: SensitiveWordScope.NOVEL,
      note: '测试规则',
    });
    const data = (createArgs as { data: Record<string, unknown> }).data;
    assert.equal(data.term, 'BlockWord');
    assert.equal(data.normalizedTerm, 'blockword');
    assert.equal(data.createdById, admin.id);

    const duplicateService = new SensitiveWordsService({
      sensitiveWordRule: { findFirst: async () => ({ id: 'rule_existing' }) },
    } as never);
    await assert.rejects(
      () =>
        duplicateService.create(admin, {
          term: 'blockword',
          scope: SensitiveWordScope.NOVEL,
        }),
      ConflictException,
    );
  });
});
