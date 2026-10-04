import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ChangeDetectorRef, Component, DestroyRef, inject, OnDestroy, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { EMPTY, forkJoin, Subject } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { KanbanProject } from '../../interface/kanban.interface';
import {
  FileStorageApiService,
  StorageFile,
  StorageFolder,
  StorageItems,
} from '../../services/file-storage-api.service';
import { ProjectApiService } from '../../services/project.service';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { LoadingPageComponent } from '../../shared/loading-page/loading-page.component';
import { FilePreviewDialogComponent } from './file-preview-dialog/file-preview-dialog.component';
import type { StorageFileKind } from './file-preview-dialog/file-preview-dialog.component';

type SortOption = 'name' | 'modified' | 'size';
const DOWNLOAD_URL_REVOKE_DELAY_MS = 1000;

@Component({
  selector: 'app-file-storage',
  standalone: true,
  imports: [CommonModule, FormsModule, FilePreviewDialogComponent, LoadingPageComponent],
  templateUrl: './file-storage.component.html',
  styleUrl: './file-storage.component.scss',
})
export class FileStorageComponent implements OnInit, OnDestroy {
  private readonly projectApi = inject(ProjectApiService);
  private readonly fileStorageApi = inject(FileStorageApiService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly changeDetector = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly selectedProjectChanges = new Subject<string>();
  private previewGeneration = 0;
  projects: KanbanProject[] = [];
  selectedProjectId = '';
  isLoadingProjects = false;
  isLoadingItems = false;
  isUploading = false;
  projectLoadFailed = false;
  storageError = '';
  folders: StorageFolder[] = [];
  files: StorageFile[] = [];
  filesSelected = new Set<StorageFile>();
  searchTerm = '';
  newFolderName = '';
  activeFolderId: string | null = null;
  selectedFileIds = new Set<string>();
  sortBy: SortOption = 'name';
  viewMode: 'grid' | 'list' = 'grid';
  isNewMenuOpen = false;
  isFolderDialogOpen = false;
  isMoveDialogOpen = false;
  moveTargetFolderId: string | null = null;
  previewFile: StorageFile | null = null;
  previewUrl: SafeResourceUrl | null = null;
  previewObjectUrl: string | null = null;
  previewText: string | null = null;
  isPreviewLoading = false;
  previewError = '';

  ngOnDestroy(): void {
    this.closePreview();
  }

  ngOnInit(): void {
    this.selectedProjectChanges
      .pipe(
        switchMap((projectId) =>
          this.fileStorageApi.getItems(projectId).pipe(
            catchError((error: unknown) => {
              console.error('Failed to load project files', error);
              this.storageError = 'Unable to load files. Please try again.';
              this.isLoadingItems = false;
              this.changeDetector.markForCheck();
              return EMPTY;
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => this.applyItems(items));

    this.onGetProject();
  }

  get selectedProjectName(): string {
    return (
      this.projects.find((project) => project.id === this.selectedProjectId)?.project_name ?? ''
    );
  }

  onGetProject() {
    this.isLoadingProjects = true;
    this.projectApi
      .getProjects()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (projects) => {
          this.projects = projects;
          if (projects.length) {
            this.onProjectChange(projects[0].id);
          }
          this.isLoadingProjects = false;
          this.changeDetector.markForCheck();
        },
        error: () => {
          console.error('Failed to load file storage projects');
          this.projectLoadFailed = true;
          this.isLoadingProjects = false;
          this.changeDetector.markForCheck();
        },
      });
  }

  onProjectChange(projectId: string): void {
    if (!this.projects.some((project) => project.id === projectId)) {
      return;
    }
    this.selectedProjectId = projectId;
    this.folders = [];
    this.files = [];
    this.storageError = '';
    this.isLoadingItems = true;
    this.activeFolderId = null;
    this.searchTerm = '';
    this.newFolderName = '';
    this.moveTargetFolderId = null;
    this.isNewMenuOpen = false;
    this.isFolderDialogOpen = false;
    this.isMoveDialogOpen = false;
    this.closePreview();
    this.clearSelection();
    this.selectedProjectChanges.next(projectId);
  }

  get currentFolder(): StorageFolder | undefined {
    return this.folders.find((folder) => folder.id === this.activeFolderId);
  }

  get breadcrumbs(): StorageFolder[] {
    const chain: StorageFolder[] = [];
    let folder = this.currentFolder;

    while (folder) {
      chain.unshift(folder);
      folder = this.folders.find((candidate) => candidate.id === folder?.parentId);
    }

    return chain;
  }

  get visibleFolders(): StorageFolder[] {
    const query = this.searchTerm.trim().toLowerCase();
    return this.folders
      .filter((folder) => folder.parentId === this.activeFolderId)
      .filter((folder) => folder.name.toLowerCase().includes(query))
      .sort((first, second) => this.compareByName(first.name, second.name));
  }

  get visibleFiles(): StorageFile[] {
    const query = this.searchTerm.trim().toLowerCase();
    const matchingFiles = this.files
      .filter((file) => file.parentId === this.activeFolderId)
      .filter((file) => file.name.toLowerCase().includes(query));

    return matchingFiles.sort((first, second) => {
      if (this.sortBy === 'size') {
        return second.sizeBytes - first.sizeBytes;
      }
      if (this.sortBy === 'modified') {
        return second.modifiedAt.localeCompare(first.modifiedAt);
      }
      return this.compareByName(first.name, second.name);
    });
  }

  get totalObjectCount(): number {
    return this.folders.length + this.files.length;
  }

  get canDownloadSelection(): boolean {
    return (
      this.selectedFileIds.size > 0 &&
      this.files.filter((file) => this.selectedFileIds.has(file.id)).length ===
        this.selectedFileIds.size
    );
  }

  get movableFolders(): StorageFolder[] {
    return this.folders.filter((folder) => folder.id !== this.activeFolderId);
  }

  openFolder(folder: StorageFolder): void {
    this.activeFolderId = folder.id;
    this.clearSelection();
  }

  navigateTo(folderId: string | null): void {
    this.activeFolderId = folderId;
    this.clearSelection();
  }

  toggleFileSelection(file: StorageFile): void {
    const nextSelection = new Set(this.selectedFileIds);
    const fileSelected = new Set(this.filesSelected);
    if (nextSelection.has(file.id)) {
      nextSelection.delete(file.id);
      fileSelected.delete(file);
    } else {
      nextSelection.add(file.id);
      fileSelected.add(file);
    }
    this.selectedFileIds = nextSelection;
    this.filesSelected = fileSelected;
  }

  openFolderDialog(): void {
    this.isNewMenuOpen = false;
    this.newFolderName = '';
    this.isFolderDialogOpen = true;
  }

  createFolder(): void {
    this.isLoadingProjects = true;

    const name = this.newFolderName.trim();
    if (!name) {
      return;
    }
    const projectId = this.selectedProjectId;
    const parentFolderId = this.activeFolderId;

    this.fileStorageApi
      .createFolder(projectId, name, parentFolderId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (folder) => {
          if (this.selectedProjectId !== projectId) {
            return;
          }
          this.folders = [...this.folders, folder];
          this.isFolderDialogOpen = false;
          this.newFolderName = '';
          this.isLoadingProjects = false;
          this.changeDetector.markForCheck();
        },
        error: (error: unknown) => this.handleStorageMutationError('create folder', error),
      });
  }

  deleteFolder(folder: StorageFolder): void {
    const projectId = this.selectedProjectId;
    this.confirmDialog
      .confirm({
        title: 'Delete folder',
        message: `Delete "${folder.name}"? Only empty folders can be deleted.`,
        cancelText: 'Cancel',
        confirmText: 'Delete',
        config: {
          disableClose: false,
          confirmColor: 'error',
          cancelColor: 'neutral',
        },
      })
      .pipe(
        tap(() => {
          queueMicrotask(() => {
            this.isLoadingProjects = true;
            this.changeDetector.markForCheck();
          });
        }),
        switchMap((confirmed) => {
          if (!confirmed) {
            return EMPTY;
          }
          return this.fileStorageApi.deleteFolder(projectId, folder.id);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          if (this.selectedProjectId === projectId) {
            this.folders = this.folders.filter((candidate) => candidate.id !== folder.id);
          }
          this.isLoadingProjects = false;
          this.changeDetector.markForCheck();
        },
        error: (error: unknown) => this.handleStorageMutationError('delete folder', error),
      });
  }

  addFiles(event: Event): void {
    this.isLoadingProjects = true;
    const input = event.target as HTMLInputElement;
    const selectedFiles = Array.from(input.files ?? []);
    if (selectedFiles.length) {
      const projectId = this.selectedProjectId;
      const folderId = this.activeFolderId;
      this.isUploading = true;
      forkJoin(
        selectedFiles.map((file) => this.fileStorageApi.uploadFile(projectId, file, folderId)),
      )
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (uploadedFiles) => {
            this.isUploading = false;
            if (this.selectedProjectId === projectId) {
              this.files = [...uploadedFiles, ...this.files];
            }
            this.isLoadingProjects = false;
            this.changeDetector.markForCheck();
          },
          error: (error: unknown) => {
            this.isUploading = false;
            this.handleStorageMutationError('upload files', error);
            this.reloadItems();
          },
        });
    }
    input.value = '';
    this.isNewMenuOpen = false;
  }

  deleteSelected(): void {
    this.isLoadingProjects = true;
    const isMultipleFilesSelected = this.filesSelected.size > 1;
    const fileDescription = isMultipleFilesSelected
      ? 'All files selected'
      : `${[...this.filesSelected][0]?.name}`;
    this.confirmDialog
      .confirm({
        title: 'Delete files',
        message: `Delete "${fileDescription}"?`,
        cancelText: 'Cancel',
        confirmText: 'Delete',
        config: {
          disableClose: false,
          confirmColor: 'error',
          cancelColor: 'neutral',
        },
      })
      .pipe(
        switchMap((confirmed) => (confirmed ? this.deleteFiles() : EMPTY)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.files = this.files.filter((file) => !this.selectedFileIds.has(file.id));
          this.clearSelection();
          this.isLoadingProjects = false;
          this.changeDetector.markForCheck();
        },
        error: (error: unknown) => {
          this.handleStorageMutationError('delete files', error);
          this.reloadItems();
        },
      });
  }

  deleteFiles() {
    const fileIds = [...this.selectedFileIds];
    return forkJoin(
      fileIds.map((fileId) => this.fileStorageApi.deleteFile(this.selectedProjectId, fileId)),
    ).pipe(takeUntilDestroyed(this.destroyRef));
  }

  openMoveDialog(): void {
    this.moveTargetFolderId = this.movableFolders[0]?.id ?? null;
    this.isMoveDialogOpen = true;
  }

  moveSelectedFiles(): void {
    this.isLoadingProjects = true;
    const fileIds = [...this.selectedFileIds];
    forkJoin(
      fileIds.map((fileId) =>
        this.fileStorageApi.moveFile(this.selectedProjectId, fileId, this.moveTargetFolderId),
      ),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.files = this.files.map((file) =>
            this.selectedFileIds.has(file.id)
              ? { ...file, parentId: this.moveTargetFolderId, modifiedAt: new Date().toISOString() }
              : file,
          );
          this.isMoveDialogOpen = false;
          this.clearSelection();
          this.isLoadingProjects = false;
          this.changeDetector.markForCheck();
        },
        error: (error: unknown) => {
          this.handleStorageMutationError('move files', error);
          this.reloadItems();
        },
      });
  }

  downloadSelected(): void {
    const selectedFiles = this.files.filter((file) => this.selectedFileIds.has(file.id));
    for (const file of selectedFiles) {
      this.fileStorageApi
        .downloadFile(this.selectedProjectId, file.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (download) => this.saveDownload(download, file.name),
          error: (error: unknown) => this.handleStorageMutationError('download files', error),
        });
    }
  }

  openFile(file: StorageFile): void {
    this.closePreview();
    this.previewFile = file;
    this.isPreviewLoading = true;
    const projectId = this.selectedProjectId;
    const generation = this.previewGeneration;

    this.fileStorageApi
      .downloadFile(projectId, file.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (download) => {
          if (
            generation !== this.previewGeneration ||
            this.previewFile?.id !== file.id ||
            this.selectedProjectId !== projectId
          ) {
            return;
          }
          const kind = this.fileKind(file);
          if (kind === 'image' || kind === 'pdf') {
            this.isPreviewLoading = false;
            const objectUrl = URL.createObjectURL(download);
            this.previewObjectUrl = objectUrl;
            // The URL is generated locally from the file blob returned by the storage API.
            this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(objectUrl);
          } else if (this.isTextPreview(file)) {
            download.text().then(
              (text) => {
                if (generation === this.previewGeneration && this.previewFile?.id === file.id) {
                  this.previewText = text;
                  this.isPreviewLoading = false;
                  this.changeDetector.markForCheck();
                }
              },
              () => {
                if (generation === this.previewGeneration && this.previewFile?.id === file.id) {
                  this.isPreviewLoading = false;
                  this.previewError = 'Unable to preview this file.';
                  this.changeDetector.markForCheck();
                }
              },
            );
          } else {
            this.isPreviewLoading = false;
          }
          this.changeDetector.markForCheck();
        },
        error: (error: unknown) => {
          if (generation === this.previewGeneration && this.previewFile?.id === file.id) {
            console.error('Failed to preview file', error);
            this.isPreviewLoading = false;
            this.previewError = 'Unable to load this file. Please try again.';
            this.changeDetector.markForCheck();
          }
        },
      });
  }

  closePreview(): void {
    this.previewGeneration++;
    if (this.previewObjectUrl) {
      URL.revokeObjectURL(this.previewObjectUrl);
    }
    this.previewFile = null;
    this.previewUrl = null;
    this.previewObjectUrl = null;
    this.previewText = null;
    this.isPreviewLoading = false;
    this.previewError = '';
  }

  downloadPreview(): void {
    if (this.previewFile) {
      this.fileStorageApi
        .downloadFile(this.selectedProjectId, this.previewFile.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (download) => this.saveDownload(download, this.previewFile?.name ?? 'download'),
          error: (error: unknown) => this.handleStorageMutationError('download file', error),
        });
    }
  }

  folderFileCount(folderId: string): number {
    return this.files.filter((file) => file.parentId === folderId).length;
  }

  fileKind(file: StorageFile): StorageFileKind {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (file.mimeType === 'application/pdf' || extension === 'pdf') {
      return 'pdf';
    }
    if (file.mimeType.startsWith('image/')) {
      return 'image';
    }
    if (['sh', 'js', 'ts', 'json', 'yml', 'yaml'].includes(extension ?? '')) {
      return 'code';
    }
    if (['md', 'txt', 'doc', 'docx'].includes(extension ?? '')) {
      return 'document';
    }
    return 'other';
  }

  fileIcon(file: StorageFile): string {
    const icons: Record<StorageFileKind, string> = {
      pdf: 'picture_as_pdf',
      image: 'image',
      code: 'terminal',
      document: 'description',
      other: 'draft',
    };
    return icons[this.fileKind(file)];
  }

  formatFileSize(sizeBytes: number): string {
    if (sizeBytes < 1024) {
      return `${sizeBytes} B`;
    }
    const units = ['KB', 'MB', 'GB'];
    let size = sizeBytes / 1024;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  formatModifiedAt(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  closeFolderDialog(): void {
    this.isFolderDialogOpen = false;
  }

  private clearSelection(): void {
    this.selectedFileIds = new Set<string>();
  }

  private applyItems(items: StorageItems): void {
    this.folders = items.folders;
    this.files = items.files;
    this.isLoadingItems = false;
    this.storageError = '';
    this.changeDetector.markForCheck();
  }

  private reloadItems(): void {
    if (this.selectedProjectId) {
      this.isLoadingItems = true;
      this.selectedProjectChanges.next(this.selectedProjectId);
    }
  }

  private handleStorageMutationError(operation: string, error: unknown): void {
    console.error(`Failed to ${operation}`, error);
    this.storageError = `Unable to ${operation}. Please try again.`;
    this.isLoadingProjects = false;
    this.changeDetector.markForCheck();
  }

  private saveDownload(download: Blob, filename: string): void {
    const url = URL.createObjectURL(download);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_REVOKE_DELAY_MS);
  }

  private isTextPreview(file: StorageFile): boolean {
    const extension = file.name.split('.').pop()?.toLowerCase();
    return (
      file.mimeType.startsWith('text/') ||
      ['css', 'csv', 'html', 'js', 'json', 'md', 'ts', 'xml', 'yml', 'yaml'].includes(
        extension ?? '',
      )
    );
  }

  private compareByName(first: string, second: string): number {
    return first.localeCompare(second, undefined, { sensitivity: 'base' });
  }
}
