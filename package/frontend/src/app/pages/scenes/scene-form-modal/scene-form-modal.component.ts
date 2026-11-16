import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, Inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Observable, finalize } from 'rxjs';
import { Scene, SceneInput, SceneStatus, TestSuite } from '../../../services/scene.service';

export interface SceneFormModalData {
  scene?: Scene;
  suites: TestSuite[];
  statuses: { value: SceneStatus; label: string }[];
  suiteId: string;
  save: (scene: SceneInput) => Observable<Scene>;
}

@Component({
  selector: 'app-scene-form-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './scene-form-modal.component.html',
  styleUrl: './scene-form-modal.component.scss',
})
export class SceneFormModalComponent {
  readonly isEditMode: boolean;
  readonly form;
  readonly statuses: SceneFormModalData['statuses'];
  readonly suites: TestSuite[];
  saving = false;
  error = '';

  constructor(
    private readonly fb: FormBuilder,
    private readonly dialogRef: MatDialogRef<SceneFormModalComponent, Scene>,
    private readonly cdr: ChangeDetectorRef,
    private readonly destroyRef: DestroyRef,
    @Inject(MAT_DIALOG_DATA) private readonly data: SceneFormModalData,
  ) {
    this.isEditMode = !!data.scene;
    this.statuses = data.statuses;
    this.suites = data.suites;
    this.form = this.fb.nonNullable.group({
      suiteId: [data.scene?.suiteId ?? data.suiteId, Validators.required],
      sceneNo: [
        data.scene?.sceneNo ?? '',
        [Validators.required, Validators.pattern(/\S/), Validators.maxLength(80)],
      ],
      test: [
        data.scene?.test ?? '',
        [Validators.required, Validators.pattern(/\S/), Validators.maxLength(240)],
      ],
      status: [data.scene?.status ?? SceneStatus.NotStart],
      detailsIssue: [data.scene?.detailsIssue ?? '', Validators.maxLength(2000)],
      expectedResult: [data.scene?.expectedResult ?? '', Validators.maxLength(2000)],
      action: [data.scene?.action ?? '', Validators.maxLength(2000)],
      dataTest: [data.scene?.dataTest ?? '', Validators.maxLength(2000)],
      remark: [data.scene?.remark ?? '', Validators.maxLength(2000)],
    });
  }

  cancel(): void {
    if (!this.saving) this.dialogRef.close();
  }

  submit(): void {
    if (this.saving) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const scene = this.form.getRawValue();
    this.saving = true;
    this.form.disable();
    this.dialogRef.disableClose = true;
    this.error = '';
    this.data
      .save({
        ...scene,
        sceneNo: scene.sceneNo.trim(),
        test: scene.test.trim(),
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.saving = false;
          this.form.enable();
          this.dialogRef.disableClose = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe({
        next: (savedScene) => this.dialogRef.close(savedScene),
        error: (error: unknown) => {
          console.error('Failed to save scene', error);
          this.error = 'Could not save this scene. Your changes are still here; please try again.';
        },
      });
  }
}
