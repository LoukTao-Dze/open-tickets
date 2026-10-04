import { TestBed } from '@angular/core/testing';
import { Observable, of, Subject, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { FileStorageApiService, StorageItems } from '../../services/file-storage-api.service';
import { ProjectApiService } from '../../services/project.service';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { FileStorageComponent } from './file-storage.component';

const PROJECTS = [
  { id: 'alpha', project_name: 'Alpha' },
  { id: 'beta', project_name: 'Beta' },
];
const FOLDER_NAME = 'Documents';
const FILE_NAME = 'notes.txt';
const FILE_CONTENT = 'Project notes';
const FILE_MIME_TYPE = 'text/plain';

describe('FileStorageComponent project selection', () => {
  function createFixture(
    getProjects: () => Observable<typeof PROJECTS> = () => of(PROJECTS),
    getItems: () => Observable<StorageItems> = () => of({ folders: [], files: [] }),
  ) {
    const storageApi = {
      getItems: vi.fn(getItems),
      createFolder: vi.fn((_projectId: string, name: string, parentId: string | null) =>
        of({ id: 'folder-1', name, parentId, modifiedAt: '2026-10-03T00:00:00.000Z' }),
      ),
      uploadFile: vi.fn((_projectId: string, file: File, parentId: string | null) =>
        of({
          id: 'file-1',
          name: file.name,
          sizeBytes: file.size,
          mimeType: file.type,
          parentId,
          modifiedAt: '2026-10-03T00:00:00.000Z',
        }),
      ),
      moveFile: vi.fn(() => of({ id: 'file-1', folderId: null })),
      deleteFile: vi.fn(() => of({ id: 'file-1' })),
      downloadFile: vi.fn(() => of(new Blob())),
      deleteFolder: vi.fn((_projectId: string, folderId: string) => of({ id: folderId })),
    };
    TestBed.configureTestingModule({
      imports: [FileStorageComponent],
      providers: [
        { provide: ProjectApiService, useValue: { getProjects } },
        { provide: FileStorageApiService, useValue: storageApi },
        { provide: ConfirmDialogService, useValue: { confirm: vi.fn(() => of(true)) } },
      ],
    });
    const fixture = TestBed.createComponent(FileStorageComponent);
    fixture.detectChanges();
    return { fixture, storageApi };
  }

  it('keeps the backdrop visible until projects and files finish loading', () => {
    const projects = new Subject<typeof PROJECTS>();
    const items = new Subject<StorageItems>();
    const { fixture } = createFixture(
      () => projects,
      () => items,
    );
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('app-loading-page [role="status"]')).not.toBeNull();
    expect(element.querySelector('.storage-page')?.hasAttribute('inert')).toBe(true);

    projects.next(PROJECTS);
    fixture.detectChanges();
    expect(element.querySelector('app-loading-page')).not.toBeNull();

    items.next({ folders: [], files: [] });
    fixture.detectChanges();
    expect(element.querySelector('app-loading-page')).toBeNull();
    expect(element.querySelector('.storage-page')?.hasAttribute('inert')).toBe(false);
    expect(element.querySelector('.storage-page')?.getAttribute('aria-busy')).toBe('false');

    const projectSelect = element.querySelector<HTMLSelectElement>('[aria-label="Select project"]');
    expect(projectSelect).not.toBeNull();
    projectSelect!.value = PROJECTS[1].id;
    projectSelect!.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(element.querySelector('app-loading-page')).not.toBeNull();
    items.next({ folders: [], files: [] });
    fixture.detectChanges();
    expect(element.querySelector('app-loading-page')).toBeNull();
  });

  it('removes the backdrop when files fail to load', () => {
    const items = new Subject<StorageItems>();
    const { fixture } = createFixture(
      () => of(PROJECTS),
      () => items,
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      items.error(new Error('Unavailable'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('app-loading-page')).toBeNull();
      expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('loads project options and selects the first project', () => {
    const { fixture, storageApi } = createFixture();
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;
    const select = element.querySelector<HTMLSelectElement>('[aria-label="Select project"]');

    expect(component.selectedProjectId).toBe(PROJECTS[0].id);
    expect(component.selectedProjectName).toBe(PROJECTS[0].project_name);
    expect(select?.options.length).toBe(PROJECTS.length);
    expect(select?.value).toBe(PROJECTS[0].id);
    expect(select?.disabled).toBe(false);
    expect(storageApi.getItems).toHaveBeenCalledWith(PROJECTS[0].id);
  });

  it('creates folders and uploads selected files through the API', () => {
    const { fixture, storageApi } = createFixture();
    const component = fixture.componentInstance;
    component.newFolderName = FOLDER_NAME;
    component.createFolder();
    component.openFolder(component.folders[0]);
    const file = new File([FILE_CONTENT], FILE_NAME, { type: FILE_MIME_TYPE });
    const input = { files: [file], value: FILE_NAME };
    component.addFiles({ target: input } as unknown as Event);
    expect(storageApi.createFolder).toHaveBeenCalledWith(PROJECTS[0].id, FOLDER_NAME, null);
    expect(storageApi.uploadFile).toHaveBeenCalledWith(PROJECTS[0].id, file, 'folder-1');
    expect(component.folders[0].name).toBe(FOLDER_NAME);
    expect(component.files[0].name).toBe(FILE_NAME);
    expect(component.files[0].parentId).toBe('folder-1');
    expect(input.value).toBe('');
  });

  it('opens the file preview popup on double-click', () => {
    const { fixture, storageApi } = createFixture();
    const component = fixture.componentInstance;
    component.files = [
      {
        id: 'file-1',
        name: 'archive.zip',
        sizeBytes: 12,
        mimeType: 'application/zip',
        parentId: null,
        modifiedAt: '2026-10-03T00:00:00.000Z',
      },
    ];
    fixture.detectChanges();

    fixture.nativeElement
      .querySelector('.file-item')
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    fixture.detectChanges();

    expect(storageApi.downloadFile).toHaveBeenCalledWith(PROJECTS[0].id, 'file-1');
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      'Preview is not available for this file type.',
    );
  });

  it('confirms folder deletion and removes the folder from the current project', () => {
    const { fixture, storageApi } = createFixture();
    const component = fixture.componentInstance;
    component.newFolderName = FOLDER_NAME;
    component.createFolder();
    const folder = component.folders[0];

    component.deleteFolder(folder);

    expect(storageApi.deleteFolder).toHaveBeenCalledWith(PROJECTS[0].id, folder.id);
    expect(component.folders).toEqual([]);
  });

  it('disables the selector when projects are empty or fail to load', () => {
    const { fixture } = createFixture(() => of([]));
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector<HTMLSelectElement>('select')?.disabled).toBe(true);
    expect(fixture.componentInstance.selectedProjectId).toBe('');
    expect(element.querySelector('app-loading-page')).toBeNull();
    fixture.destroy();
    TestBed.resetTestingModule();

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const failedFixture = createFixture(() => throwError(() => new Error('Unavailable'))).fixture;
      expect(failedFixture.componentInstance.projectLoadFailed).toBe(true);
      expect(failedFixture.componentInstance.isLoadingProjects).toBe(false);
      expect(failedFixture.nativeElement.querySelector('app-loading-page')).toBeNull();
      expect(consoleError).toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });
});
