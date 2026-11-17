import { ChangeDetectorRef, Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { finalize } from 'rxjs';
import { KanbanColumn } from '../../../interface/kanban.interface';
import { KanbanApiService } from '../../../services/kanban-api.service';

export type LaneOrderItem = Pick<KanbanColumn, 'id' | 'name' | 'color'>;

export interface LaneOrderModalData {
  columns: LaneOrderItem[];
  isReadOnly: boolean;
}

@Component({
  selector: 'app-lane-order-modal',
  standalone: true,
  imports: [CommonModule, CdkDropList, CdkDrag, CdkDragHandle],
  templateUrl: './lane-order-modal.component.html',
  styleUrls: ['./lane-order-modal.component.scss'],
})
export class LaneOrderModalComponent {
  isLoading = false;
  orderError = '';
  readonly lanes: LaneOrderItem[];
  private readonly initialIds: string[];

  constructor(
    @Inject(MAT_DIALOG_DATA) private readonly data: LaneOrderModalData,
    private readonly dialogRef: MatDialogRef<LaneOrderModalComponent, boolean>,
    private readonly kanbanApi: KanbanApiService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.lanes = data.columns.map(({ id, name, color }) => ({ id, name, color }));
    this.initialIds = this.lanes.map((lane) => lane.id);
  }

  get hasChanges(): boolean {
    return this.lanes.some((lane, index) => lane.id !== this.initialIds[index]);
  }

  closeDialog(): void {
    this.dialogRef.close(false);
  }

  onLaneDropped(event: CdkDragDrop<LaneOrderItem[]>): void {
    if (this.isLoading) return;
    moveItemInArray(this.lanes, event.previousIndex, event.currentIndex);
  }

  moveLane(index: number, offset: -1 | 1): void {
    const target = index + offset;
    if (this.isLoading || target < 0 || target >= this.lanes.length) return;
    moveItemInArray(this.lanes, index, target);
  }

  saveOrder(): void {
    if (this.data.isReadOnly || this.isLoading || !this.hasChanges) return;
    this.isLoading = true;
    this.dialogRef.disableClose = true;
    this.orderError = '';
    this.kanbanApi
      .reorderColumns(this.lanes.map((lane) => lane.id))
      .pipe(finalize(() => this.finishSave()))
      .subscribe({
        next: () => this.dialogRef.close(true),
        error: (error: unknown) => {
          console.error('Failed to save lane order', error);
          this.orderError = 'Could not save the lane order. Your changes are kept; try again.';
        },
      });
  }

  private finishSave(): void {
    this.isLoading = false;
    this.dialogRef.disableClose = false;
    this.cdr.markForCheck();
  }
}
