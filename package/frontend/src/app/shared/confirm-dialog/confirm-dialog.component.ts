import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export type ConfirmDialogColor = 'primary' | 'secondary' | 'tertiary' | 'error' | 'neutral';

const DEFAULT_CONFIRM_TEXT = 'Confirm';
const DEFAULT_CANCEL_TEXT = 'Cancel';
const DEFAULT_CONFIRM_COLOR: ConfirmDialogColor = 'primary';
const DEFAULT_CANCEL_COLOR: ConfirmDialogColor = 'neutral';

const BUTTON_COLOR_CLASS: Record<ConfirmDialogColor, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  tertiary: 'btn-tertiary',
  error: 'btn-error',
  neutral: 'btn-neutral',
};

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  config?: ConfirmDialogConfig;
}
export type ConfirmDialogConfig = {
  disableClose?: boolean;
  confirmColor?: ConfirmDialogColor;
  cancelColor?: ConfirmDialogColor;
};

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirm-dialog.component.html',
  styleUrls: ['./confirm-dialog.component.scss'],
})
export class ConfirmDialogComponent {
  readonly title: string;
  readonly message: string;
  readonly confirmText: string;
  readonly cancelText: string;
  readonly confirmButtonClass: string;
  readonly cancelButtonClass: string;
  readonly config: ConfirmDialogConfig;
  constructor(
    private dialogRef: MatDialogRef<ConfirmDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) data: ConfirmDialogData,
  ) {
    this.title = data.title;
    this.message = data.message;
    this.confirmText = data.confirmText ?? DEFAULT_CONFIRM_TEXT;
    this.cancelText = data.cancelText ?? DEFAULT_CANCEL_TEXT;
    this.confirmButtonClass =
      BUTTON_COLOR_CLASS[data.config?.confirmColor ?? DEFAULT_CONFIRM_COLOR];
    this.cancelButtonClass = BUTTON_COLOR_CLASS[data.config?.cancelColor ?? DEFAULT_CANCEL_COLOR];
    this.config = data.config ?? {};
  }

  onConfirm(): void {
    this.dialogRef.close(true);
  }

  onCancel(): void {
    this.dialogRef.close(false);
  }
}
