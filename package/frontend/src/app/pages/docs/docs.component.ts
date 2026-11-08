import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { DocsService, UserGuide } from '../../services/docs.service';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { downloadMarkdown } from '../workspace/shared/markdown-download.util';
import { renderMarkdown } from '../workspace/shared/markdown-render.util';

const ADMIN_ROLE = 'admin';
const CONFLICT_STATUS = 409;

@Component({
  selector: 'app-docs',
  imports: [DatePipe],
  templateUrl: './docs.component.html',
  styleUrl: './docs.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DocsComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly docs = inject(DocsService);
  private readonly confirm = inject(ConfirmDialogService);
  private readonly preview = viewChild<ElementRef<HTMLElement>>('preview');
  readonly maxLength = 100_000;
  readonly guide = signal<UserGuide | null>(null);
  readonly draft = signal('');
  readonly editing = signal(false);
  readonly tab = signal<'preview' | 'source'>('preview');
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly source = computed(() => (this.editing() ? this.draft() : (this.guide()?.content ?? '')));
  readonly dirty = computed(() => this.editing() && this.draft() !== this.guide()?.content);
  readonly canSave = computed(
    () =>
      this.isAdmin() &&
      this.dirty() &&
      !this.saving() &&
      this.draft().trim().length > 0 &&
      this.draft().length <= this.maxLength,
  );

  constructor() {
    effect(() => {
      const preview = this.preview()?.nativeElement;
      const source = this.source();
      if (!preview) return;
      // Security: sanitize Markdown before importing inert DOM nodes; never inject raw HTML.
      const parsed = new DOMParser().parseFromString(renderMarkdown(source), 'text/html');
      preview.replaceChildren(
        ...Array.from(parsed.body.childNodes, (node: ChildNode) => document.importNode(node, true)),
      );
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  // UI permissions do not replace the API's server-side AdminGuard.
  isAdmin(): boolean {
    return this.auth.cachedSession?.user.role === ADMIN_ROLE;
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const response = await firstValueFrom(this.docs.load());
      this.guide.set(response.data);
    } catch {
      this.error.set('โหลดคู่มือไม่ได้ ตรวจสอบการเชื่อมต่อแล้วลองใหม่');
    } finally {
      this.loading.set(false);
    }
  }

  startEditing(): void {
    if (!this.isAdmin()) {
      this.error.set('เฉพาะ admin เท่านั้นที่แก้ไขคู่มือได้');
      return;
    }
    const guide = this.guide();
    if (!guide || this.saving()) return;
    this.draft.set(guide.content);
    this.editing.set(true);
    this.tab.set('source');
    this.notice.set('');
    this.error.set('');
  }

  setDraft(event: Event): void {
    if (event.target instanceof HTMLTextAreaElement) this.draft.set(event.target.value);
  }

  async save(): Promise<void> {
    const guide = this.guide();
    if (!guide || !this.canSave()) {
      this.error.set('ต้องเป็น admin และมีเนื้อหาที่แก้ไข ไม่ว่าง และไม่เกินกำหนด');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    try {
      const response = await firstValueFrom(
        this.docs.save({ content: this.draft(), updatedAt: guide.updatedAt }),
      );
      this.guide.set(response.data);
      this.editing.set(false);
      this.tab.set('preview');
      this.notice.set('บันทึกคู่มือแล้ว');
    } catch (error: unknown) {
      this.error.set(
        error instanceof HttpErrorResponse && error.status === CONFLICT_STATUS
          ? 'คู่มือถูกแก้ไขโดย admin คนอื่นแล้ว ดาวน์โหลดฉบับร่างก่อนยกเลิกและโหลดฉบับล่าสุด'
          : 'บันทึกไม่ได้ ตรวจสอบสิทธิ์และการเชื่อมต่อ ฉบับร่างของคุณยังอยู่',
      );
    } finally {
      this.saving.set(false);
    }
  }

  async cancel(): Promise<void> {
    if (!(await this.canLeave())) return;
    this.editing.set(false);
    this.tab.set('preview');
    this.error.set('');
  }

  async canLeave(): Promise<boolean> {
    if (this.saving()) return false;
    if (!this.dirty()) return true;
    return firstValueFrom(
      this.confirm.confirm({
        title: 'ทิ้งฉบับร่าง?',
        message: 'ข้อความที่ยังไม่บันทึกจะหายไป ดาวน์โหลดฉบับร่างก่อนหากต้องการเก็บไว้',
        confirmText: 'ทิ้งฉบับร่าง',
        cancelText: 'แก้ไขต่อ',
      }),
    );
  }

  download(): void {
    downloadMarkdown(this.source());
  }

  @HostListener('window:beforeunload', ['$event'])
  beforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty() || this.saving()) event.preventDefault();
  }
}
