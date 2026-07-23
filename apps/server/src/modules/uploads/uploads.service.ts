import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { UploadCoverDto } from './dto/upload-cover.dto';

const maxCoverSize = 2 * 1024 * 1024;
const extensionByType = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
} as const;

@Injectable()
export class UploadsService {
  private readonly coverDir = join(process.cwd(), 'uploads', 'covers');

  async saveCover(dto: UploadCoverDto) {
    const prefix = `data:${dto.contentType};base64,`;
    if (!dto.dataUrl.startsWith(prefix)) {
      throw new BadRequestException('Invalid cover data');
    }

    const buffer = Buffer.from(dto.dataUrl.slice(prefix.length), 'base64');
    if (buffer.length === 0 || buffer.length > maxCoverSize) {
      throw new BadRequestException('Cover image must be smaller than 2MB');
    }

    const originalExtension = extname(dto.fileName).toLowerCase();
    const safeExtension = extensionByType[dto.contentType];
    if (originalExtension && originalExtension !== safeExtension && !(dto.contentType === 'image/jpeg' && originalExtension === '.jpeg')) {
      throw new BadRequestException('Cover extension does not match image type');
    }

    await mkdir(this.coverDir, { recursive: true });

    const fileName = `${randomUUID()}${safeExtension}`;
    await writeFile(join(this.coverDir, fileName), buffer);

    return {
      fileName,
      url: `/api/uploads/covers/${fileName}`,
      contentType: dto.contentType,
      size: buffer.length,
    };
  }

  async getCover(fileName: string) {
    if (!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(fileName)) {
      throw new NotFoundException('Cover not found');
    }

    const filePath = join(this.coverDir, fileName);
    try {
      await access(filePath);
    } catch {
      throw new NotFoundException('Cover not found');
    }

    return {
      stream: createReadStream(filePath),
      contentType: this.contentTypeOf(fileName),
    };
  }

  private contentTypeOf(fileName: string) {
    if (fileName.endsWith('.png')) return 'image/png';
    if (fileName.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }
}
