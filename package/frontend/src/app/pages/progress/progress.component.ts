import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin, finalize } from 'rxjs';
import { KanbanApiService } from '../../services/kanban-api.service';
import { KanbanColumn } from '../../interface/kanban.interface';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import {
  CreateProjectProgressLog,
  ProjectApiService,
  ProjectProgressLog,
} from '../../services/project.service';
import {
  ProjectProgress,
  calculateProjectProgress,
  groupProgressLogsByDate,
} from './project-progress.util';

@Component({
  selector: 'app-progress',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './progress.component.html',
  styleUrl: './progress.component.scss',
})
export class ProgressComponent implements OnInit {
  projects: ProjectProgress[] = [];
  columns: KanbanColumn[] = [];
  loading = true;
  errorMessage = '';
  selectedProjectId: string | null = null;
  logs: ProjectProgressLog[] = [];
  canEditLogs = false;
  projectAccessLoaded = false;
  logsLoading = false;
  logsError = '';
  logDate = this.today();
  logDetails = '';
  savingLog = false;
  deletingLogId: string | null = null;

  constructor(
    private readonly kanbanApi: KanbanApiService,
    private readonly projectApi: ProjectApiService,
    private readonly confirmDialog: ConfirmDialogService,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.loadProgress();
  }

  loadProgress(): void {
    this.loading = true;
    this.errorMessage = '';

    forkJoin({
      projects: this.projectApi.getProjects(),
      columns: this.kanbanApi.getBoard(),
    })
      .pipe(
        finalize(() => {
          this.loading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: ({ projects, columns }) => {
          this.projects = calculateProjectProgress(projects, columns);
          this.columns = columns;
          if (!projects.some((project) => project.id === this.selectedProjectId)) {
            this.selectedProjectId = null;
            this.logs = [];
          }
        },
        error: (error: unknown) => {
          console.error('Failed to load project progress', error);
          this.errorMessage = 'Project progress could not be loaded. Try again.';
        },
      });
  }

  get selectedProject(): ProjectProgress | undefined {
    return this.projects.find((item) => item.project.id === this.selectedProjectId);
  }

  get logGroups() {
    return groupProgressLogsByDate(this.logs);
  }

  selectProject(projectId: string): void {
    if (this.selectedProjectId === projectId) {
      this.selectedProjectId = null;
      this.logs = [];
      this.canEditLogs = false;
      this.projectAccessLoaded = false;
      return;
    }

    this.selectedProjectId = projectId;
    this.logs = [];
    this.canEditLogs = false;
    this.projectAccessLoaded = false;
    this.logsError = '';
    this.loadLogs(projectId);
  }

  reloadLogs(): void {
    if (this.selectedProjectId) {
      this.logsError = '';
      this.loadLogs(this.selectedProjectId);
    }
  }

  saveLog(): void {
    const projectId = this.selectedProjectId;
    const payload: CreateProjectProgressLog = {
      date: this.logDate,
      details: this.logDetails.trim(),
    };
    if (!projectId || !payload.details || !payload.date || this.savingLog) {
      return;
    }

    this.savingLog = true;
    this.logsError = '';
    this.projectApi
      .createProgressLog(projectId, payload)
      .pipe(
        finalize(() => {
          this.savingLog = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (log) => {
          if (this.selectedProjectId === projectId) {
            this.logs = [log, ...this.logs].sort(
              (first, second) =>
                second.date.localeCompare(first.date) ||
                second.createdAt.localeCompare(first.createdAt),
            );
            this.logDetails = '';
          }
        },
        error: (error: unknown) => {
          console.error('Failed to save project progress log', error);
          this.logsError = 'The project log could not be saved. Try again.';
        },
      });
  }

  backToProjects(): void {
    this.selectedProjectId = null;
    this.logs = [];
    this.canEditLogs = false;
    this.projectAccessLoaded = false;
  }

  deleteLog(log: ProjectProgressLog): void {
    const projectId = this.selectedProjectId;
    if (!projectId || !this.canEditLogs || this.deletingLogId) {
      return;
    }

    this.confirmDialog
      .confirm({
        title: 'Delete project log?',
        message: 'This project log will be permanently deleted. This cannot be undone.',
        confirmText: 'Delete',
        config: { confirmColor: 'error' },
      })
      .subscribe((confirmed) => {
        if (!confirmed || this.selectedProjectId !== projectId || this.deletingLogId) {
          return;
        }

        this.deletingLogId = log.id;
        this.logsError = '';
        this.projectApi
          .deleteProgressLog(projectId, log.id)
          .pipe(
            finalize(() => {
              this.deletingLogId = null;
              this.cdr.markForCheck();
            }),
          )
          .subscribe({
            next: () => {
              this.logs = this.logs.filter((item) => item.id !== log.id);
            },
            error: (error: unknown) => {
              console.error('Failed to delete project progress log', error);
              this.logsError = 'The project log could not be deleted. Try again.';
            },
          });
      });
  }

  private loadLogs(projectId: string): void {
    this.logsLoading = true;
    this.projectApi
      .getProgressLogs(projectId)
      .pipe(
        finalize(() => {
          if (this.selectedProjectId === projectId) {
            this.logsLoading = false;
            this.cdr.markForCheck();
          }
        }),
      )
      .subscribe({
        next: (logs) => {
          if (this.selectedProjectId === projectId) {
            this.logs = logs.logs;
            this.canEditLogs = logs.canEdit;
            this.projectAccessLoaded = true;
          }
        },
        error: (error: unknown) => {
          console.error('Failed to load project progress logs', error);
          if (this.selectedProjectId === projectId) {
            this.logsError = 'Project logs could not be loaded. Try again.';
          }
        },
      });
  }

  private today(): string {
    const date = new Date();
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 10);
  }
}
