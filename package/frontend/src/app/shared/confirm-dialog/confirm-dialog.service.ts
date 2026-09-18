import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ConfirmDialogComponent, ConfirmDialogData } from './confirm-dialog.component';

const CONFIRM_DIALOG_WIDTH = '400px';
const CONFIRM_DIALOG_MAX_WIDTH = '90vw';

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  constructor(private dialog: MatDialog) {}
  confirm(data: ConfirmDialogData): Observable<boolean> {
    const dialogRef = this.dialog.open<ConfirmDialogComponent, ConfirmDialogData, boolean>(
      ConfirmDialogComponent,
      {
        panelClass: 'app-dialog-panel',
        width: CONFIRM_DIALOG_WIDTH,
        maxWidth: CONFIRM_DIALOG_MAX_WIDTH,
        autoFocus: 'first-heading',
        data,
      },
    );

    return dialogRef.afterClosed().pipe(map((confirmed) => confirmed ?? false));
  }
}
