import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { vi } from 'vitest';
import {
  TicketFormModalAction,
  TicketFormModalComponent,
  TicketFormModalData,
} from './ticket-form-modal.component';

const REQUIRED_FIELDS = [
  ['title', 'Title'],
  ['priority', 'Priority'],
  ['projectId', 'Project'],
  ['assigneeAlt', 'Assignee'],
  ['meta', 'Meta'],
  ['taskType', 'Task Type'],
  ['jobType', 'Job Type'],
] as const;
const LENGTH_LIMITS = [
  ['title', 'Title', 120],
  ['detail', 'Detail', 2000],
  ['assigneeAlt', 'Assignee', 80],
] as const;

describe('TicketFormModalComponent validation', () => {
  let fixture: ComponentFixture<TicketFormModalComponent>;
  let view: HTMLElement;
  const close = vi.fn();
  const dialogData: TicketFormModalData = {
    projects: [{ id: 'project-1', project_name: 'Project' }],
    action: TicketFormModalAction.ADD,
  };

  beforeEach(async () => {
    close.mockClear();
    await TestBed.configureTestingModule({
      imports: [TicketFormModalComponent],
      providers: [
        { provide: MatDialogRef, useValue: { close } },
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TicketFormModalComponent);
    view = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('does not show errors before interaction', () => {
    expect(view.querySelector('[aria-invalid="true"]')).toBeNull();
    expect(view.querySelector('#title-error')?.textContent?.trim()).toBe('');
    expect(view.querySelector('#assigneeAlt-error')?.textContent?.trim()).toBe('');
  });

  it.each(REQUIRED_FIELDS)('shows a required error for %s after blur', (field, label) => {
    fixture.componentInstance.form.get(field)!.setValue(null);
    fixture.detectChanges();
    const input = view.querySelector<HTMLElement>(`[formControlName="${field}"]`)!;
    expect(input.getAttribute('aria-invalid')).toBe('false');

    input.dispatchEvent(new Event('blur'));
    fixture.detectChanges();

    expect(input.matches('.ng-invalid.ng-touched')).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe(`${field}-error`);
    expect(view.querySelector(`#${field}-error`)?.textContent).toContain(`${label} is required.`);
  });

  it.each(LENGTH_LIMITS)(
    'shows the length limit for %s and clears it at the boundary',
    (field, label, limit) => {
      const control = fixture.componentInstance.form.get(field)!;
      control.setValue('x'.repeat(limit + 1));
      control.markAsTouched();
      fixture.detectChanges();

      expect(view.querySelector(`#${field}-error`)?.textContent).toContain(
        `${label} must be ${limit} characters or fewer.`,
      );
      expect(view.querySelector(`[formControlName="${field}"]`)?.getAttribute('aria-invalid')).toBe(
        'true',
      );

      control.setValue('x'.repeat(limit));
      fixture.detectChanges();

      expect(view.querySelector(`#${field}-error`)?.textContent?.trim()).toBe('');
      expect(view.querySelector(`[formControlName="${field}"]`)?.matches('.ng-invalid')).toBe(false);
      expect(view.querySelector(`[formControlName="${field}"]`)?.getAttribute('aria-invalid')).toBe(
        'false',
      );
    },
  );

  it('shows errors on submit and only closes after corrections', () => {
    const form = view.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(close).not.toHaveBeenCalled();
    expect(view.querySelector('#title-error')?.textContent).toContain('Title is required.');
    expect(view.querySelector('#assigneeAlt-error')?.textContent).toContain('Assignee is required.');

    fixture.componentInstance.form.patchValue({ title: 'Ticket', assigneeAlt: 'Assignee' });
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(close).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Ticket',
        assigneeAlt: 'Assignee',
        meta: [fixture.componentInstance.TICKET_META_ITEMS[0]],
        createDate: expect.any(String),
        updateDate: expect.any(String),
      }),
    );
    expect(view.querySelector('[aria-invalid="true"]')).toBeNull();
  });

  it('shows the project error when no projects are available', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TicketFormModalComponent],
      providers: [
        { provide: MatDialogRef, useValue: { close } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: { projects: [], action: TicketFormModalAction.ADD },
        },
      ],
    });
    const emptyFixture = TestBed.createComponent(TicketFormModalComponent);
    emptyFixture.componentInstance.onSubmit();
    emptyFixture.detectChanges();
    const emptyView: HTMLElement = emptyFixture.nativeElement;

    expect(emptyView.querySelector('#projectId-error')?.textContent).toContain('Project is required.');
    expect(close).not.toHaveBeenCalled();
  });
});
