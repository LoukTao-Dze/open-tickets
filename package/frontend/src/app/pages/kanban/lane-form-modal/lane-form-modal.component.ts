import { ChangeDetectorRef, Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { finalize } from 'rxjs';
import { KanbanColumn } from '../../../interface/kanban.interface';
import { KanbanApiService } from '../../../services/kanban-api.service';
import { ConfirmDialogService } from '../../../shared/confirm-dialog/confirm-dialog.service';

const DEFAULT_LANE_COLOR = '#8b919d';
const LANE_NAME_MAX_LENGTH = 80;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const HTTP_CONFLICT = 409;

export interface LaneFormModalData {
  column: KanbanColumn | null;
  isReadOnly: boolean;
}

export enum LaneFormModalAction {
  SAVED = 'saved',
  DELETED = 'deleted',
}

export type LaneFormModalResult =
  | { action: LaneFormModalAction.SAVED; column: KanbanColumn }
  | { action: LaneFormModalAction.DELETED; id: string };

@Component({
  selector: 'app-lane-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './lane-form-modal.component.html',
  styleUrls: ['./lane-form-modal.component.scss'],
})
export class LaneFormModalComponent {
  isLoading = false;
  columnError = '';
  // Last valid color, so the swatch does not flash black while a hex value is half typed.
  swatchColor = DEFAULT_LANE_COLOR;
  readonly editingColumn: KanbanColumn | null;
  readonly columnForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/\S/),
        Validators.maxLength(LANE_NAME_MAX_LENGTH),
      ],
    }),
    color: new FormControl(DEFAULT_LANE_COLOR, {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(HEX_COLOR_PATTERN)],
    }),
  });

  constructor(
    @Inject(MAT_DIALOG_DATA) private readonly data: LaneFormModalData,
    private readonly dialogRef: MatDialogRef<LaneFormModalComponent, LaneFormModalResult>,
    private readonly kanbanApi: KanbanApiService,
    private readonly confirmDialog: ConfirmDialogService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.editingColumn = data.column;
    this.columnForm.reset({
      name: data.column?.name ?? '',
      color: data.column?.color ?? DEFAULT_LANE_COLOR,
    });
    this.swatchColor = this.columnForm.controls.color.value;
    this.columnForm.controls.color.valueChanges.subscribe((color) => {
      if (HEX_COLOR_PATTERN.test(color)) this.swatchColor = color;
    });
  }

  pickSwatchColor(event: Event): void {
    const { value } = event.target as HTMLInputElement;
    this.columnForm.controls.color.setValue(value);
    this.columnForm.controls.color.markAsDirty();
  }

  closeColumnDialog(): void {
    this.dialogRef.close();
  }

  saveColumn(): void {
    if (this.data.isReadOnly || this.isLoading) return;
    if (this.columnForm.invalid) {
      this.columnForm.markAllAsTouched();
      return;
    }
    const payload = this.columnForm.getRawValue();
    payload.name = payload.name.trim();
    const column = this.editingColumn;
    const save = column
      ? this.kanbanApi.updateColumn(column.id, payload)
      : this.kanbanApi.createColumn(payload);
    this.isLoading = true;
    this.dialogRef.disableClose = true;
    this.columnError = '';
    save.pipe(finalize(() => this.finishColumnOperation())).subscribe({
      next: (savedColumn) => {
        this.dialogRef.close({ action: LaneFormModalAction.SAVED, column: savedColumn });
      },
      error: (error: unknown) => {
        console.error('Failed to save lane', error);
        this.columnError = 'Could not save this lane. Your changes are kept; try again.';
      },
    });
  }

  deleteColumn(column: KanbanColumn): void {
    if (this.data.isReadOnly || this.isLoading) return;
    if (column.tickets.length) {
      this.columnError = 'Move or delete all cards before deleting this lane.';
      return;
    }
    this.confirmDialog
      .confirm({
        title: 'Delete lane',
        message: `Delete "${column.name}"? This affects all projects and cannot be undone.`,
        confirmText: 'Delete',
        config: { confirmColor: 'error' },
      })
      .subscribe((confirmed) => {
        if (confirmed && !this.isLoading) this.removeColumn(column);
      });
  }

  private removeColumn(column: KanbanColumn): void {
    this.isLoading = true;
    this.dialogRef.disableClose = true;
    this.columnError = '';
    this.cdr.detectChanges();
    this.kanbanApi
      .deleteColumn(column.id)
      .pipe(finalize(() => this.finishColumnOperation()))
      .subscribe({
        next: () => {
          this.dialogRef.close({ action: LaneFormModalAction.DELETED, id: column.id });
        },
        error: (error: unknown) => {
          console.error('Failed to delete lane', error);
          this.columnError =
            error instanceof HttpErrorResponse && error.status === HTTP_CONFLICT
              ? 'This lane contains cards, possibly in another project. Move or delete them first.'
              : 'Could not delete this lane. Reload the board and try again.';
        },
      });
  }

  private finishColumnOperation(): void {
    this.isLoading = false;
    this.dialogRef.disableClose = false;
    this.cdr.markForCheck();
  }
}
