import { PrismaClient, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';

const e2eAuthorEmail = 'e2e-author@novel.local';
const e2eReaderEmail = 'e2e-reader@novel.local';

export default async function globalSetup() {
  const prisma = new PrismaClient();
  try {
    const existingAuthor = await prisma.user.findUnique({
      where: { email: e2eAuthorEmail },
      select: { id: true },
    });

    if (existingAuthor) {
      await prisma.authorProfile.deleteMany({ where: { userId: existingAuthor.id } });
      await prisma.bookshelfItem.deleteMany({ where: { userId: existingAuthor.id } });
      await prisma.user.delete({ where: { id: existingAuthor.id } });
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: e2eReaderEmail },
      select: { id: true },
    });

    if (existingUser) {
      await prisma.bookshelfItem.deleteMany({ where: { userId: existingUser.id } });
      await prisma.user.delete({ where: { id: existingUser.id } });
    }

    await prisma.user.create({
      data: {
        email: e2eReaderEmail,
        nickname: 'E2E Reader',
        passwordHash: await hash('E2EReader123456', 12),
      },
    });

    await prisma.user.create({
      data: {
        email: e2eAuthorEmail,
        nickname: 'E2E Author',
        passwordHash: await hash('E2EAuthor123456', 12),
        role: UserRole.AUTHOR,
        authorProfile: {
          create: {
            penName: 'E2E Author',
            bio: 'An isolated author account for browser regression coverage.',
          },
        },
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}
