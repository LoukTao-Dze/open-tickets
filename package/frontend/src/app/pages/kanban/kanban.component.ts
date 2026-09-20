import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ProjectApiService } from '../../services/project.service';
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
import { KanbanColumn, KanbanProject, KanbanTicket } from '../../interface/kanban.interface';
import { KanbanApiService } from '../../services/kanban-api.service';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';

const ALL_PROJECTS = 'all';
const PROJECT_NAME_MAX_LENGTH = 12;

@Component({
  selector: 'app-kanban',
  standalone: true,
  imports: [CommonModule, CdkDropListGroup, CdkDropList, CdkDrag],
  templateUrl: './kanban.component.html',
  styleUrls: ['./kanban.component.scss'],
})
export class KanbanComponent implements OnInit {
  constructor(
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef,
    private kanbanApi: KanbanApiService,
    private confirmDialog: ConfirmDialogService,
    private projectApi: ProjectApiService,
  ) {}

  columns: KanbanColumn[] = [];
  allProjects: KanbanProject[] = [];

  selectedProject = ALL_PROJECTS;

  get projects(): KanbanProject[] {
    return this.allProjects;
  }

  ngOnInit() {
    this.loadBoard();
    this.projectApi.getProjects().subscribe({
      next: (projects) => (this.allProjects = projects),
      error: (err) => console.error('Failed to load projects', err),
    });
  }

  private loadBoard() {
    this.kanbanApi.getBoard().subscribe({
      next: (columns) => {
        this.columns = columns;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Failed to load kanban board', err),
    });
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

    const sourceColumn = this.columns.find(
      (column) => column.tickets === event.previousContainer.data,
    );
    const targetColumn = this.columns.find((column) => column.tickets === event.container.data);
    const previousColumnId = sourceColumn?.id;

    transferArrayItem(
      event.previousContainer.data,
      event.container.data,
      event.previousIndex,
      event.currentIndex,
    );

    if (sourceColumn) {
      sourceColumn.count = sourceColumn.tickets.length;
    }
    if (!targetColumn) {
      return;
    }

    targetColumn.count = targetColumn.tickets.length;
    const movedTicket = targetColumn.tickets[event.currentIndex];
    movedTicket.columnId = targetColumn.id;

    this.kanbanApi.moveTicket(movedTicket.id, targetColumn.id).subscribe({
      error: (err) => {
        console.error('Failed to move ticket', err);
        this.loadBoard();
        if (previousColumnId) {
          movedTicket.columnId = previousColumnId;
        }
      },
    });
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
    const targetColumn = this.columns.find((column) => column.id === value.columnId);
    if (!targetColumn) {
      return;
    }

    this.kanbanApi.createTicket(value).subscribe({
      next: (ticket) => {
        targetColumn.tickets.push(ticket);
        targetColumn.count = targetColumn.tickets.length;
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Failed to create ticket', err),
    });
  }

  updateTicket(ticket: KanbanTicket, value: TicketFormValue) {
    this.kanbanApi.updateTicket(ticket.id, value).subscribe({
      next: (updatedTicket) => {
        const sourceColumn = this.columns.find((column) =>
          column.tickets.some((item) => item.id === ticket.id),
        );
        if (sourceColumn && sourceColumn.id !== updatedTicket.columnId) {
          sourceColumn.tickets = sourceColumn.tickets.filter((item) => item.id !== ticket.id);
          sourceColumn.count = sourceColumn.tickets.length;
          const targetColumn = this.columns.find((column) => column.id === updatedTicket.columnId);
          if (targetColumn) {
            targetColumn.tickets.push(updatedTicket);
            targetColumn.count = targetColumn.tickets.length;
          }
        } else {
          Object.assign(ticket, updatedTicket);
        }
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Failed to update ticket', err),
    });
  }

  deleteTicket(ticket: KanbanTicket) {
    this.confirmDialog
      .confirm({
        title: 'Delete ticket',
        message: `Are you sure you want to delete "${ticket.title}"? This cannot be undone.`,
        confirmText: 'Delete',
        config: { confirmColor: 'error' },
      })
      .subscribe((confirmed) => {
        if (!confirmed) {
          return;
        }

        this.kanbanApi.deleteTicket(ticket.id).subscribe({
          next: () => {
            const column = this.columns.find((item) => item.id === ticket.columnId);
            if (column) {
              column.tickets = column.tickets.filter((item) => item.id !== ticket.id);
              column.count = column.tickets.length;
            }
            this.cdr.detectChanges();
          },
          error: (err) => console.error('Failed to delete ticket', err),
        });
      });
  }
}
