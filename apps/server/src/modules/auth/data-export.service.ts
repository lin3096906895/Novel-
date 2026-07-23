import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RequestUser } from './auth.types';
import { ExportPersonalDataDto } from './dto/data-export.dto';
import { TwoFactorService } from './two-factor.service';

@Injectable()
export class DataExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly twoFactorService: TwoFactorService,
  ) {}

  async export(user: RequestUser, dto: ExportPersonalDataDto) {
    await this.twoFactorService.verifySensitiveAction(user, dto.currentPassword, dto.code);

    const [
      account,
      authorProfile,
      authorApplication,
      novels,
      bookshelf,
      readingHistories,
      chapterReads,
      readingPreference,
      bookmarks,
      annotations,
      comments,
      paragraphComments,
      ratings,
      followedAuthors,
      notifications,
      searchHistories,
      sessions,
      loginActivities,
      commentReports,
      paragraphReports,
      contentReports,
      contentAppeals,
    ] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: {
          id: true,
          email: true,
          nickname: true,
          role: true,
          status: true,
          emailVerifiedAt: true,
          suspendedAt: true,
          suspensionReason: true,
          deletionRequestedAt: true,
          deletionScheduledAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.authorProfile.findUnique({
        where: { userId: user.id },
        select: { penName: true, bio: true, createdAt: true, updatedAt: true },
      }),
      this.prisma.authorApplication.findUnique({
        where: { userId: user.id },
        select: {
          penName: true,
          bio: true,
          statement: true,
          status: true,
          reviewReason: true,
          reviewedAt: true,
          createdAt: true,
          updatedAt: true,
          reviewedBy: { select: { nickname: true } },
        },
      }),
      this.prisma.novel.findMany({
        where: { authorId: user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          title: true,
          summary: true,
          coverUrl: true,
          status: true,
          wordCount: true,
          createdAt: true,
          updatedAt: true,
          category: { select: { id: true, name: true, channel: true } },
          tags: { select: { id: true, name: true } },
          volumes: {
            orderBy: { orderIndex: 'asc' },
            select: {
              id: true,
              title: true,
              description: true,
              orderIndex: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          announcements: {
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              title: true,
              content: true,
              isPinned: true,
              publishedAt: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          calendarEvents: {
            orderBy: { eventAt: 'asc' },
            select: {
              id: true,
              title: true,
              note: true,
              eventAt: true,
              type: true,
              isCompleted: true,
              createdAt: true,
              updatedAt: true,
            },
          },
          chapters: {
            orderBy: { orderIndex: 'asc' },
            select: {
              id: true,
              volumeId: true,
              title: true,
              content: true,
              orderIndex: true,
              status: true,
              wordCount: true,
              scheduledAt: true,
              publishedAt: true,
              deletedAt: true,
              createdAt: true,
              updatedAt: true,
              versions: {
                orderBy: { createdAt: 'asc' },
                select: {
                  id: true,
                  title: true,
                  content: true,
                  volumeId: true,
                  scheduledAt: true,
                  wordCount: true,
                  source: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.bookshelfItem.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          notifyOnUpdate: true,
          createdAt: true,
          novel: { select: { id: true, title: true, status: true } },
        },
      }),
      this.prisma.readingHistory.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: 'asc' },
        select: {
          progress: true,
          readingSeconds: true,
          updatedAt: true,
          novel: { select: { id: true, title: true } },
          chapter: { select: { id: true, title: true, orderIndex: true } },
        },
      }),
      this.prisma.chapterRead.findMany({
        where: { userId: user.id },
        orderBy: { completedAt: 'asc' },
        select: {
          completedAt: true,
          chapter: {
            select: {
              id: true,
              title: true,
              orderIndex: true,
              novel: { select: { id: true, title: true } },
            },
          },
        },
      }),
      this.prisma.readingPreference.findUnique({
        where: { userId: user.id },
        select: {
          fontSize: true,
          theme: true,
          lineHeight: true,
          contentWidth: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.chapterBookmark.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          createdAt: true,
          chapter: {
            select: {
              id: true,
              title: true,
              orderIndex: true,
              novel: { select: { id: true, title: true } },
            },
          },
        },
      }),
      this.prisma.readingAnnotation.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          paragraphIndex: true,
          startOffset: true,
          endOffset: true,
          selectedText: true,
          note: true,
          color: true,
          createdAt: true,
          updatedAt: true,
          chapter: {
            select: {
              id: true,
              title: true,
              novel: { select: { id: true, title: true } },
            },
          },
        },
      }),
      this.prisma.comment.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          parentId: true,
          content: true,
          isDeleted: true,
          createdAt: true,
          novel: { select: { id: true, title: true } },
          chapter: { select: { id: true, title: true } },
          _count: { select: { likes: true, replies: true } },
        },
      }),
      this.prisma.paragraphComment.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          paragraphIndex: true,
          parentId: true,
          content: true,
          isDeleted: true,
          createdAt: true,
          updatedAt: true,
          chapter: {
            select: {
              id: true,
              title: true,
              novel: { select: { id: true, title: true } },
            },
          },
          _count: { select: { likes: true, replies: true } },
        },
      }),
      this.prisma.novelRating.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          score: true,
          createdAt: true,
          updatedAt: true,
          novel: { select: { id: true, title: true } },
        },
      }),
      this.prisma.authorFollow.findMany({
        where: { followerId: user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          createdAt: true,
          author: {
            select: {
              id: true,
              nickname: true,
              authorProfile: { select: { penName: true } },
            },
          },
        },
      }),
      this.prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          type: true,
          title: true,
          content: true,
          link: true,
          isRead: true,
          createdAt: true,
        },
      }),
      this.prisma.searchHistory.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          keyword: true,
          searchCount: true,
          lastSearchedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.authSession.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          deviceName: true,
          userAgent: true,
          ipAddress: true,
          expiresAt: true,
          lastUsedAt: true,
          revokedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.loginActivity.findMany({
        where: { userId: user.id },
        orderBy: { occurredAt: 'asc' },
        select: {
          id: true,
          status: true,
          riskLevel: true,
          failureReason: true,
          deviceName: true,
          userAgent: true,
          ipAddress: true,
          occurredAt: true,
        },
      }),
      this.prisma.commentReport.findMany({
        where: { reporterId: user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          reason: true,
          detail: true,
          status: true,
          resolution: true,
          resolvedAt: true,
          contentSnapshot: true,
          commentAuthorNickname: true,
          novelId: true,
          novelTitle: true,
          chapterId: true,
          chapterTitle: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.paragraphCommentReport.findMany({
        where: { reporterId: user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          reason: true,
          detail: true,
          status: true,
          resolution: true,
          resolvedAt: true,
          createdAt: true,
          updatedAt: true,
          comment: {
            select: {
              id: true,
              content: true,
              paragraphIndex: true,
              chapter: {
                select: {
                  id: true,
                  title: true,
                  novel: { select: { id: true, title: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.contentReport.findMany({
        where: { reporterId: user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          targetType: true,
          targetId: true,
          targetTitle: true,
          targetSnapshot: true,
          reason: true,
          detail: true,
          status: true,
          resolution: true,
          resolvedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.contentAppeal.findMany({
        where: { appellantId: user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          targetType: true,
          targetId: true,
          targetTitle: true,
          reason: true,
          status: true,
          resolution: true,
          resolvedAt: true,
          createdAt: true,
          updatedAt: true,
          reviewer: { select: { nickname: true } },
          sourceReport: {
            select: { reason: true, resolution: true, resolvedAt: true },
          },
        },
      }),
    ]);

    const novelIds = novels.map((novel) => novel.id);
    const chapterIds = novels.flatMap((novel) => novel.chapters.map((chapter) => chapter.id));
    const reviewLogs =
      novelIds.length > 0
        ? await this.prisma.reviewLog.findMany({
            where: {
              OR: [
                { targetType: 'novel', targetId: { in: novelIds } },
                { targetType: 'chapter', targetId: { in: chapterIds } },
              ],
            },
            orderBy: { createdAt: 'asc' },
            select: {
              targetType: true,
              targetId: true,
              action: true,
              reason: true,
              createdAt: true,
              reviewer: { select: { nickname: true } },
            },
          })
        : [];

    return {
      format: 'novel-platform-personal-data',
      version: 1,
      generatedAt: new Date(),
      account,
      author: {
        profile: authorProfile,
        application: authorApplication,
        novels,
        reviewLogs,
      },
      reading: {
        bookshelf,
        histories: readingHistories,
        completedChapters: chapterReads,
        preference: readingPreference,
        bookmarks,
        annotations,
      },
      interactions: {
        comments,
        paragraphComments,
        ratings,
        followedAuthors,
        submittedReports: {
          comments: commentReports,
          paragraphs: paragraphReports,
          content: contentReports,
        },
        contentAppeals,
      },
      communication: {
        notifications,
        searchHistories,
      },
      security: {
        sessions,
        loginActivities,
      },
    };
  }
}
