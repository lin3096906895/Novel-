import { BadRequestException, ConflictException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TaxonomyService } from '../src/modules/admin/taxonomy.service';

const admin = { id: 'admin_1', email: 'admin@example.com', role: UserRole.ADMIN };

describe('TaxonomyService', () => {
  it('creates a channel and records an audit snapshot', async () => {
    let auditEntry: unknown;
    const created = {
      id: 'channel_1',
      code: 'youth',
      name: '青春',
      sortOrder: 20,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const prisma = {
      contentChannel: { findFirst: async () => null },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({ contentChannel: { create: async () => created } }),
    };
    const service = new TaxonomyService(
      prisma as never,
      { record: async (entry: unknown) => (auditEntry = entry) } as never,
    );

    const result = await service.createChannel(admin, {
      code: 'YOUTH',
      name: ' 青春 ',
      sortOrder: 20,
    });

    assert.equal(result.code, 'youth');
    assert.equal((auditEntry as { action: string }).action, 'taxonomy.channel.create');
    assert.equal((auditEntry as { after: { name: string } }).after.name, '青春');
  });

  it('rejects duplicate channel code or name', async () => {
    const service = new TaxonomyService(
      { contentChannel: { findFirst: async () => ({ id: 'existing' }) } } as never,
      {} as never,
    );

    await assert.rejects(
      () => service.createChannel(admin, { code: 'male', name: '男频' }),
      ConflictException,
    );
  });

  it('prevents deleting a category that is still used by novels', async () => {
    const service = new TaxonomyService(
      {
        category: {
          findUnique: async () => ({
            id: 'category_1',
            name: '科幻',
            channel: 'male',
            sortOrder: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            _count: { novels: 2 },
          }),
        },
      } as never,
      {} as never,
    );

    await assert.rejects(() => service.deleteCategory(admin, 'category_1'), BadRequestException);
  });
});
