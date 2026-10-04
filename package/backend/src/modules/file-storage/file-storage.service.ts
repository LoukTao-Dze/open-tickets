import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { MoveFileDto } from './dto/move-file.dto';
import { GoogleDriveFile, GoogleDriveService } from './google-drive.service';

interface FolderRow {
  id: number;
  name: string;
  parent_folder_id: number | null;
  modified_at: string;
}

interface FolderStorageRow {
  id: number;
  google_drive_metadata: GoogleDriveFile;
}

interface FileRow {
  id: number;
  name: string;
  size_bytes: number;
  mime_type: string | null;
  folder_id: number | null;
  modified_at: string;
  google_drive_metadata: GoogleDriveFile;
}

export interface StorageUpload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class FileStorageService {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly googleDriveService: GoogleDriveService,
  ) {}

  async getItems(projectId: string) {
    await this.assertProjectExists(projectId);
    const client = this.supabaseService.getClient();
    const [folderResponse, fileResponse] = await Promise.all([
      client
        .from('project_folders')
        .select('id,name,parent_folder_id,modified_at')
        .eq('project_id', projectId)
        .order('name'),
      client
        .from('project_files')
        .select(
          'id,name,size_bytes,mime_type,folder_id,modified_at,google_drive_metadata',
        )
        .eq('project_id', projectId)
        .order('name'),
    ]);

    if (folderResponse.error || fileResponse.error) {
      throw new InternalServerErrorException('Failed to load project files');
    }

    return {
      folders: ((folderResponse.data ?? []) as FolderRow[]).map((folder) => ({
        id: String(folder.id),
        name: folder.name,
        parentId:
          folder.parent_folder_id === null
            ? null
            : String(folder.parent_folder_id),
        modifiedAt: folder.modified_at,
      })),
      files: ((fileResponse.data ?? []) as FileRow[]).map((file) => ({
        id: String(file.id),
        name: file.name,
        sizeBytes: Number(file.size_bytes),
        mimeType: file.mime_type ?? 'application/octet-stream',
        parentId: file.folder_id === null ? null : String(file.folder_id),
        modifiedAt: file.modified_at,
      })),
    };
  }

  async createFolder(projectId: string, dto: CreateFolderDto) {
    await this.assertProjectExists(projectId);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Folder name is required');
    }

    const parentId = await this.getDriveParentId(
      projectId,
      dto.parentFolderId ?? null,
    );
    const driveFolder = await this.googleDriveService.createFolder(
      name,
      parentId,
    );
    const { data, error } = await this.supabaseService
      .getClient()
      .from('project_folders')
      .insert({
        project_id: projectId,
        name,
        parent_folder_id: dto.parentFolderId
          ? Number(dto.parentFolderId)
          : null,
        google_drive_metadata: driveFolder,
      })
      .select('id,name,parent_folder_id,modified_at')
      .single();

    if (error || !data) {
      await this.googleDriveService.deleteFile(driveFolder.id);
      throw new InternalServerErrorException('Failed to save folder metadata');
    }

    const folder = data as FolderRow;
    return {
      id: String(folder.id),
      name: folder.name,
      parentId:
        folder.parent_folder_id === null
          ? null
          : String(folder.parent_folder_id),
      modifiedAt: folder.modified_at,
    };
  }

  async deleteFolder(projectId: string, folderId: string) {
    const client = this.supabaseService.getClient();
    const { data: folder, error: folderError } = await client
      .from('project_folders')
      .select('id,google_drive_metadata')
      .eq('project_id', projectId)
      .eq('id', folderId)
      .maybeSingle();
    if (folderError) {
      throw new InternalServerErrorException('Failed to look up folder');
    }
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    const [fileResponse, childFolderResponse] = await Promise.all([
      client
        .from('project_files')
        .select('id')
        .eq('project_id', projectId)
        .eq('folder_id', folderId)
        .limit(1),
      client
        .from('project_folders')
        .select('id')
        .eq('project_id', projectId)
        .eq('parent_folder_id', folderId)
        .limit(1),
    ]);
    if (fileResponse.error || childFolderResponse.error) {
      throw new InternalServerErrorException('Failed to check folder contents');
    }
    if (fileResponse.data?.length || childFolderResponse.data?.length) {
      throw new BadRequestException('Folder must be empty before deletion');
    }

    const folderRow = folder as FolderStorageRow;
    await this.googleDriveService.deleteFile(
      folderRow.google_drive_metadata.id,
    );
    const { error } = await client
      .from('project_folders')
      .delete()
      .eq('project_id', projectId)
      .eq('id', folderId);
    if (error) {
      throw new InternalServerErrorException(
        'Failed to delete folder metadata',
      );
    }
    return { id: folderId };
  }

  async uploadFile(
    projectId: string,
    file: StorageUpload,
    folderId: string | null,
  ) {
    await this.assertProjectExists(projectId);
    if (!file?.buffer) {
      throw new BadRequestException('A file is required');
    }
    const name = file.originalname.split(/[\\/]/).pop()?.trim().slice(0, 255);
    if (!name) {
      throw new BadRequestException('A valid filename is required');
    }

    const parentId = await this.getDriveParentId(projectId, folderId);
    const mimeType = file.mimetype || 'application/octet-stream';
    const driveFile = await this.googleDriveService.uploadFile(
      name,
      mimeType,
      file.buffer,
      parentId,
    );
    const { data, error } = await this.supabaseService
      .getClient()
      .from('project_files')
      .insert({
        project_id: projectId,
        folder_id: folderId ? Number(folderId) : null,
        name,
        size_bytes: file.size,
        mime_type: mimeType,
        google_drive_metadata: driveFile,
      })
      .select('id,name,size_bytes,mime_type,folder_id,modified_at')
      .single();

    if (error || !data) {
      await this.googleDriveService.deleteFile(driveFile.id);
      throw new InternalServerErrorException(
        'Failed to save uploaded file metadata',
      );
    }

    const storedFile = data as Omit<FileRow, 'google_drive_metadata'>;
    return {
      id: String(storedFile.id),
      name: storedFile.name,
      sizeBytes: Number(storedFile.size_bytes),
      mimeType: storedFile.mime_type ?? 'application/octet-stream',
      parentId:
        storedFile.folder_id === null ? null : String(storedFile.folder_id),
      modifiedAt: storedFile.modified_at,
    };
  }

  async moveFile(projectId: string, fileId: string, dto: MoveFileDto) {
    const row = await this.getFileRow(projectId, fileId);
    const folderId = dto.folderId ?? null;
    const parentId = await this.getDriveParentId(projectId, folderId);
    const targetFolderId = folderId ? Number(folderId) : null;
    if (row.folder_id === targetFolderId) {
      return { id: fileId, folderId };
    }
    await this.googleDriveService.moveFile(
      row.google_drive_metadata.id,
      parentId,
    );

    const { error } = await this.supabaseService
      .getClient()
      .from('project_files')
      .update({
        folder_id: targetFolderId,
        modified_at: new Date().toISOString(),
      })
      .eq('id', fileId)
      .eq('project_id', projectId);
    if (error) {
      throw new InternalServerErrorException('Failed to update file location');
    }
    return { id: fileId, folderId };
  }

  async deleteFile(projectId: string, fileId: string) {
    const row = await this.getFileRow(projectId, fileId);
    await this.googleDriveService.deleteFile(row.google_drive_metadata.id);
    const { error } = await this.supabaseService
      .getClient()
      .from('project_files')
      .delete()
      .eq('id', fileId)
      .eq('project_id', projectId);
    if (error) {
      throw new InternalServerErrorException('Failed to delete file metadata');
    }
    return { id: fileId };
  }

  async getDownload(projectId: string, fileId: string) {
    const row = await this.getFileRow(projectId, fileId);
    return {
      name: row.name,
      mimeType: row.mime_type ?? 'application/octet-stream',
      stream: await this.googleDriveService.downloadFile(
        row.google_drive_metadata.id,
      ),
    };
  }

  private async getFileRow(
    projectId: string,
    fileId: string,
  ): Promise<FileRow> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('project_files')
      .select(
        'id,name,size_bytes,mime_type,folder_id,modified_at,google_drive_metadata',
      )
      .eq('project_id', projectId)
      .eq('id', fileId)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException('Failed to look up file');
    }
    if (!data) {
      throw new NotFoundException('File not found');
    }
    return data as FileRow;
  }

  private async getDriveParentId(
    projectId: string,
    folderId: string | null,
  ): Promise<string> {
    if (!folderId) {
      return this.getProjectDriveFolderId(projectId);
    }
    if (!/^\d+$/.test(folderId)) {
      throw new BadRequestException('Folder ID is invalid');
    }
    const { data, error } = await this.supabaseService
      .getClient()
      .from('project_folders')
      .select('google_drive_metadata')
      .eq('project_id', projectId)
      .eq('id', folderId)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException('Failed to look up folder');
    }
    if (!data) {
      throw new NotFoundException('Folder not found');
    }
    const metadata = data.google_drive_metadata as GoogleDriveFile | null;
    if (!metadata?.id) {
      throw new InternalServerErrorException(
        'Folder is missing Google Drive metadata',
      );
    }
    return metadata.id;
  }

  private async getProjectDriveFolderId(projectId: string): Promise<string> {
    const client = this.supabaseService.getClient();
    const { data: existingRoot, error: rootLookupError } = await client
      .from('project_drive_roots')
      .select('google_drive_metadata')
      .eq('project_id', projectId)
      .maybeSingle();
    if (rootLookupError) {
      throw new InternalServerErrorException(
        'Failed to look up project Drive folder',
      );
    }
    if (existingRoot) {
      const metadata = existingRoot.google_drive_metadata as GoogleDriveFile;
      if (!metadata?.id) {
        throw new InternalServerErrorException(
          'Project is missing Google Drive metadata',
        );
      }
      return metadata.id;
    }

    const { data: project, error: projectLookupError } = await client
      .from('projects')
      .select('name')
      .eq('id', projectId)
      .maybeSingle();
    if (projectLookupError || !project) {
      throw new NotFoundException('Project not found');
    }

    const projectFolder = await this.googleDriveService.createFolder(
      project.name,
      this.googleDriveService.getRootFolderId(),
    );
    const { error: insertError } = await client
      .from('project_drive_roots')
      .insert({
        project_id: projectId,
        google_drive_metadata: projectFolder,
      });
    if (!insertError) {
      return projectFolder.id;
    }

    await this.googleDriveService.deleteFile(projectFolder.id);
    const { data: concurrentRoot, error: concurrentLookupError } = await client
      .from('project_drive_roots')
      .select('google_drive_metadata')
      .eq('project_id', projectId)
      .maybeSingle();
    if (concurrentLookupError || !concurrentRoot) {
      throw new InternalServerErrorException(
        'Failed to save project Drive folder',
      );
    }
    const metadata = concurrentRoot.google_drive_metadata as GoogleDriveFile;
    if (!metadata?.id) {
      throw new InternalServerErrorException(
        'Project is missing Google Drive metadata',
      );
    }
    return metadata.id;
  }

  private async assertProjectExists(projectId: string): Promise<void> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .maybeSingle();
    if (error) {
      throw new InternalServerErrorException('Failed to look up project');
    }
    if (!data) {
      throw new NotFoundException('Project not found');
    }
  }
}
