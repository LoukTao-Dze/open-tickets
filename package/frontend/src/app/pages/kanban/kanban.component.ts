import { ChangeDetectorRef, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  CdkDropListGroup,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { MatDialog } from '@angular/material/dialog';
import {
  TicketFormModalAction,
  TicketFormModalComponent,
  TicketFormModalData,
  TicketFormValue,
} from './ticket-form-modal/ticket-form-modal.component';
import { MOCK_KAN_BAN } from '../../mock/kanban';
import { KanbanColumn, KanbanProject, KanbanTicket } from '../../interface/kanban.interface';

const ALL_PROJECTS = 'all';
const PROJECT_NAME_MAX_LENGTH = 12;

@Component({
  selector: 'app-kanban',
  standalone: true,
  imports: [CommonModule, CdkDropListGroup, CdkDropList, CdkDrag],
  templateUrl: './kanban.component.html',
  styleUrls: ['./kanban.component.scss'],
})
export class KanbanComponent {
  constructor(
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef,
  ) {}

  columns: KanbanColumn[] = MOCK_KAN_BAN;

  selectedProject = ALL_PROJECTS;

  get projects(): KanbanProject[] {
    const allProjects = this.columns.flatMap((column) =>
      column.tickets.map((ticket) => ticket.project),
    );
    const uniqueProjectsById = new Map(allProjects.map((project) => [project.id, project]));
    return Array.from(uniqueProjectsById.values()).sort((a, b) =>
      a.project_name.localeCompare(b.project_name),
    );
  }

  visibleTickets(column: KanbanColumn): KanbanTicket[] {
    if (this.selectedProject === ALL_PROJECTS) {
      return column.tickets;
    }
    return column.tickets.filter((ticket) => ticket.project.id === this.selectedProject);
  }

  onProjectChange(projectId: string) {
    this.selectedProject = projectId;
  }

  truncateProjectName(project: KanbanProject): string {
    if (project.project_name.length <= PROJECT_NAME_MAX_LENGTH) {
      return project.project_name;
    }
    return `${project.project_name.slice(0, PROJECT_NAME_MAX_LENGTH)}...`;
  }

  onTicketDropped(event: CdkDragDrop<KanbanTicket[]>) {
    if (event.previousContainer === event.container) {
      moveItemInArray(event.container.data, event.previousIndex, event.currentIndex);
      return;
    }

    transferArrayItem(
      event.previousContainer.data,
      event.container.data,
      event.previousIndex,
      event.currentIndex,
    );

    const sourceColumn = this.columns.find(
      (column) => column.tickets === event.previousContainer.data,
    );
    const targetColumn = this.columns.find((column) => column.tickets === event.container.data);
    if (sourceColumn) {
      sourceColumn.count = sourceColumn.tickets.length;
    }
    if (targetColumn) {
      targetColumn.count = targetColumn.tickets.length;
    }
  }

  openAddTicketModal() {
    const dialogRef = this.dialog.open<
      TicketFormModalComponent,
      TicketFormModalData,
      TicketFormValue
    >(TicketFormModalComponent, {
      panelClass: 'app-dialog-panel',
      width: '480px',
      maxWidth: '90vw',
      autoFocus: 'first-heading',
      data: { projects: this.projects, action: TicketFormModalAction.ADD },
    });

    dialogRef.afterClosed().subscribe((value) => {
      if (value) {
        this.addTicket(value);
      }
    });
  }

  openEditTicketModal(ticket: KanbanTicket) {
    const dialogRef = this.dialog.open<
      TicketFormModalComponent,
      TicketFormModalData,
      TicketFormValue
    >(TicketFormModalComponent, {
      panelClass: 'app-dialog-panel',
      width: '480px',
      maxWidth: '90vw',
      autoFocus: 'first-heading',
      data: { projects: this.projects, action: TicketFormModalAction.EDIT, ticket },
    });

    dialogRef.afterClosed().subscribe((value) => {
      if (value) {
        setTimeout(() => this.updateTicket(ticket, value));
      }
    });
  }

  addTicket(value: TicketFormValue) {
    const todoColumn = this.columns.find((column) => column.id === 'todo');
    if (!todoColumn) {
      return;
    }

    const ticket: KanbanTicket = {
      id: this.generateTicketId(),
      title: value.title,
      detail: value.detail,
      priority: value.priority,
      project: this.resolveProject(value.projectId),
      createDate: value.createDate,
      updateDate: value.updateDate,
      assigneeAlt: value.assigneeAlt,
      taskType: value.taskType,
      jobType: value.jobType,
      meta: [{ icon: 'schedule', label: 'New' }],
      assigneeAvatarUrl: this.defaultAvatarUrl,
    };

    todoColumn.tickets.unshift(ticket);
    todoColumn.count = todoColumn.tickets.length;
    this.cdr.detectChanges();
  }

  updateTicket(ticket: KanbanTicket, value: TicketFormValue) {
    ticket.title = value.title;
    ticket.detail = value.detail;
    ticket.priority = value.priority;
    ticket.project = this.resolveProject(value.projectId);
    ticket.createDate = value.createDate;
    ticket.updateDate = value.updateDate;
    ticket.assigneeAlt = value.assigneeAlt;
    ticket.taskType = value.taskType;
    ticket.jobType = value.jobType;
  }

  private readonly defaultAvatarUrl =
    "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%238b919d'><circle cx='12' cy='8' r='4'/><path d='M4 20c0-4 4-6 8-6s8 2 8 6'/></svg>";

  private resolveProject(projectId: string): KanbanProject {
    const found = this.projects.find((project) => project.id === projectId);
    return found ?? this.projects[0];
  }

  private generateTicketId(): string {
    const numericIds = this.columns
      .flatMap((column) => column.tickets)
      .map((ticket) => Number(ticket.id.replace(/[^0-9]/g, '')))
      .filter((value) => !Number.isNaN(value));
    const nextNumber = (numericIds.length ? Math.max(...numericIds) : 1000) + 1;
    return `DS-${nextNumber}`;
  }
}
