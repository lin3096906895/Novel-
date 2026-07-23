import { PrismaClient } from '@prisma/client';

const e2eReaderEmail = 'e2e-reader@novel.local';
const e2eAuthorEmail = 'e2e-author@novel.local';

export default async function globalTeardown() {
  const prisma = new PrismaClient();
  try {
    await prisma.authSession.deleteMany({ where: { userAgent: 'NovelPlatformE2E' } });
    await prisma.loginActivity.deleteMany({ where: { userAgent: 'NovelPlatformE2E' } });

    const e2eReader = await prisma.user.findUnique({
      where: { email: e2eReaderEmail },
      select: { id: true },
    });
    if (e2eReader) {
      await prisma.bookshelfItem.deleteMany({ where: { userId: e2eReader.id } });
      await prisma.user.delete({ where: { id: e2eReader.id } });
    }

    const e2eAuthor = await prisma.user.findUnique({
      where: { email: e2eAuthorEmail },
      select: { id: true },
    });
    if (e2eAuthor) {
      await prisma.authorProfile.deleteMany({ where: { userId: e2eAuthor.id } });
      await prisma.bookshelfItem.deleteMany({ where: { userId: e2eAuthor.id } });
      await prisma.user.delete({ where: { id: e2eAuthor.id } });
    }
  } finally {
    await prisma.$disconnect();
  }
}
