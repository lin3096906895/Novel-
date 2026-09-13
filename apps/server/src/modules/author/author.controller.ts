import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RequestUser } from '../auth/auth.types';
import { AuthorAnnouncementsService } from './author-announcements.service';
import { AuthorAiService } from './author-ai.service';
import { AuthorCalendarService } from './author-calendar.service';
import { AuthorCollectionService } from './author-collection.service';
import { AuthorMemoryService } from './author-memory.service';
import { AuthorService } from './author.service';
import { AuthorCalendarQueryDto } from './dto/author-calendar-query.dto';
import { AuthorAiAssistanceDto } from './dto/author-ai-assistance.dto';
import { AuthorDashboardQueryDto } from './dto/author-dashboard-query.dto';
import { AssignChapterVolumeDto } from './dto/assign-chapter-volume.dto';
import { BatchDeleteChaptersDto } from './dto/batch-delete-chapters.dto';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { CreateAuthorCalendarEventDto } from './dto/create-author-calendar-event.dto';
import { CreateNovelDto } from './dto/create-novel.dto';
import { CreateNovelMemoryDto } from './dto/create-novel-memory.dto';
import { CreateVolumeDto } from './dto/create-volume.dto';
import { CommitCollectionTaskDto } from './dto/commit-collection-task.dto';
import { PreviewCollectionTaskDto } from './dto/preview-collection-task.dto';
import { ReorderChaptersDto } from './dto/reorder-chapters.dto';
import { ReorderVolumesDto } from './dto/reorder-volumes.dto';
import { SaveNovelAnnouncementDto } from './dto/save-novel-announcement.dto';
import { UpdateChapterDto } from './dto/update-chapter.dto';
import { UpdateAuthorCalendarEventDto } from './dto/update-author-calendar-event.dto';
import { UpdateChapterScheduleDto } from './dto/update-chapter-schedule.dto';
import { UpdateNovelLifecycleDto } from './dto/update-novel-lifecycle.dto';
import { UpdateNovelDto } from './dto/update-novel.dto';
import { UpdateNovelMemoryDto } from './dto/update-novel-memory.dto';
import { UpdateVolumeDto } from './dto/update-volume.dto';

@Controller('author')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.AUTHOR)
export class AuthorController {
  constructor(
    private readonly authorService: AuthorService,
    private readonly authorAiService: AuthorAiService,
    private readonly announcementsService: AuthorAnnouncementsService,
    private readonly calendarService: AuthorCalendarService,
    private readonly collectionService: AuthorCollectionService,
    private readonly memoryService: AuthorMemoryService,
  ) {}

  @Post('collection-tasks/preview')
  async previewCollectionTask(
    @CurrentUser() user: RequestUser,
    @Body() dto: PreviewCollectionTaskDto,
  ) {
    return {
      code: 0,
      message: '采集预览已生成',
      data: await this.collectionService.preview(user, dto),
    };
  }

  @Post('collection-tasks/analyze-json')
  async analyzeJsonSource(@Body('sourceUrl') sourceUrl: string) {
    return {
      code: 0,
      message: 'JSON 结构分析完成',
      data: await this.collectionService.analyzeJsonSource(sourceUrl),
    };
  }

  @Post('collection-tasks/analyze-html')
  async analyzeHtmlSource(@Body('sourceUrl') sourceUrl: string) {
    return {
      code: 0,
      message: 'HTML 结构分析完成',
      data: await this.collectionService.analyzeHtmlSource(sourceUrl),
    };
  }

  @Post('collection-tasks/:taskId/commit')
  async commitCollectionTask(
    @CurrentUser() user: RequestUser,
    @Param('taskId') taskId: string,
    @Body() _dto: CommitCollectionTaskDto,
  ) {
    return {
      code: 0,
      message: '公版作品已导入阅读端',
      data: await this.collectionService.commit(user, taskId),
    };
  }

  @Get('dashboard')
  async getDashboard(@CurrentUser() user: RequestUser, @Query() query: AuthorDashboardQueryDto) {
    return {
      code: 0,
      message: 'ok',
      data: await this.authorService.getDashboard(user, query),
    };
  }

  @Get('calendar')
  async getCalendar(@CurrentUser() user: RequestUser, @Query() query: AuthorCalendarQueryDto) {
    return {
      code: 0,
      message: 'ok',
      data: await this.calendarService.getMonth(user, query),
    };
  }

  @Post('novels/:novelId/calendar-events')
  async createCalendarEvent(
    @CurrentUser() user: RequestUser,
    @Param('novelId') novelId: string,
    @Body() dto: CreateAuthorCalendarEventDto,
  ) {
    return {
      code: 0,
      message: '创作计划已创建',
      data: await this.calendarService.create(user, novelId, dto),
    };
  }

  @Patch('calendar-events/:eventId')
  async updateCalendarEvent(
    @CurrentUser() user: RequestUser,
    @Param('eventId') eventId: string,
    @Body() dto: UpdateAuthorCalendarEventDto,
  ) {
    return {
      code: 0,
      message: '创作计划已更新',
      data: await this.calendarService.update(user, eventId, dto),
    };
  }

  @Delete('calendar-events/:eventId')
  async deleteCalendarEvent(@CurrentUser() user: RequestUser, @Param('eventId') eventId: string) {
    return {
      code: 0,
      message: '创作计划已删除',
      data: await this.calendarService.delete(user, eventId),
    };
  }

  @Get('novels')
  async findMyNovels(@CurrentUser() user: RequestUser) {
    return {
      code: 0,
      message: 'ok',
      data: await this.authorService.findMyNovels(user),
    };
  }

  @Get('novels/:novelId/memories')
  async listNovelMemories(
    @CurrentUser() user: RequestUser,
    @Param('novelId') novelId: string,
  ) {
    return {
      code: 0,
      message: 'ok',
      data: await this.memoryService.list(user, novelId),
    };
  }

  @Post('novels/:novelId/memories')
  async createNovelMemory(
    @CurrentUser() user: RequestUser,
    @Param('novelId') novelId: string,
    @Body() dto: CreateNovelMemoryDto,
  ) {
    return {
      code: 0,
      message: '记忆条目已创建',
      data: await this.memoryService.create(user, novelId, dto),
    };
  }

  @Patch('memories/:memoryId')
  async updateNovelMemory(
    @CurrentUser() user: RequestUser,
    @Param('memoryId') memoryId: string,
    @Body() dto: UpdateNovelMemoryDto,
  ) {
    return {
      code: 0,
      message: '记忆条目已更新',
      data: await this.memoryService.update(user, memoryId, dto),
    };
  }

  @Delete('memories/:memoryId')
  async deleteNovelMemory(
    @CurrentUser() user: RequestUser,
    @Param('memoryId') memoryId: string,
  ) {
    return {
      code: 0,
      message: '记忆条目已删除',
      data: await this.memoryService.delete(user, memoryId),
    };
  }

  @Post('novels')
  async createNovel(@CurrentUser() user: RequestUser, @Body() dto: CreateNovelDto) {
    return {
      code: 0,
      message: dto.action === 'save' ? '作品草稿已保存' : '作品已提交审核',
      data: await this.authorService.createNovel(user, dto),
    };
  }

  @Put('novels/:novelId')
  async updateNovel(
    @CurrentUser() user: RequestUser,
    @Param('novelId') novelId: string,
    @Body() dto: UpdateNovelDto,
  ) {
    return {
      code: 0,
      message: dto.action === 'save' ? '作品草稿已保存' : '作品已提交审核',
      data: await this.authorService.updateNovel(user, novelId, dto),
    };
  }

  @Delete('novels/:novelId')
  async deleteNovel(@CurrentUser() user: RequestUser, @Param('novelId') novelId: string) {
    return {
      code: 0,
      message: '作品已删除',
      data: await this.authorService.deleteNovel(user, novelId),
    };
  }

  @Patch('novels/:novelId/lifecycle')
  async updateNovelLifecycle(
    @CurrentUser() user: RequestUser,
    @Param('novelId') novelId: string,
    @Body() dto: UpdateNovelLifecycleDto,
  ) {
    return {
      code: 0,
      message: dto.action === 'complete' ? '作品已设为完结' : '作品已恢复连载',
      data: await this.authorService.updateNovelLifecycle(user, novelId, dto),
    };
  }

  @Get('novels/:novelId/announcements')
  async listAnnouncements(@CurrentUser() user: RequestUser, @Param('novelId') novelId: string) {
    return {
      code: 0,
      message: 'ok',
      data: await this.announcementsService.list(user, novelId),
    };
  }

  @Post('novels/:novelId/announcements')
  async createAnnouncement(
    @CurrentUser() user: RequestUser,
    @Param('novelId') novelId: string,
    @Body() dto: SaveNovelAnnouncementDto,
  ) {
    return {
      code: 0,
      message: dto.action === 'publish' ? '作品公告已发布' : '作品公告草稿已保存',
      data: await this.announcementsService.create(user, novelId, dto),
    };
  }

  @Patch('announcements/:announcementId')
  async updateAnnouncement(
    @CurrentUser() user: RequestUser,
    @Param('announcementId') announcementId: string,
    @Body() dto: SaveNovelAnnouncementDto,
  ) {
    return {
      code: 0,
      message: dto.action === 'publish' ? '作品公告已发布' : '作品公告草稿已保存',
      data: await this.announcementsService.update(user, announcementId, dto),
    };
  }

  @Delete('announcements/:announcementId')
  async deleteAnnouncement(
    @CurrentUser() user: RequestUser,
    @Param('announcementId') announcementId: string,
  ) {
    return {
      code: 0,
      message: '作品公告已删除',
      data: await this.announcementsService.delete(user, announcementId),
    };
  }

  @Post('novels/:novelId/volumes')
  async createVolume(
    @CurrentUser() user: RequestUser,
    @Param('novelId') novelId: string,
    @Body() dto: CreateVolumeDto,
  ) {
    return {
      code: 0,
      message: '分卷已创建',
      data: await this.authorService.createVolume(user, novelId, dto),
    };
  }

  @Patch('volumes/:volumeId')
  async updateVolume(
    @CurrentUser() user: RequestUser,
    @Param('volumeId') volumeId: string,
    @Body() dto: UpdateVolumeDto,
  ) {
    return {
      code: 0,
      message: '分卷已更新',
      data: await this.authorService.updateVolume(user, volumeId, dto),
    };
  }

  @Delete('volumes/:volumeId')
  async deleteVolume(@CurrentUser() user: RequestUser, @Param('volumeId') volumeId: string) {
    return {
      code: 0,
      message: '分卷已删除',
      data: await this.authorService.deleteVolume(user, volumeId),
    };
  }

  @Put('novels/:novelId/volumes/order')
  async reorderVolumes(
    @CurrentUser() user: RequestUser,
    @Param('novelId') novelId: string,
    @Body() dto: ReorderVolumesDto,
  ) {
    return {
      code: 0,
      message: '分卷顺序已更新',
      data: await this.authorService.reorderVolumes(user, novelId, dto),
    };
  }

  @Patch('chapters/:chapterId/volume')
  async assignChapterVolume(
    @CurrentUser() user: RequestUser,
    @Param('chapterId') chapterId: string,
    @Body() dto: AssignChapterVolumeDto,
  ) {
    return {
      code: 0,
      message: '章节分卷已更新',
      data: await this.authorService.assignChapterVolume(user, chapterId, dto),
    };
  }

  @Patch('chapters/:chapterId/schedule')
  async updateChapterSchedule(
    @CurrentUser() user: RequestUser,
    @Param('chapterId') chapterId: string,
    @Body() dto: UpdateChapterScheduleDto,
  ) {
    return {
      code: 0,
      message: '章节发布时间已更新',
      data: await this.authorService.updateChapterSchedule(user, chapterId, dto),
    };
  }

  @Put('chapters/:chapterId')
  async updateChapter(
    @CurrentUser() user: RequestUser,
    @Param('chapterId') chapterId: string,
    @Body() dto: UpdateChapterDto,
  ) {
    return {
      code: 0,
      message: dto.action === 'save' ? '章节草稿已保存' : '章节已提交审核',
      data: await this.authorService.updateChapter(user, chapterId, dto),
    };
  }

  @Post('chapters/:chapterId/ai-assistance')
  async assistChapterWithAi(
    @CurrentUser() user: RequestUser,
    @Param('chapterId') chapterId: string,
    @Body() dto: AuthorAiAssistanceDto,
  ) {
    return {
      code: 0,
      message: 'AI assistance generated',
      data: await this.authorAiService.assistChapter(user, chapterId, dto),
    };
  }

  @Get('novels/:novelId/rag/status')
  async getNovelRagStatus(
    @CurrentUser() user: RequestUser,
    @Param('novelId') novelId: string,
  ) {
    return {
      code: 0,
      message: 'ok',
      data: await this.authorService.getRagIndexStatus(user, novelId),
    };
  }

  @Post('novels/:novelId/rag/reindex')
  async reindexNovelForRag(
    @CurrentUser() user: RequestUser,
    @Param('novelId') novelId: string,
  ) {
    return {
      code: 0,
      message: '作品知识库已重建',
      data: await this.authorService.reindexNovelForRag(user, novelId),
    };
  }

  @Post('novels/:novelId/rag/evaluate')
  async evaluateNovelRag(
    @CurrentUser() user: RequestUser,
    @Param('novelId') novelId: string,
  ) {
    return {
      code: 0,
      message: '作品检索评测已完成',
      data: await this.authorService.evaluateNovelRag(user, novelId),
    };
  }

  @Post('ai-assistance')
  async assistDraftWithAi(@CurrentUser() user: RequestUser, @Body() dto: AuthorAiAssistanceDto) {
    return {
      code: 0,
      message: 'AI assistance generated',
      data: await this.authorAiService.assistDraft(user, dto),
    };
  }

  @Get('chapters/:chapterId/versions')
  async listChapterVersions(
    @CurrentUser() user: RequestUser,
    @Param('chapterId') chapterId: string,
  ) {
    return {
      code: 0,
      message: 'ok',
      data: await this.authorService.listChapterVersions(user, chapterId),
    };
  }

  @Post('chapters/:chapterId/versions/:versionId/restore')
  async restoreChapterVersion(
    @CurrentUser() user: RequestUser,
    @Param('chapterId') chapterId: string,
    @Param('versionId') versionId: string,
  ) {
    return {
      code: 0,
      message: '章节历史版本已恢复为草稿',
      data: await this.authorService.restoreChapterVersion(user, chapterId, versionId),
    };
  }

  @Get('novels/:novelId/chapter-trash')
  async listDeletedChapters(@CurrentUser() user: RequestUser, @Param('novelId') novelId: string) {
    return {
      code: 0,
      message: 'ok',
      data: await this.authorService.listDeletedChapters(user, novelId),
    };
  }

  @Post('chapters/:chapterId/restore')
  async restoreDeletedChapter(
    @CurrentUser() user: RequestUser,
    @Param('chapterId') chapterId: string,
  ) {
    return {
      code: 0,
      message: '章节已从回收站恢复',
      data: await this.authorService.restoreDeletedChapter(user, chapterId),
    };
  }

  @Delete('chapters/:chapterId/permanent')
  async permanentlyDeleteChapter(
    @CurrentUser() user: RequestUser,
    @Param('chapterId') chapterId: string,
  ) {
    return {
      code: 0,
      message: '章节已永久删除',
      data: await this.authorService.permanentlyDeleteChapter(user, chapterId),
    };
  }

  @Delete('chapters/:chapterId')
  async deleteChapter(@CurrentUser() user: RequestUser, @Param('chapterId') chapterId: string) {
    return {
      code: 0,
      message: '章节已删除',
      data: await this.authorService.deleteChapter(user, chapterId),
    };
  }

  @Put('novels/:novelId/chapters/order')
  async reorderChapters(
    @CurrentUser() user: RequestUser,
    @Param('novelId') novelId: string,
    @Body() dto: ReorderChaptersDto,
  ) {
    return {
      code: 0,
      message: '章节顺序已更新',
      data: await this.authorService.reorderChapters(user, novelId, dto),
    };
  }

  @Post('novels/:novelId/chapters/batch-delete')
  async deleteChapters(
    @CurrentUser() user: RequestUser,
    @Param('novelId') novelId: string,
    @Body() dto: BatchDeleteChaptersDto,
  ) {
    return {
      code: 0,
      message: `已删除 ${dto.chapterIds.length} 个章节`,
      data: await this.authorService.deleteChapters(user, novelId, dto),
    };
  }

  @Post('novels/:novelId/chapters')
  async createChapter(
    @CurrentUser() user: RequestUser,
    @Param('novelId') novelId: string,
    @Body() dto: CreateChapterDto,
  ) {
    return {
      code: 0,
      message: dto.action === 'save' ? '章节草稿已保存' : '章节已提交审核',
      data: await this.authorService.createChapter(user, novelId, dto),
    };
  }
}
