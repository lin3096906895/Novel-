import { UserRole, UserStatus } from '@prisma/client';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DataExportService } from '../src/modules/auth/data-export.service';

describe('DataExportService', () => {
  it('exports versioned sections after sensitive-action verification', async () => {
    const emptyMany = async () => [];
    let verification: unknown;
    const service = new DataExportService(
      {
        user: {
          findUniqueOrThrow: async () => ({
            id: 'user_1',
            email: 'reader@example.com',
            nickname: '读者',
            role: UserRole.READER,
            status: UserStatus.ACTIVE,
            emailVerifiedAt: new Date(),
            suspendedAt: null,
            suspensionReason: null,
            deletionRequestedAt: null,
            deletionScheduledAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        },
        authorProfile: { findUnique: async () => null },
        authorApplication: { findUnique: async () => null },
        novel: { findMany: emptyMany },
        bookshelfItem: { findMany: emptyMany },
        readingHistory: { findMany: emptyMany },
        chapterRead: { findMany: emptyMany },
        readingPreference: { findUnique: async () => null },
        chapterBookmark: { findMany: emptyMany },
        readingAnnotation: { findMany: emptyMany },
        comment: { findMany: emptyMany },
        paragraphComment: { findMany: emptyMany },
        novelRating: { findMany: emptyMany },
        authorFollow: { findMany: emptyMany },
        notification: { findMany: emptyMany },
        searchHistory: { findMany: emptyMany },
        authSession: { findMany: emptyMany },
        loginActivity: { findMany: emptyMany },
        commentReport: { findMany: emptyMany },
        paragraphCommentReport: { findMany: emptyMany },
        contentReport: { findMany: emptyMany },
        contentAppeal: { findMany: emptyMany },
      } as never,
      {
        verifySensitiveAction: async (...args: unknown[]) => {
          verification = args;
        },
      } as never,
    );
    const user = {
      id: 'user_1',
      email: 'reader@example.com',
      role: UserRole.READER,
      sessionId: 'session_1',
    };

    const result = await service.export(user, {
      currentPassword: 'Password123',
      code: '123456',
    });

    assert.equal(result.format, 'novel-platform-personal-data');
    assert.equal(result.version, 1);
    assert.deepEqual(verification, [user, 'Password123', '123456']);
    assert.deepEqual(Object.keys(result), [
      'format',
      'version',
      'generatedAt',
      'account',
      'author',
      'reading',
      'interactions',
      'communication',
      'security',
    ]);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes('passwordHash'), false);
    assert.equal(serialized.includes('refreshTokenHash'), false);
    assert.equal(serialized.includes('secretEncrypted'), false);
    assert.equal(serialized.includes('codeHash'), false);
  });
});
