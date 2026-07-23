import { Body, Controller, Get, Param, Post, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UploadCoverDto } from './dto/upload-cover.dto';
import { UploadsService } from './uploads.service';

@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('covers')
  @UseGuards(JwtAuthGuard)
  async uploadCover(@Body() dto: UploadCoverDto) {
    return {
      code: 0,
      message: 'Cover uploaded',
      data: await this.uploadsService.saveCover(dto),
    };
  }

  @Get('covers/:fileName')
  async getCover(@Param('fileName') fileName: string, @Res({ passthrough: true }) response: Response) {
    const cover = await this.uploadsService.getCover(fileName);
    response.setHeader('Content-Type', cover.contentType);
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return new StreamableFile(cover.stream);
  }
}
