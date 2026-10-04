import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, drive_v3 } from 'googleapis';
import { GoogleDriveService } from './google-drive.service';

describe('GoogleDriveService', () => {
  const createService = (folderId: string) =>
    new GoogleDriveService({
      get: jest.fn((key: string) =>
        key === 'GOOGLE_DRIVE_ROOT_FOLDER_ID'
          ? folderId
          : JSON.stringify({
              client_email: 'test@example.invalid',
              private_key: 'test-placeholder',
            }),
      ),
    } as unknown as ConfigService);

  afterEach(() => jest.restoreAllMocks());

  const mockCreate = () => {
    const create = jest.fn<() => Promise<{ data: drive_v3.Schema$File }>>();
    jest.spyOn(google, 'drive').mockReturnValue({
      files: { create },
    } as unknown as drive_v3.Drive);
    return create;
  };

  it('reports inaccessible parent folders as a storage configuration error', async () => {
    const create = mockCreate();
    create.mockRejectedValue({ response: { status: 404 } });
    const service = createService('root-folder');

    await expect(
      service.createFolder('Project', 'root-folder'),
    ).rejects.toThrow(ServiceUnavailableException);
    await expect(
      service.createFolder('Project', 'root-folder'),
    ).rejects.toThrow('grant the service account Editor access');
  });

  it('reports inaccessible upload parents without exposing the API error', async () => {
    const create = mockCreate();
    create.mockRejectedValue({ response: { status: 404 } });
    const service = createService('root-folder');

    await expect(
      service.uploadFile(
        'file.txt',
        'text/plain',
        Buffer.alloc(0),
        'root-folder',
      ),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it.each([null, new Error('Network failure'), { response: { status: 403 } }])(
    'preserves unrelated API errors: %p',
    async (failure) => {
      const create = mockCreate();
      create.mockRejectedValue(failure);

      await expect(
        createService('root-folder').createFolder('Project', 'root-folder'),
      ).rejects.toBe(failure);
    },
  );

  it('creates folders under the supplied parent with Shared Drive support', async () => {
    const create = mockCreate();
    const folder = {
      id: 'project-folder',
      name: 'Project',
      mimeType: 'application/vnd.google-apps.folder',
    };
    create.mockResolvedValue({ data: folder });

    await expect(
      createService('root-folder').createFolder('Project', 'root-folder'),
    ).resolves.toMatchObject(folder);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: {
          name: folder.name,
          mimeType: folder.mimeType,
          parents: ['root-folder'],
        },
        supportsAllDrives: false,
      }),
    );
  });

  it('extracts the ID from a Google Drive folder URL', () => {
    const service = createService(
      'https://drive.google.com/drive/folders/1FPJmGcaBKNlrm3zXjYH53t78lHPSs-IO?hl=th',
    );

    expect(service.getRootFolderId()).toBe('1FPJmGcaBKNlrm3zXjYH53t78lHPSs-IO');
  });

  it('continues to accept a plain folder ID', () => {
    const service = createService('1FPJmGcaBKNlrm3zXjYH53t78lHPSs-IO');

    expect(service.getRootFolderId()).toBe('1FPJmGcaBKNlrm3zXjYH53t78lHPSs-IO');
  });
});
