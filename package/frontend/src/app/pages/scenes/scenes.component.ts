import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { KanbanProject } from '../../interface/kanban.interface';
import { ProjectApiService } from '../../services/project.service';
import {
  Scene,
  SceneService,
  SceneStatus,
  SuiteInput,
  TestSuite,
} from '../../services/scene.service';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import {
  SceneFormModalComponent,
  SceneFormModalData,
} from './scene-form-modal/scene-form-modal.component';
import {
  SuiteFormModalComponent,
  SuiteFormModalData,
} from './suite-form-modal/suite-form-modal.component';

@Component({
  selector: 'app-scenes',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './scenes.component.html',
  styleUrl: './scenes.component.scss',
})
export class ScenesComponent implements OnInit {
  readonly statuses = [
    { value: SceneStatus.NotStart, label: 'Not started' },
    { value: SceneStatus.InProgress, label: 'In progress' },
    { value: SceneStatus.Pass, label: 'Pass' },
  ];
  projects: KanbanProject[] = [];
  projectId = '';
  scenes: Scene[] = [];
  suites: TestSuite[] = [];
  suiteId: string | null = null;
  suiteSaving = false;
  deletingSceneId: string | null = null;
  canEdit = false;
  loadingProjects = true;
  loadingScenes = false;
  error = '';
  statusSavingId: string | null = null;
  pendingStatus: Record<string, SceneStatus> = {};
  private loadSequence = 0;

  constructor(
    private readonly projectsApi: ProjectApiService,
    private readonly scenesApi: SceneService,
    private readonly cdr: ChangeDetectorRef,
    private readonly dialog: MatDialog,
    private readonly confirmDialog: ConfirmDialogService,
  ) {}

  ngOnInit(): void {
    this.loadProjects();
  }

  get contextLocked(): boolean {
    return this.suiteSaving || this.deletingSceneId !== null || this.statusSavingId !== null;
  }

  get visibleScenes(): Scene[] {
    return this.scenes.filter((scene: Scene) => (scene.suiteId ?? '') === this.suiteId);
  }

  get unassignedCount(): number {
    return this.scenes.filter((scene: Scene) => scene.suiteId === null).length;
  }

  get selectedSuite(): TestSuite | undefined {
    return this.suites.find((suite: TestSuite) => suite.id === this.suiteId);
  }

  openSceneModal(scene?: Scene): void {
    if (this.contextLocked || !this.canEdit) return;
    this.error = '';
    const projectId = this.projectId;
    this.dialog
      .open<SceneFormModalComponent, SceneFormModalData, Scene>(SceneFormModalComponent, {
        panelClass: 'app-dialog-panel',
        width: '800px',
        maxWidth: '94vw',
        maxHeight: '90vh',
        autoFocus: 'first-tabbable',
        ariaLabelledBy: 'scene-modal-title',
        data: {
          scene,
          suites: this.suites,
          statuses: this.statuses,
          suiteId: this.suiteId ?? '',
          save: (value) =>
            scene
              ? this.scenesApi.update(projectId, scene.id, value)
              : this.scenesApi.create(projectId, value),
        },
      })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) return;
        this.scenes = this.scenes.some((item: Scene) => item.id === saved.id)
          ? this.scenes.map((item: Scene) => (item.id === saved.id ? saved : item))
          : [saved, ...this.scenes];
        if (this.suiteId === '' && !this.unassignedCount) {
          this.suiteId = saved.suiteId ?? this.suites[0]?.id ?? '';
        }
        this.cdr.markForCheck();
      });
  }

  selectSuite(suiteId: string | null): void {
    if (this.contextLocked) return;
    if (suiteId === null) {
      this.loadScenes();
      return;
    }
    this.suiteId = suiteId;
    this.pendingStatus = {};
  }

  suiteSceneCount(suiteId: string): number {
    return this.scenes.filter((scene: Scene) => scene.suiteId === suiteId).length;
  }

  suiteStatusPercent(suiteId: string, status: SceneStatus): number {
    const total = this.suiteSceneCount(suiteId);
    const matching = this.scenes.filter(
      (scene: Scene) => scene.suiteId === suiteId && scene.status === status,
    ).length;
    return total ? Math.round((matching * 100) / total) : 0;
  }

  loadProjects(): void {
    this.loadingProjects = true;
    this.error = '';
    this.projectsApi
      .getProjects()
      .pipe(
        finalize(() => {
          this.loadingProjects = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (projects) => {
          this.projects = projects;
          if (projects.length) {
            const sessionProjectId = sessionStorage.getItem('sceneProjectId');
            this.projectId = sessionProjectId ?? projects[0].id;
            this.loadScenes();
          }
        },
        error: (error: unknown) => {
          console.error('Failed to load projects for scenes', error);
          this.error = 'Could not load projects. Please try again.';
        },
      });
  }
  onChangeProject(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.projectId = target.value;
    sessionStorage.setItem('sceneProjectId', this.projectId);
  }

  loadScenes(): void {
    const projectId = this.projectId;
    if (!projectId) return;
    const sequence = ++this.loadSequence;
    this.resetScenes();
    this.scenesApi
      .list(projectId)
      .pipe(
        finalize(() => {
          if (this.loadSequence === sequence) {
            this.loadingScenes = false;
            this.cdr.markForCheck();
          }
        }),
      )
      .subscribe({
        next: (response) => {
          if (this.loadSequence === sequence) {
            this.scenes = response.scenes;
            this.suites = response.suites;
            this.canEdit = response.canEdit;
          }
        },
        error: (error: unknown) => {
          console.error('Failed to load scenes', error);
          if (this.loadSequence === sequence)
            this.error = 'Could not load scenes. Please try again.';
        },
      });
  }

  private resetScenes(): void {
    this.loadingScenes = true;
    this.canEdit = false;
    this.scenes = [];
    this.suites = [];
    this.suiteId = null;
    this.pendingStatus = {};
    this.error = '';
  }

  count(status: SceneStatus): number {
    return this.visibleScenes.filter((scene: Scene) => scene.status === status).length;
  }

  percent(status: SceneStatus): number {
    const total = this.visibleScenes.length;
    return total ? Math.round((this.count(status) * 100) / total) : 0;
  }

  openSuiteModal(suite?: TestSuite): void {
    if (this.contextLocked) return;
    this.error = '';
    const projectId = this.projectId;
    this.dialog
      .open<SuiteFormModalComponent, SuiteFormModalData, TestSuite>(SuiteFormModalComponent, {
        panelClass: 'app-dialog-panel',
        width: '520px',
        maxWidth: '90vw',
        autoFocus: 'first-tabbable',
        ariaLabelledBy: 'suite-modal-title',
        data: {
          suite,
          projectId,
          projects: this.projects,
          save: (value) => this.saveSuite(projectId, value, suite?.id),
        },
      })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) return;
        if (saved.projectId !== projectId) {
          queueMicrotask(() => {
            this.projectId = saved.projectId;
            this.loadScenes();
            this.cdr.markForCheck();
          });
          return;
        }
        this.suites = suite
          ? this.suites.map((item: TestSuite) => (item.id === saved.id ? saved : item))
          : [...this.suites, saved];
        this.suiteId = saved.id;
        this.pendingStatus = {};
        this.cdr.markForCheck();
      });
  }

  private saveSuite(projectId: string, value: SuiteInput, suiteId?: string) {
    return suiteId
      ? this.scenesApi.updateSuite(projectId, suiteId, value)
      : this.scenesApi.createSuite(projectId, value);
  }

  deleteSuite(): void {
    if (!this.selectedSuite || this.contextLocked) return;
    if (this.visibleScenes.length) {
      this.error = 'Move or delete all scenes before deleting this suite.';
      return;
    }
    const suite = this.selectedSuite;
    const suiteId = suite.id;
    this.confirmDialog
      .confirm({
        title: 'Delete test suite?',
        message: `Really delete ${suite.name}? This cannot be undone.`,
        confirmText: 'Delete',
        config: { confirmColor: 'error' },
      })
      .subscribe((confirmed) => {
        if (confirmed) this.performSuiteDelete(suiteId);
      });
  }

  private performSuiteDelete(suiteId: string): void {
    this.suiteSaving = true;
    this.error = '';
    this.scenesApi
      .deleteSuite(this.projectId, suiteId)
      .pipe(
        finalize(() => {
          this.suiteSaving = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.suites = this.suites.filter((suite: TestSuite) => suite.id !== suiteId);
          this.suiteId = null;
          this.pendingStatus = {};
        },
        error: (error: unknown) => {
          console.error('Failed to delete test suite', error);
          this.error =
            error instanceof HttpErrorResponse && error.status === 409
              ? 'This suite contains scenes. Reload, then move or delete them before deleting it.'
              : 'Could not delete this suite. Please try again.';
        },
      });
  }

  confirmSceneDelete(scene: Scene): void {
    if (this.contextLocked) return;
    this.confirmDialog
      .confirm({
        title: 'Delete scene?',
        message: `Delete ${scene.sceneNo}? This scene will be permanently deleted.`,
        confirmText: 'Delete scene',
        config: { confirmColor: 'error' },
      })
      .subscribe((confirmed) => {
        if (confirmed) this.deleteScene(scene);
      });
  }

  deleteScene(scene: Scene): void {
    if (this.contextLocked) return;
    this.deletingSceneId = scene.id;
    this.error = '';
    this.scenesApi
      .delete(this.projectId, scene.id)
      .pipe(
        finalize(() => {
          this.deletingSceneId = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: () => {
          this.scenes = this.scenes.filter((item: Scene) => item.id !== scene.id);
          delete this.pendingStatus[scene.id];
          if (this.suiteId === '' && !this.unassignedCount) this.suiteId = null;
        },
        error: (error: unknown) => {
          console.error('Failed to delete scene', error);
          this.error = 'Could not delete this scene. Please try again.';
        },
      });
  }

  trackScene(_index: number, scene: Scene): string {
    return scene.id;
  }

  selectedStatus(scene: Scene): SceneStatus {
    return this.pendingStatus[scene.id] ?? scene.status;
  }

  hasPendingStatus(scene: Scene): boolean {
    return this.selectedStatus(scene) !== scene.status;
  }

  chooseStatus(scene: Scene, status: SceneStatus): void {
    if (status === scene.status) delete this.pendingStatus[scene.id];
    else this.pendingStatus[scene.id] = status;
  }

  updateStatus(scene: Scene): void {
    const status = this.selectedStatus(scene);
    if (!this.hasPendingStatus(scene) || this.statusSavingId) return;
    const projectId = this.projectId;
    this.statusSavingId = scene.id;
    this.error = '';
    this.scenesApi
      .updateStatus(projectId, scene.id, status)
      .pipe(
        finalize(() => {
          this.statusSavingId = null;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (updated) => {
          if (this.projectId !== projectId) return;
          delete this.pendingStatus[updated.id];
          // Only the status is taken from the response so an open edit form is not disturbed.
          this.scenes = this.scenes.map((item) =>
            item.id === updated.id ? { ...item, status: updated.status } : item,
          );
        },
        error: (error: unknown) => {
          console.error('Failed to update scene status', error);
          this.error = 'Could not update the status. Your selection is kept; please try again.';
        },
      });
  }
}
