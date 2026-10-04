import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CreateFolderDto } from './dto/create-folder.dto';
import { MoveFileDto } from './dto/move-file.dto';
import { FileStorageService, StorageUpload } from './file-storage.service';
import {
  GoogleDriveQuotaService,
  QuotaMetric,
} from './google-drive-quota.service';

const MAX_VERCEL_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_LOCAL_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_UPLOAD_BYTES = process.env.VERCEL
  ? MAX_VERCEL_UPLOAD_BYTES
  : MAX_LOCAL_UPLOAD_BYTES;

@Controller('file-storage/projects')
export class FileStorageController {
  constructor(
    private readonly fileStorageService: FileStorageService,
    private readonly quotaService: GoogleDriveQuotaService,
  ) {}

  @Get(':projectId/items')
  getItems(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.fileStorageService.getItems(projectId);
  }

  @Post(':projectId/folders')
  createFolder(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() body: CreateFolderDto,
  ) {
    return this.fileStorageService.createFolder(projectId, body);
  }

  @Delete(':projectId/folders/:folderId')
  deleteFolder(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('folderId') folderId: string,
  ) {
    return this.fileStorageService.deleteFolder(projectId, folderId);
  }

  @Post(':projectId/files')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { files: 1, fileSize: MAX_UPLOAD_BYTES },
    }),
  )
  uploadFile(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @UploadedFile() file: StorageUpload | undefined,
    @Query('folderId') folderId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('A file is required');
    }
    return this.fileStorageService.uploadFile(
      projectId,
      file,
      folderId ?? null,
    );
  }

  @Patch(':projectId/files/:fileId')
  moveFile(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('fileId') fileId: string,
    @Body() body: MoveFileDto,
  ) {
    if (!Object.prototype.hasOwnProperty.call(body, 'folderId')) {
      throw new BadRequestException(
        'folderId is required; use null for the project root',
      );
    }
    return this.fileStorageService.moveFile(projectId, fileId, body);
  }

  @Delete(':projectId/files/:fileId')
  deleteFile(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('fileId') fileId: string,
  ) {
    return this.fileStorageService.deleteFile(projectId, fileId);
  }

  @Get(':projectId/files/:fileId/download')
  async downloadFile(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('fileId') fileId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const download = await this.fileStorageService.getDownload(
      projectId,
      fileId,
    );
    response.setHeader('Content-Type', download.mimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(download.name)}`,
    );
    return new StreamableFile(download.stream);
  }
  @Get('quota')
  async getQuota(): Promise<{
    service: string;
    projectId: string;
    usage: QuotaMetric[];
    limits: QuotaMetric[];
  }> {
    return this.quotaService.getQuota();
  }
}
