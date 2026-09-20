import { CommonModule } from '@angular/common';
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { KanbanApiService } from '../../services/kanban-api.service';
import { KanbanProject } from '../../interface/kanban.interface';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { ProjectApiService } from '../../services/project.service';

type ProjectFilter = 'all' | 'active' | 'review' | 'planning';

interface ProjectMenuItem extends Omit<KanbanProject, 'description'> {
  description: string;
  owner: string;
  initials: string;
  status: Exclude<ProjectFilter, 'all'>;
  deadline: string;
  icon: string;
  tone: 'secondary' | 'tertiary' | 'primary' | 'neutral';
}

const PROJECT_DETAILS: Record<string, Omit<ProjectMenuItem, 'id' | 'project_name'>> = {
  'Database Migration Cluster': {
    description: 'Shifting monolithic legacy storage to distributed micro-service architecture.',
    owner: 'Alex Rivera (Lead)',
    initials: 'AL',
    status: 'active',
    deadline: 'OCT 24',
    icon: 'database',
    tone: 'secondary',
  },
  'Zero-Trust Auth Layer': {
    description: 'Implementing mutual TLS and biometric verification for core services.',
    owner: 'Maria Chen',
    initials: 'MK',
    status: 'review',
    deadline: 'NOV 12',
    icon: 'shield_person',
    tone: 'tertiary',
  },
};

@Component({
  selector: 'app-projects',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './projects.component.html',
  styleUrl: './projects.component.scss',
})
export class ProjectsComponent implements OnInit {
  readonly projectForm;
  projects: ProjectMenuItem[] = [];
  filter: ProjectFilter = 'all';
  submitted = false;
  loading = true;
  saving = false;
  errorMessage = '';
  editingProjectId: string | null = null;

  constructor(
    private readonly formBuilder: FormBuilder,
    private readonly kanbanApi: KanbanApiService,
    private readonly projectApi: ProjectApiService,
    private readonly confirmDialog: ConfirmDialogService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.projectForm = this.formBuilder.nonNullable.group({
      name: ['', [Validators.required, Validators.maxLength(80)]],
      description: ['', [Validators.required, Validators.maxLength(240)]],
      priority: ['P1 - High'],
      deadline: [''],
      status: ['Planning'],
    });
  }

  ngOnInit(): void {
    this.loadProjects();
  }

  private loadProjects(): void {
    this.loading = true;
    this.kanbanApi.getProjects().subscribe({
      next: (projects) => {
        this.projects = projects.map((project, index) => this.toMenuItem(project, index));
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        console.error('Failed to load projects', error);
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  get visibleProjects(): ProjectMenuItem[] {
    return this.filter === 'all'
      ? this.projects
      : this.projects.filter((p) => p.status === this.filter);
  }

  setFilter(filter: ProjectFilter): void {
    this.filter = filter;
  }

  createProject(): void {
    this.submitted = true;
    if (this.projectForm.invalid) {
      this.projectForm.markAllAsTouched();
      return;
    }

    const value = this.projectForm.getRawValue();
    this.saving = true;
    this.errorMessage = '';
    const payload = {
      name: value.name,
      description: value.description,
      priority: value.priority,
      deadline: value.deadline,
      status: value.status,
    };
    if (this.editingProjectId) {
      this.projectApi.updateProject(this.editingProjectId, payload).subscribe({
        next: (project) => this.replaceProject(project),
        error: () => this.handleProjectRequestError('update'),
      });
      return;
    }

    this.projectApi.createProject(payload).subscribe({
      next: (project) => {
        const menuItem = this.toMenuItem(project, 0, value.deadline);
        this.projects = [menuItem, ...this.projects];
        this.resetForm();
        this.saving = false;
      },
      error: () => this.handleProjectRequestError('create'),
    });
  }

  editProject(project: ProjectMenuItem): void {
    this.editingProjectId = project.id;
    this.errorMessage = '';
    this.submitted = false;
    this.projectForm.reset({
      name: project.project_name,
      description: project.description,
      priority: 'P1 - High',
      deadline: '',
      status: 'Planning',
    });
  }

  cancelEdit(): void {
    this.resetForm();
  }

  onArchiveProject(project: ProjectMenuItem): void {
    this.confirmDialog
      .confirm({
        title: 'Archive project?',
        message: `Really archive ${project.project_name}? This cannot be undone.`,
        confirmText: 'Archive',
        config: { confirmColor: 'warning' },
      })
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }
      });
  }

  deleteProject(project: ProjectMenuItem): void {
    this.confirmDialog
      .confirm({
        title: 'Delete project?',
        message: `Really delete ${project.project_name}? This cannot be undone.`,
        confirmText: 'Delete',
        config: { confirmColor: 'error' },
      })
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }

        this.saving = true;
        this.errorMessage = '';
        this.projectApi.deleteProject(project.id).subscribe({
          next: () => {
            this.projects = this.projects.filter((item) => item.id !== project.id);
            if (this.editingProjectId === project.id) {
              this.resetForm();
            }
            this.saving = false;
          },
          error: () => this.handleProjectRequestError('delete'),
        });
      });
  }

  private replaceProject(project: KanbanProject): void {
    const index = this.projects.findIndex((item) => item.id === project.id);
    const updatedProject = this.toMenuItem(project, index);
    this.projects[index] = {
      ...updatedProject,
    };
    this.resetForm();
    this.saving = false;
  }

  private handleProjectRequestError(action: string): void {
    this.errorMessage = `Unable to ${action} the project. Please try again.`;
    this.saving = false;
  }

  private resetForm(): void {
    this.projectForm.reset({
      name: '',
      description: '',
      priority: 'P1 - High',
      deadline: '',
      status: 'Planning',
    });
    this.submitted = false;
    this.editingProjectId = null;
  }

  private toMenuItem(project: KanbanProject, index: number, deadline = 'TBD'): ProjectMenuItem {
    const detail = PROJECT_DETAILS[project.project_name];
    if (detail) {
      return { ...project, ...detail };
    }
    const initials = project.project_name
      .split(' ')
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
    return {
      ...project,
      description:
        project.description ??
        'Operational project workspace for planning, delivery, and service coordination.',
      owner: 'Workspace team',
      initials,
      status: this.normalizeProjectStatus(project.status),
      deadline: project.deadline ? project.deadline : deadline.toUpperCase(),
      icon: 'dataset',
      tone: this.normalizeProjectStatus(project.status) === 'active' ? 'secondary' : 'primary',
    };
  }

  private normalizeProjectStatus(status: string | undefined): Exclude<ProjectFilter, 'all'> {
    const normalizedStatus = status?.trim().toLowerCase();
    return normalizedStatus === 'active' || normalizedStatus === 'review'
      ? normalizedStatus
      : 'planning';
  }
}
