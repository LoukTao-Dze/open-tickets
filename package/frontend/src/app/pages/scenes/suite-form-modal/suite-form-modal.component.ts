import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, Inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, finalize } from 'rxjs';
import { KanbanTicket } from '../../../interface/kanban.interface';
import { KanbanApiService } from '../../../services/kanban-api.service';
import { SuiteInput, TestSuite } from '../../../services/scene.service';

export interface SuiteFormModalData {
  suite?: TestSuite;
  projectId: string;
  projects: { id: string; project_name: string }[];
  save: (suite: SuiteInput) => Observable<TestSuite>;
}

@Component({
  selector: 'app-suite-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './suite-form-modal.component.html',
  styleUrl: './suite-form-modal.component.scss',
})
export class SuiteFormModalComponent implements OnInit {
  readonly isEditMode: boolean;
  readonly form;
  readonly projects: SuiteFormModalData['projects'];
  saving = false;
  error = '';
  ticketError = '';
  loadingTickets = false;
  availableTickets: KanbanTicket[] = [];
  selectedTicketIds: string[];

  constructor(
    private readonly fb: FormBuilder,
    private readonly dialogRef: MatDialogRef<SuiteFormModalComponent, TestSuite>,
    private readonly cdr: ChangeDetectorRef,
    private readonly destroyRef: DestroyRef,
    private readonly kanbanApi: KanbanApiService,
    @Inject(MAT_DIALOG_DATA) private readonly data: SuiteFormModalData,
  ) {
    this.isEditMode = !!data.suite;
    this.projects = data.projects;
    this.selectedTicketIds = [...(data.suite?.kanbanTicketIds ?? [])];
    this.form = this.fb.nonNullable.group({
      name: [
        data.suite?.name ?? '',
        [Validators.required, Validators.pattern(/\S/), Validators.maxLength(240)],
      ],
      description: [data.suite?.description ?? '', [Validators.maxLength(2000)]],
      projectId: [data.suite?.projectId ?? data.projectId, Validators.required],
    });
  }

  ngOnInit(): void {
    this.loadTickets();
  }

  get unavailableTicketIds(): string[] {
    return this.selectedTicketIds.filter(
      (id) => !this.availableTickets.some((ticket) => ticket.id === id),
    );
  }

  loadTickets(): void {
    this.loadingTickets = true;
    this.ticketError = '';
    this.kanbanApi
      .getBoard(this.form.controls.projectId.value)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.loadingTickets = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (columns) => {
          this.availableTickets = columns.flatMap((column) =>
            column.tickets.filter(
              (ticket) => ticket.project.id === this.form.controls.projectId.value,
            ),
          );
        },
        error: (error: unknown) => {
          console.error('Failed to load Kanban cards for test suite', error);
          this.ticketError = 'Could not load Kanban cards. Try again before saving.';
        },
      });
  }

  toggleTicket(ticketId: string, selected: boolean): void {
    this.selectedTicketIds = selected
      ? [...this.selectedTicketIds, ticketId]
      : this.selectedTicketIds.filter((id) => id !== ticketId);
  }

  cancel(): void {
    if (!this.saving) this.dialogRef.close();
  }

  submit(): void {
    if (
      this.saving ||
      this.loadingTickets ||
      this.ticketError ||
      this.unavailableTicketIds.length
    )
      return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, description, projectId } = this.form.getRawValue();
    this.saving = true;
    // A save in flight must finish so the page and the server stay in sync.
    this.dialogRef.disableClose = true;
    this.error = '';
    this.data
      .save({
        name: name.trim(),
        description: description.trim(),
        kanbanTicketIds: this.selectedTicketIds,
        ...(this.isEditMode && projectId !== this.data.projectId && { projectId }),
      })
      .pipe(
        finalize(() => {
          this.saving = false;
          this.dialogRef.disableClose = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (suite) => this.dialogRef.close(suite),
        error: (error: unknown) => {
          console.error('Failed to save test suite', error);
          this.error = 'Could not save this suite. Your changes are kept; please try again.';
        },
      });
  }
}
