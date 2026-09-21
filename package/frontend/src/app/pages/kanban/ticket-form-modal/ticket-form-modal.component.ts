import { Component, Inject, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  KanbanColumnId,
  KanbanMeta,
  KanbanPriority,
  KanbanProject,
  KanbanTicket,
} from '../../../interface/kanban.interface';

export interface TicketFormValue {
  columnId: KanbanColumnId;
  title: string;
  detail: string;
  priority: KanbanPriority;
  projectId: string;
  meta: KanbanMeta[];
  createDate: string;
  updateDate: string;
  assigneeAlt: string;
  taskType: string;
  jobType: string;
}

export interface TicketFormModalData {
  projects: KanbanProject[];
  action: TicketFormModalAction;
  ticket?: KanbanTicket;
}

export enum TicketFormModalAction {
  ADD = 'ADD',
  EDIT = 'EDIT',
}

const TODAY = new Date().toISOString().slice(0, 10);

@Component({
  selector: 'app-ticket-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './ticket-form-modal.component.html',
  styleUrls: ['./ticket-form-modal.component.scss'],
})
export class TicketFormModalComponent {
  readonly priorities: KanbanPriority[] = ['Low', 'Medium', 'High', 'Urgent'];
  readonly taskTypes = ['Feature', 'Bug', 'Chore', 'Improvement'];
  readonly jobTypes = ['Frontend', 'Backend', 'DevOps', 'QA', 'Design'];
  readonly projects: KanbanProject[];
  readonly isEditMode: boolean;
  readonly TICKET_META_ITEMS: KanbanMeta[] = [
    { icon: 'schedule', label: 'New' },
    { icon: 'history', label: 'Overdue' },
    { icon: 'bolt', label: 'Ready' },
    { icon: 'sync', label: 'In Review' },
    { icon: 'priority_high', label: 'Urgent' },
    { icon: 'check_circle', label: 'Qa passed' },
    { icon: 'task_alt', label: 'Approved' },
    { icon: 'warning', label: 'Blocked' },
    { icon: 'timer', label: 'Due today' },
  ];

  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<TicketFormModalComponent, TicketFormValue>,
    @Optional() @Inject(MAT_DIALOG_DATA) data: TicketFormModalData | null,
  ) {
    console.info('\x1b[7;31;40m[DEBUGGER] ->> data\x1b[0m', data);
    this.projects = data?.projects ?? [];
    const ticket = data?.ticket;
    this.isEditMode = data?.action === TicketFormModalAction.EDIT;
    this.form = this.fb.group({
      columnId: this.fb.control<KanbanColumnId>(ticket?.columnId ?? 'todo', [Validators.required]),
      title: this.fb.control(ticket?.title ?? '', [Validators.required, Validators.maxLength(120)]),
      detail: this.fb.control(ticket?.detail ?? '', [Validators.maxLength(2000)]),
      priority: this.fb.control<KanbanPriority>(ticket?.priority ?? 'Low', [Validators.required]),
      projectId: this.fb.control(ticket?.project.id ?? this.projects[0]?.id ?? '', [
        Validators.required,
      ]),
      meta: this.fb.control<KanbanMeta>(ticket?.meta?.[0] ?? this.TICKET_META_ITEMS[0], [
        Validators.required,
      ]),
      createDate: this.fb.control(ticket?.createDate ?? TODAY, [Validators.required]),
      updateDate: this.fb.control(ticket?.updateDate ?? TODAY, [Validators.required]),
      assigneeAlt: this.fb.control(ticket?.assigneeAlt ?? '', [
        Validators.required,
        Validators.maxLength(80),
      ]),
      taskType: this.fb.control(ticket?.taskType ?? this.taskTypes[0], [Validators.required]),
      jobType: this.fb.control(ticket?.jobType ?? this.jobTypes[0], [Validators.required]),
    });
    this.form.get('createDate')?.disable();
    this.form.get('updateDate')?.disable();
  }

  compareMeta(first: KanbanMeta | null, second: KanbanMeta | null): boolean {
    return first?.icon === second?.icon;
  }

  onCancel() {
    this.dialogRef.close();
  }

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const formValue = this.form.getRawValue();
    this.dialogRef.close({ ...formValue, meta: [formValue.meta] } as TicketFormValue);
  }
}
