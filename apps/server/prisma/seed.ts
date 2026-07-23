import { ChapterStatus, NovelStatus, PrismaClient, UserRole } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await hash('Admin123456', 12);

  await prisma.user.upsert({
    where: { email: 'admin@novel.local' },
    update: {},
    create: {
      email: 'admin@novel.local',
      nickname: '平台管理员',
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  const author = await prisma.user.upsert({
    where: { email: 'author@novel.local' },
    update: { role: UserRole.AUTHOR },
    create: {
      email: 'author@novel.local',
      nickname: '南城纸伞',
      passwordHash,
      role: UserRole.AUTHOR,
    },
  });

  await prisma.authorProfile.upsert({
    where: { userId: author.id },
    update: { penName: '南城纸伞' },
    create: {
      userId: author.id,
      penName: '南城纸伞',
      bio: '喜欢写科幻和悬疑的原创作者。',
    },
  });

  const channels = [
    { id: 'channel_male', code: 'male', name: '男频', sortOrder: 10 },
    { id: 'channel_female', code: 'female', name: '女频', sortOrder: 20 },
    { id: 'channel_short', code: 'short', name: '短篇', sortOrder: 30 },
    { id: 'channel_published', code: 'published', name: '出版', sortOrder: 40 },
  ];

  for (const channel of channels) {
    await prisma.contentChannel.upsert({
      where: { code: channel.code },
      update: {
        name: channel.name,
        sortOrder: channel.sortOrder,
      },
      create: channel,
    });
  }

  const categories = [
    { name: '玄幻', channel: 'male', sortOrder: 10 },
    { name: '都市', channel: 'male', sortOrder: 20 },
    { name: '历史', channel: 'male', sortOrder: 30 },
    { name: '科幻', channel: 'male', sortOrder: 40 },
    { name: '悬疑', channel: 'short', sortOrder: 50 },
    { name: '现代言情', channel: 'female', sortOrder: 60 },
    { name: '古代言情', channel: 'female', sortOrder: 70 },
  ];

  for (const category of categories) {
    await prisma.category.upsert({
      where: { name: category.name },
      update: {
        channel: category.channel,
        sortOrder: category.sortOrder,
      },
      create: category,
    });
  }

  const homeFeaturedSlot = await prisma.recommendSlot.upsert({
    where: { code: 'home_featured' },
    update: {},
    create: {
      code: 'home_featured',
      name: '首页编辑推荐',
    },
  });

  const sciFi = await prisma.category.findUniqueOrThrow({
    where: { name: '科幻' },
  });

  const novel = await prisma.novel.upsert({
    where: { id: 'seed_novel_star_pact' },
    update: {},
    create: {
      id: 'seed_novel_star_pact',
      title: '星河旧约',
      summary: '失落舰队重返太阳系，一名档案修复师发现了被删除三百年的远航真相。',
      authorId: author.id,
      categoryId: sciFi.id,
      status: NovelStatus.SERIALIZING,
      wordCount: 0,
      tags: {
        connectOrCreate: [
          { where: { name: '星际' }, create: { name: '星际' } },
          { where: { name: '悬念' }, create: { name: '悬念' } },
        ],
      },
    },
  });

  const mainVolume = await prisma.novelVolume.upsert({
    where: {
      novelId_orderIndex: {
        novelId: novel.id,
        orderIndex: 1,
      },
    },
    update: { title: '正文' },
    create: {
      id: 'seed_volume_star_pact_main',
      novelId: novel.id,
      title: '正文',
      orderIndex: 1,
    },
  });

  const chapters = [
    {
      orderIndex: 1,
      title: '第一章 归航信号',
      content:
        '凌晨三点，月面中继站收到一段来自深空的旧式脉冲。档案修复师林泊站在监听台前，听见了三百年前失踪舰队的识别码。那串数字被反复播放，像一封迟到太久的家书，也像某种警告。',
    },
    {
      orderIndex: 2,
      title: '第二章 被删除的坐标',
      content:
        '林泊调出远航档案，却发现舰队最后一次跃迁记录被人为抹去。更奇怪的是，删除记录的人留下了自己的权限签名，而那个名字属于早已在火星纪念碑上刻下的第一任舰长。',
    },
  ];

  for (const chapter of chapters) {
    await prisma.chapter.upsert({
      where: {
        novelId_orderIndex: {
          novelId: novel.id,
          orderIndex: chapter.orderIndex,
        },
      },
      update: { volumeId: mainVolume.id },
      create: {
        novelId: novel.id,
        volumeId: mainVolume.id,
        title: chapter.title,
        content: chapter.content,
        orderIndex: chapter.orderIndex,
        status: ChapterStatus.PUBLISHED,
        wordCount: chapter.content.replace(/\s/g, '').length,
        publishedAt: new Date(),
      },
    });
  }

  const wordCount = chapters.reduce(
    (total, chapter) => total + chapter.content.replace(/\s/g, '').length,
    0,
  );

  await prisma.novel.update({
    where: { id: novel.id },
    data: { wordCount },
  });

  await prisma.recommendItem.upsert({
    where: {
      slotId_novelId: {
        slotId: homeFeaturedSlot.id,
        novelId: novel.id,
      },
    },
    update: { sortOrder: 1 },
    create: {
      slotId: homeFeaturedSlot.id,
      novelId: novel.id,
      sortOrder: 1,
    },
  });

  const pendingNovel = await prisma.novel.upsert({
    where: { id: 'seed_novel_pending_review' },
    update: {},
    create: {
      id: 'seed_novel_pending_review',
      title: '长街有风',
      summary: '小城青年重回创业前夜，在烟火气里重新选择事业、亲情与爱情。',
      authorId: author.id,
      categoryId: (await prisma.category.findUniqueOrThrow({ where: { name: '都市' } })).id,
      status: NovelStatus.REVIEWING,
      wordCount: 0,
      tags: {
        connectOrCreate: [
          { where: { name: '创业' }, create: { name: '创业' } },
          { where: { name: '生活' }, create: { name: '生活' } },
        ],
      },
    },
  });

  const pendingVolume = await prisma.novelVolume.upsert({
    where: {
      novelId_orderIndex: {
        novelId: pendingNovel.id,
        orderIndex: 1,
      },
    },
    update: { title: '正文' },
    create: {
      id: 'seed_volume_pending_review_main',
      novelId: pendingNovel.id,
      title: '正文',
      orderIndex: 1,
    },
  });

  await prisma.chapter.upsert({
    where: {
      novelId_orderIndex: {
        novelId: pendingNovel.id,
        orderIndex: 1,
      },
    },
    update: { volumeId: pendingVolume.id },
    create: {
      novelId: pendingNovel.id,
      volumeId: pendingVolume.id,
      title: '第一章 旧站台',
      content:
        '清晨六点的旧站台还没有完全醒来，陈望拖着行李箱站在人群背后，忽然意识到自己回到了十年前。那一年，他还没有离开小城，也还没有错过那通改变命运的电话。',
      orderIndex: 1,
      status: ChapterStatus.REVIEWING,
      wordCount:
        '清晨六点的旧站台还没有完全醒来，陈望拖着行李箱站在人群背后，忽然意识到自己回到了十年前。那一年，他还没有离开小城，也还没有错过那通改变命运的电话。'.replace(
          /\s/g,
          '',
        ).length,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
