import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, drive_v3 } from 'googleapis';
import { Readable } from 'node:stream';

const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';

const GOOGLE_DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

const GOOGLE_DRIVE_NOT_FOUND_STATUS = 404;

const GOOGLE_DRIVE_PARENT_UNAVAILABLE_MESSAGE =
  'Google Drive parent folder is missing or inaccessible. Verify the folder ID and Google account permissions.';

const DRIVE_FILE_FIELDS =
  'id,name,mimeType,size,modifiedTime,parents,webViewLink';

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  parents?: string[];
  webViewLink?: string;
}

@Injectable()
export class GoogleDriveService {
  private driveClient?: drive_v3.Drive;

  constructor(private readonly configService: ConfigService) {}

  getRootFolderId(): string {
    const folderId = this.configService.get<string>(
      'GOOGLE_DRIVE_ROOT_FOLDER_ID',
    );

    if (!folderId) {
      throw new ServiceUnavailableException(
        'Google Drive storage is not configured',
      );
    }

    const folderUrl = folderId.match(
      /^https:\/\/drive\.google\.com\/drive\/folders\/([^/?#]+)/,
    );

    return folderUrl?.[1] ?? folderId;
  }

  async createFolder(name: string, parentId: string): Promise<GoogleDriveFile> {
    try {
      const response = await this.getDriveClient().files.create({
        requestBody: {
          name,
          mimeType: GOOGLE_DRIVE_FOLDER_MIME_TYPE,
          parents: [parentId],
        },
        fields: DRIVE_FILE_FIELDS,
      });

      return this.requireFile(response.data);
    } catch (error: unknown) {
      this.rethrowParentFolderError(error);
    }
  }

  async uploadFile(
    name: string,
    mimeType: string,
    content: Buffer,
    parentId: string,
  ): Promise<GoogleDriveFile> {
    try {
      const response = await this.getDriveClient().files.create({
        requestBody: {
          name,
          mimeType,
          parents: [parentId],
        },
        media: {
          mimeType,
          body: Readable.from(content),
        },
        fields: DRIVE_FILE_FIELDS,
      });

      return this.requireFile(response.data);
    } catch (error: unknown) {
      this.rethrowParentFolderError(error);
    }
  }

  async moveFile(fileId: string, parentId: string): Promise<void> {
    const drive = this.getDriveClient();

    const response = await drive.files.get({
      fileId,
      fields: 'parents',
    });

    await drive.files.update({
      fileId,
      addParents: parentId,
      removeParents: (response.data.parents ?? []).join(','),
      fields: 'id',
    });
  }

  async deleteFile(fileId: string): Promise<void> {
    await this.getDriveClient().files.delete({
      fileId,
    });
  }

  async downloadFile(fileId: string): Promise<Readable> {
    const response = await this.getDriveClient().files.get(
      {
        fileId,
        alt: 'media',
      },
      {
        responseType: 'stream',
      },
    );

    return response.data as Readable;
  }

  private getDriveClient(): drive_v3.Drive {
    if (this.driveClient) {
      return this.driveClient;
    }

    const clientId = this.configService.get<string>('GOOGLE_DRIVE_CLIENT_ID');

    const clientSecret = this.configService.get<string>(
      'GOOGLE_DRIVE_CLIENT_SECRET',
    );

    const refreshToken = this.configService.get<string>(
      'GOOGLE_DRIVE_REFRESH_TOKEN',
    );

    if (!clientId || !clientSecret || !refreshToken) {
      throw new ServiceUnavailableException(
        'Google Drive OAuth is not configured',
      );
    }

    try {
      const auth = new google.auth.OAuth2(
        clientId,
        clientSecret,
        'http://localhost',
      );

      auth.setCredentials({
        refresh_token: refreshToken,
      });

      this.driveClient = google.drive({
        version: 'v3',
        auth,
      });

      return this.driveClient;
    } catch {
      throw new InternalServerErrorException(
        'Google Drive OAuth credentials are invalid',
      );
    }
  }

  private rethrowParentFolderError(error: unknown): never {
    if (
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      typeof error.response === 'object' &&
      error.response !== null &&
      'status' in error.response &&
      error.response.status === GOOGLE_DRIVE_NOT_FOUND_STATUS
    ) {
      throw new ServiceUnavailableException(
        GOOGLE_DRIVE_PARENT_UNAVAILABLE_MESSAGE,
      );
    }

    throw error;
  }

  private requireFile(file: drive_v3.Schema$File): GoogleDriveFile {
    if (!file.id || !file.name || !file.mimeType) {
      throw new InternalServerErrorException(
        'Google Drive returned incomplete file metadata',
      );
    }

    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size ?? undefined,
      modifiedTime: file.modifiedTime ?? undefined,
      parents: file.parents ?? undefined,
      webViewLink: file.webViewLink ?? undefined,
    };
  }
}
