import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../services/auth.service';
import { DocsService, GuideResponse } from '../../services/docs.service';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { DocsComponent } from './docs.component';

describe('DocsComponent', () => {
  const guide = { content: '# Guide\n\n**Read me**', updatedAt: '2026-11-08T08:00:00Z' };
  const docs = { load: vi.fn(), save: vi.fn() };
  const confirm = vi.fn();
  const auth = {
    cachedSession: { user: { role: 'admin' }, expires_at: '2099-01-01T00:00:00Z' },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    auth.cachedSession.user.role = 'admin';
    docs.load.mockReturnValue(of({ data: guide }));
    docs.save.mockReturnValue(of({ data: { ...guide, content: '# Updated' } }));
    confirm.mockReturnValue(of(true));
    await TestBed.configureTestingModule({
      imports: [DocsComponent],
      providers: [
        { provide: DocsService, useValue: docs },
        { provide: AuthService, useValue: auth },
        { provide: ConfirmDialogService, useValue: { confirm } },
      ],
    }).compileComponents();
  });

  async function render() {
    const fixture = TestBed.createComponent(DocsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('renders headings, tables, tasks and code while removing executable HTML', async () => {
    docs.load.mockReturnValue(
      of({
        data: {
          ...guide,
          content:
            '# Guide\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n- [x] Done\n\n```ts\nconst value = 1;\n```\n\n' +
            '<script>alert(1)</script><img src="x" onerror="alert(1)">[bad](javascript:alert(1))',
        },
      }),
    );
    const fixture = await render();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('article h1')?.textContent).toBe('Guide');
    expect(element.querySelector('table td')?.textContent).toBe('1');
    expect(element.querySelector('input[type="checkbox"]')).toBeTruthy();
    expect(element.querySelector('pre code')?.textContent).toContain('const value');
    expect(element.querySelector('script, [onerror], a[href^="javascript:"]')).toBeNull();
  });

  it.each(['user', 'guest', 'custom-editor'])('shows read-only UI for %s', async (role) => {
    auth.cachedSession.user.role = role;
    const fixture = await render();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('แก้ไขคู่มือ');
    fixture.componentInstance.startEditing();
    expect(fixture.componentInstance.editing()).toBe(false);
    expect(fixture.componentInstance.error()).toContain('admin');
  });

  it('shows source as text, not active HTML', async () => {
    docs.load.mockReturnValue(of({ data: { ...guide, content: '<script>alert(1)</script>' } }));
    const fixture = await render();
    fixture.componentInstance.tab.set('source');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.docs-source')?.textContent).toContain('<script>');
    expect(element.querySelector('script')).toBeNull();
  });

  it('downloads the published guide or current draft without saving', async () => {
    const component = (await render()).componentInstance;
    const createObjectURL = vi.fn(() => 'blob:docs-download');
    const revokeObjectURL = vi.fn();
    const filenames: string[] = [];
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      filenames.push(this.download);
    });
    try {
      component.download();
      component.startEditing();
      component.draft.set('# Draft');
      component.download();
      expect(filenames).toEqual(['Guide.md', 'Draft.md']);
      expect(createObjectURL).toHaveBeenCalledTimes(2);
      expect(revokeObjectURL).toHaveBeenCalledTimes(2);
      expect(docs.save).not.toHaveBeenCalled();
    } finally {
      click.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('previews a draft then publishes it with the original concurrency token', async () => {
    const fixture = await render();
    const component = fixture.componentInstance;
    component.startEditing();
    component.draft.set('# Updated');
    component.tab.set('preview');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('article h1')?.textContent).toBe(
      'Updated',
    );
    await component.save();
    expect(docs.save).toHaveBeenCalledWith({ ...guide, content: '# Updated' });
    expect(component.editing()).toBe(false);
    expect(component.notice()).toContain('บันทึกคู่มือแล้ว');
  });

  it.each([0, 403, 409, 500])('preserves the draft on failed save %s', async (status) => {
    docs.save.mockReturnValue(throwError(() => new HttpErrorResponse({ status })));
    const component = (await render()).componentInstance;
    component.startEditing();
    component.draft.set('# Unsaved');
    await component.save();
    expect(component.draft()).toBe('# Unsaved');
    expect(component.editing()).toBe(true);
    expect(component.saving()).toBe(false);
    expect(component.error()).toContain(status === 409 ? 'admin คนอื่น' : 'บันทึกไม่ได้');
  });

  it('requires valid changed content and respects the exact length limit', async () => {
    const component = (await render()).componentInstance;
    component.startEditing();
    expect(component.canSave()).toBe(false);
    component.draft.set(' \n ');
    expect(component.canSave()).toBe(false);
    component.draft.set('x'.repeat(component.maxLength));
    expect(component.canSave()).toBe(true);
    component.draft.set('x'.repeat(component.maxLength + 1));
    await component.save();
    expect(docs.save).not.toHaveBeenCalled();
    expect(component.error()).toBeTruthy();
  });

  it('does not allow a duplicate save or navigation while saving', async () => {
    const pending = new Subject<GuideResponse>();
    docs.save.mockReturnValue(pending);
    const component = (await render()).componentInstance;
    component.startEditing();
    component.draft.set('# Updated');
    const saving = component.save();
    await component.save();
    expect(docs.save).toHaveBeenCalledOnce();
    expect(await component.canLeave()).toBe(false);
    pending.next({ data: { ...guide, content: '# Updated' } });
    pending.complete();
    await saving;
    expect(component.saving()).toBe(false);
  });

  it('confirms discard on cancel and navigation and protects page unload', async () => {
    const component = (await render()).componentInstance;
    component.startEditing();
    component.draft.set('# Unsaved');
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    component.beforeUnload(event);
    expect(event.defaultPrevented).toBe(true);
    confirm.mockReturnValue(of(false));
    await component.cancel();
    expect(component.dirty()).toBe(true);
    confirm.mockReturnValue(of(true));
    await component.cancel();
    expect(component.editing()).toBe(false);
    expect(await component.canLeave()).toBe(true);
  });

  it('shows a retry when the initial load fails', async () => {
    docs.load.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 500 })));
    const fixture = await render();
    const component = fixture.componentInstance;
    expect(component.error()).toContain('โหลดคู่มือไม่ได้');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('ลองโหลดใหม่');
    docs.load.mockReturnValue(of({ data: guide }));
    await component.load();
    expect(component.guide()).toEqual(guide);
  });
});

describe('DocsService', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('sends credentials for reads and writes and passes the concurrency token unchanged', () => {
    const service = TestBed.inject(DocsService);
    service.load().subscribe();
    const load = http.expectOne((request) => request.url.endsWith('/api/docs'));
    expect(load.request.method).toBe('GET');
    expect(load.request.withCredentials).toBe(true);
    load.flush({ data: { content: '# Guide', updatedAt: '2026-11-08T08:00:00Z' } });
    const guide = { content: '# New', updatedAt: '2026-11-08T08:00:00.123456+00:00' };
    service.save(guide).subscribe();
    const save = http.expectOne((request) => request.url.endsWith('/api/docs'));
    expect(save.request.method).toBe('PUT');
    expect(save.request.withCredentials).toBe(true);
    expect(save.request.body).toEqual(guide);
    save.flush({ data: guide });
  });
});
