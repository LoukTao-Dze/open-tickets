import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Scene, SceneStatus, TestSuite } from '../../services/scene.service';
import { ConfirmDialogService } from '../../shared/confirm-dialog/confirm-dialog.service';
import { ScenesComponent } from './scenes.component';

describe('ScenesComponent', () => {
  let http: HttpTestingController;
  const confirm = vi.fn(() => of(false));
  const projectsUrl = `${environment.apiBaseUrl}/api/projects`;
  const sceneUrl = `${projectsUrl}/project-1/scenes`;
  const boardUrl = `${environment.apiBaseUrl}/api/kanban/board?projectId=project-1`;
  const suitesUrl = `${projectsUrl}/project-1/test-suites`;
  const suite = {
    id: 'suite-1',
    projectId: 'project-1',
    name: 'Login tests',
    description: '',
    createdAt: '2026-01-01',
    lastSceneUpdateAt: null,
    kanbanTicketIds: [],
  };
  const modal = () => document.querySelector<HTMLElement>('app-suite-form-modal');
  const sceneModal = () => document.querySelector<HTMLElement>('app-scene-form-modal');
  const typeInto = (field: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    field.value = value;
    field.dispatchEvent(new Event('input'));
  };
  const fillModal = (name: string, description: string) => {
    typeInto(modal()!.querySelector('input')!, name);
    typeInto(modal()!.querySelector('textarea')!, description);
  };
  const submitModal = () =>
    modal()!
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
  const fillSceneModal = (sceneNo: string, test: string) => {
    typeInto(
      sceneModal()!.querySelector('[formControlName="sceneNo"]') as HTMLInputElement,
      sceneNo,
    );
    typeInto(sceneModal()!.querySelector('[formControlName="test"]') as HTMLInputElement, test);
  };
  const submitSceneModal = () =>
    sceneModal()!
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
  const setSceneSelect = (name: string, value: string) => {
    const select = sceneModal()!.querySelector<HTMLSelectElement>(`[formControlName="${name}"]`)!;
    select.value = value;
    select.dispatchEvent(new Event('change'));
  };
  const makeScene = (id: string, status: SceneStatus) => ({
    id,
    suiteId: suite.id,
    projectId: 'project-1',
    sceneNo: id,
    test: 'Test',
    status,
    detailsIssue: '',
    expectedResult: '',
    action: '',
    dataTest: '',
    remark: '',
    createdAt: '2026-01-01',
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScenesComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfirmDialogService, useValue: { confirm } },
      ],
    }).compileComponents();
    confirm.mockReset();
    confirm.mockReturnValue(of(false));
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function loadFixture(
    scenes: Scene[] = [],
    suites: TestSuite[] = [suite],
    projects = [{ id: 'project-1', project_name: 'Project' }],
  ) {
    const fixture = TestBed.createComponent(ScenesComponent);
    fixture.detectChanges();
    http.expectOne(`${projectsUrl}/get-projects`).flush({ data: projects });
    http.expectOne(sceneUrl).flush({ data: { scenes, suites, canEdit: true } });
    fixture.detectChanges();
    return fixture;
  }

  it('shows status counts and percentages for the selected project', () => {
    const fixture = TestBed.createComponent(ScenesComponent);
    fixture.detectChanges();
    http
      .expectOne(`${projectsUrl}/get-projects`)
      .flush({ data: [{ id: 'project-1', project_name: 'Project' }] });
    http.expectOne(sceneUrl).flush({
      data: {
        suites: [suite],
        scenes: [
          makeScene('1', SceneStatus.Pass),
          makeScene('2', SceneStatus.InProgress),
          makeScene('3', SceneStatus.NotStart),
          makeScene('4', SceneStatus.Pass),
        ],
        canEdit: true,
      },
    });
    fixture.detectChanges();

    fixture.componentInstance.selectSuite(suite.id);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(fixture.componentInstance.percent(SceneStatus.Pass)).toBe(50);
    expect(fixture.componentInstance.percent(SceneStatus.InProgress)).toBe(25);
    expect(fixture.componentInstance.percent(SceneStatus.NotStart)).toBe(25);
    expect(fixture.nativeElement.textContent).toContain('2 of 4 scenes');
  });

  it('reports zero percentages and hides editing when access is read-only', () => {
    const fixture = TestBed.createComponent(ScenesComponent);
    fixture.detectChanges();
    http
      .expectOne(`${projectsUrl}/get-projects`)
      .flush({ data: [{ id: 'project-1', project_name: 'Project' }] });
    http.expectOne(sceneUrl).flush({ data: { scenes: [], suites: [suite], canEdit: false } });
    fixture.componentInstance.selectSuite(suite.id);
    fixture.detectChanges();
    expect(fixture.componentInstance.percent(SceneStatus.Pass)).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('View only');
    expect(fixture.nativeElement.textContent).not.toContain('Add scene');
    expect(fixture.nativeElement.textContent).not.toContain('Add suite');
    expect(fixture.nativeElement.textContent).not.toContain('Edit suite');
    expect(fixture.nativeElement.textContent).not.toContain('Delete suite');
  });

  it('shows scene details and opens the selected scene in the edit modal', async () => {
    const fixture = TestBed.createComponent(ScenesComponent);
    fixture.detectChanges();
    http
      .expectOne(`${projectsUrl}/get-projects`)
      .flush({ data: [{ id: 'project-1', project_name: 'Project' }] });
    http.expectOne(sceneUrl).flush({
      data: {
        suites: [suite],
        scenes: [
          {
            ...makeScene('SC-01', SceneStatus.InProgress),
            detailsIssue: 'Sign in fails',
            expectedResult: 'User can sign in',
            action: 'Submit credentials',
            dataTest: 'Test account',
            remark: 'Retry once',
          },
        ],
        canEdit: true,
      },
    });

    fixture.componentInstance.selectSuite(suite.id);
    fixture.detectChanges();
    const details = fixture.nativeElement.querySelector('.scene-details') as HTMLElement;
    expect(details.textContent).toContain('Sign in fails');
    expect(details.textContent).toContain('User can sign in');
    expect(details.textContent).toContain('Submit credentials');
    expect(details.textContent).toContain('Test account');
    expect(details.textContent).toContain('Retry once');
    details.querySelector<HTMLButtonElement>('.detail-actions button')?.click();
    TestBed.tick();
    expect(sceneModal()?.textContent).toContain('Edit scene');
    expect(
      (sceneModal()!.querySelector('[formControlName="detailsIssue"]') as HTMLTextAreaElement)
        .value,
    ).toBe('Sign in fails');
    sceneModal()!.querySelector<HTMLButtonElement>('.modal-close')!.click();
    await vi.waitFor(() => expect(sceneModal()).toBeNull());
  });

  it('adds and removes suite card references and renders their links', async () => {
    const fixture = loadFixture([makeScene('SC-01', SceneStatus.NotStart)]);
    const component = fixture.componentInstance;
    component.selectSuite(suite.id);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    component.openSuiteModal(component.selectedSuite);
    TestBed.tick();
    http.expectOne(boardUrl).flush({
      data: [
        {
          tickets: [
            { id: 'DS1', title: 'First card', project: { id: 'project-1' } },
            { id: 'DS2', title: 'Second card', project: { id: 'project-1' } },
            { id: 'DS3', title: 'Other project', project: { id: 'project-2' } },
          ],
        },
      ],
    });
    TestBed.tick();
    const options = modal()!.querySelectorAll('.ticket-options input');
    expect(options).toHaveLength(2);
    (options[0] as HTMLInputElement).click();
    (options[1] as HTMLInputElement).click();
    submitModal();
    const request = http.expectOne(`${suitesUrl}/${suite.id}`);
    expect(request.request.body.kanbanTicketIds).toEqual(['DS1', 'DS2']);
    request.flush({
      data: { ...suite, kanbanTicketIds: ['DS1', 'DS2'] },
    });
    await vi.waitFor(() => expect(modal()).toBeNull());
    fixture.detectChanges();
    const links = fixture.nativeElement.querySelectorAll('.suite-references a');
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute('href')).toBe('/kanban?ticket=DS1');
    expect(links[1].getAttribute('href')).toBe('/kanban?ticket=DS2');
    component.openSuiteModal(component.selectedSuite);
    TestBed.tick();
    http.expectOne(boardUrl).flush({
      data: [
        {
          tickets: [
            { id: 'DS1', title: 'First card', project: { id: 'project-1' } },
            { id: 'DS2', title: 'Second card', project: { id: 'project-1' } },
          ],
        },
      ],
    });
    TestBed.tick();
    (modal()!.querySelector('.ticket-options input') as HTMLInputElement).click();
    submitModal();
    const update = http.expectOne(`${suitesUrl}/${suite.id}`);
    expect(update.request.body.kanbanTicketIds).toEqual(['DS2']);
    update.flush({ data: { ...suite, kanbanTicketIds: ['DS2'] } });
    await vi.waitFor(() => expect(modal()).toBeNull());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.suite-references a')).toHaveLength(1);
  });

  it('keeps references and blocks saving when card loading fails', async () => {
    const fixture = loadFixture([], [{ ...suite, kanbanTicketIds: ['DS1'] }]);
    const component = fixture.componentInstance;
    component.selectSuite(suite.id);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    component.openSuiteModal(component.selectedSuite);
    TestBed.tick();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    http.expectOne(boardUrl).flush({}, { status: 500, statusText: 'Server error' });
    TestBed.tick();
    expect(modal()?.textContent).toContain('Could not load');
    expect((modal()!.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(
      true,
    );
    (modal()!.querySelector('.ticket-references button') as HTMLButtonElement).click();
    http.expectOne(boardUrl).flush({ data: [] });
    TestBed.tick();
    const unavailable = modal()!.querySelector('.ticket-options input') as HTMLInputElement;
    expect(unavailable.checked).toBe(true);
    unavailable.click();
    submitModal();
    const request = http.expectOne(`${suitesUrl}/${suite.id}`);
    expect(request.request.body.kanbanTicketIds).toEqual([]);
    request.flush({ data: suite });
    await vi.waitFor(() => expect(modal()).toBeNull());
    vi.restoreAllMocks();
  });

  it('changes a scene status only after pressing Update status', () => {
    const fixture = TestBed.createComponent(ScenesComponent);
    fixture.detectChanges();
    http
      .expectOne(`${projectsUrl}/get-projects`)
      .flush({ data: [{ id: 'project-1', project_name: 'Project' }] });
    http.expectOne(sceneUrl).flush({
      data: {
        scenes: [makeScene('SC-01', SceneStatus.NotStart)],
        suites: [suite],
        canEdit: true,
      },
    });
    fixture.componentInstance.selectSuite(suite.id);
    fixture.detectChanges();

    const details = fixture.nativeElement.querySelector('details') as HTMLDetailsElement;
    details.open = true;
    const buttons = fixture.nativeElement.querySelectorAll('.status-options button');
    const update = fixture.nativeElement.querySelector('.update-status') as HTMLButtonElement;
    expect(update.disabled).toBe(true);
    (buttons[2] as HTMLButtonElement).click();
    fixture.detectChanges();
    http.expectNone(`${sceneUrl}/SC-01/status`);
    expect(fixture.componentInstance.scenes[0].status).toBe(SceneStatus.NotStart);
    expect(update.disabled).toBe(false);

    update.click();
    const request = http.expectOne(`${sceneUrl}/SC-01/status`);
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ status: SceneStatus.Pass });
    request.flush({ data: makeScene('SC-01', SceneStatus.Pass) });
    fixture.detectChanges();

    expect(fixture.componentInstance.scenes[0].status).toBe(SceneStatus.Pass);
    expect(fixture.componentInstance.percent(SceneStatus.Pass)).toBe(100);
    expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
    expect(update.disabled).toBe(true);
    expect(details.open).toBe(true);
  });

  it('keeps the selection and old status when the status update fails', () => {
    const fixture = TestBed.createComponent(ScenesComponent);
    fixture.detectChanges();
    http
      .expectOne(`${projectsUrl}/get-projects`)
      .flush({ data: [{ id: 'project-1', project_name: 'Project' }] });
    http.expectOne(sceneUrl).flush({
      data: {
        scenes: [makeScene('SC-01', SceneStatus.NotStart)],
        suites: [suite],
        canEdit: true,
      },
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const component = fixture.componentInstance;
    component.chooseStatus(component.scenes[0], SceneStatus.Pass);
    component.updateStatus(component.scenes[0]);
    http
      .expectOne(`${sceneUrl}/SC-01/status`)
      .flush({}, { status: 500, statusText: 'Server error' });

    expect(component.scenes[0].status).toBe(SceneStatus.NotStart);
    expect(component.selectedStatus(component.scenes[0])).toBe(SceneStatus.Pass);
    expect(component.error).toContain('Could not update the status');
    expect(component.statusSavingId).toBeNull();
    vi.restoreAllMocks();
  });

  it('hides status controls for read-only access', () => {
    const fixture = TestBed.createComponent(ScenesComponent);
    fixture.detectChanges();
    http
      .expectOne(`${projectsUrl}/get-projects`)
      .flush({ data: [{ id: 'project-1', project_name: 'Project' }] });
    http.expectOne(sceneUrl).flush({
      data: {
        scenes: [makeScene('SC-01', SceneStatus.NotStart)],
        suites: [suite],
        canEdit: false,
      },
    });
    fixture.componentInstance.selectSuite(suite.id);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.status-options')).toBeNull();
    expect(fixture.nativeElement.querySelector('.detail-actions')).toBeNull();
  });

  it('keeps the modal draft after a failed save and updates the summary after retrying', async () => {
    const fixture = loadFixture();
    fixture.componentInstance.selectSuite(suite.id);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    fixture.componentInstance.openSceneModal();
    TestBed.tick();
    fillSceneModal('SC-01', 'Sign in');
    setSceneSelect('status', SceneStatus.Pass);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    submitSceneModal();
    http.expectOne(sceneUrl).flush({}, { status: 500, statusText: 'Server error' });
    TestBed.tick();
    expect(sceneModal()?.textContent).toContain('Could not save this scene');
    expect(
      (sceneModal()!.querySelector('[formControlName="test"]') as HTMLInputElement).value,
    ).toBe('Sign in');

    submitSceneModal();
    http
      .expectOne(sceneUrl)
      .flush({ data: { ...makeScene('SC-01', SceneStatus.Pass), test: 'Sign in' } });
    await vi.waitFor(() => expect(sceneModal()).toBeNull());
    fixture.detectChanges();
    expect(fixture.componentInstance.percent(SceneStatus.Pass)).toBe(100);
    vi.restoreAllMocks();
  });

  it('lists suites first and shows only scenes in the selected suite', () => {
    const secondSuite = { ...suite, id: 'suite-2', name: 'Checkout tests' };
    const fixture = loadFixture(
      [
        makeScene('Sign in', SceneStatus.Pass),
        { ...makeScene('Checkout', SceneStatus.NotStart), suiteId: secondSuite.id },
        { ...makeScene('Legacy', SceneStatus.InProgress), suiteId: null },
      ],
      [suite, secondSuite],
    );
    const component = fixture.componentInstance;
    const suiteRows = fixture.nativeElement.querySelectorAll('.suite-row');
    expect(suiteRows).toHaveLength(3);
    expect(suiteRows[0].textContent).toContain('1 scene');
    expect(fixture.nativeElement.querySelector('.scene-list')).toBeNull();
    (suiteRows[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.visibleScenes.map((scene) => scene.id)).toEqual(['Sign in']);
    expect(component.percent(SceneStatus.Pass)).toBe(100);
    expect(fixture.nativeElement.querySelector('.scene-list').textContent).not.toContain(
      'Checkout',
    );
    component.chooseStatus(component.scenes[0], SceneStatus.InProgress);
    const scenes = component.scenes;
    (fixture.nativeElement.querySelector('.suite-bar > button') as HTMLButtonElement).click();
    http.expectOne(sceneUrl).flush({
      data: { scenes, suites: [suite, secondSuite], canEdit: true },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.scene-list')).toBeNull();
    (fixture.nativeElement.querySelectorAll('.suite-row')[1] as HTMLButtonElement).click();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(component.pendingStatus).toEqual({});
    expect(component.visibleScenes.map((scene) => scene.id)).toEqual(['Checkout']);
    expect(component.percent(SceneStatus.NotStart)).toBe(100);
    component.selectSuite(null);
    http.expectOne(sceneUrl).flush({
      data: {
        scenes: [
          makeScene('Sign in', SceneStatus.Pass),
          { ...makeScene('Checkout', SceneStatus.NotStart), suiteId: secondSuite.id },
          { ...makeScene('Legacy', SceneStatus.InProgress), suiteId: null },
        ],
        suites: [suite, secondSuite],
        canEdit: true,
      },
    });
    component.selectSuite('');
    expect(component.visibleScenes.map((scene) => scene.id)).toEqual(['Legacy']);
  });

  it('shows each suite status percentages and dates, and refreshes activity on return', () => {
    const fixture = loadFixture(
      [
        makeScene('1', SceneStatus.Pass),
        makeScene('2', SceneStatus.Pass),
        makeScene('3', SceneStatus.InProgress),
      ],
      [suite, { ...suite, id: 'empty', name: 'Empty suite' }],
    );
    const rows = fixture.nativeElement.querySelectorAll('.suite-row');
    expect(rows[0].querySelector('[data-status="pass"] strong').textContent).toBe('67%');
    expect(rows[0].querySelector('[data-status="in-progress"] strong').textContent).toBe('33%');
    expect(rows[0].querySelector('[data-status="not-start"] strong').textContent).toBe('0%');
    expect(rows[0].textContent).toContain('Created Jan 1, 2026');
    expect(rows[0].textContent).toContain('Last update Not recorded');
    expect(rows[1].querySelector('[data-status="pass"] strong').textContent).toBe('0%');

    (rows[0] as HTMLButtonElement).click();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.suite-bar > button') as HTMLButtonElement).click();
    http.expectOne(sceneUrl).flush({
      data: {
        scenes: [],
        suites: [{ ...suite, lastSceneUpdateAt: '2026-02-02T10:00:00Z' }],
        canEdit: true,
      },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.suite-row').textContent).toContain('Feb 2, 2026');
  });

  it('requires a suite in the edit modal when assigning a legacy scene', async () => {
    const legacy = { ...makeScene('Legacy', SceneStatus.Pass), suiteId: null };
    const fixture = loadFixture([legacy]);
    const component = fixture.componentInstance;
    component.selectSuite('');
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    component.openSceneModal(legacy);
    TestBed.tick();
    submitSceneModal();
    TestBed.tick();
    http.expectNone(`${sceneUrl}/Legacy`);
    expect(sceneModal()?.textContent).toContain('Choose a test suite.');
    setSceneSelect('suiteId', suite.id);
    submitSceneModal();
    const request = http.expectOne(`${sceneUrl}/Legacy`);
    expect(request.request.body.suiteId).toBe(suite.id);
    request.flush({ data: { ...legacy, suiteId: suite.id } });
    await vi.waitFor(() => expect(sceneModal()).toBeNull());
    expect(component.unassignedCount).toBe(0);
    expect(component.suiteId).toBe(suite.id);
    expect(component.visibleScenes).toHaveLength(1);
  });

  it('preserves legacy scenes and offers suite creation without allowing new unassigned scenes', () => {
    const fixture = loadFixture(
      [{ ...makeScene('Legacy', SceneStatus.NotStart), suiteId: null }],
      [],
    );
    expect(fixture.nativeElement.textContent).toContain('Scenes awaiting a suite');
    expect(fixture.nativeElement.textContent).toContain('Add suite');
    expect(fixture.nativeElement.textContent).not.toContain('Add scene');
    expect(fixture.componentInstance.unassignedCount).toBe(1);
  });

  it('creates and edits a suite with a description in a modal, then deletes it when empty', async () => {
    const fixture = loadFixture([], []);
    const component = fixture.componentInstance;
    component.openSuiteModal();
    TestBed.tick();
    http.expectOne(boardUrl).flush({ data: [] });
    expect(modal()?.textContent).toContain('New test suite');
    fillModal('  Login tests  ', '  Covers sign-in  ');
    submitModal();
    const create = http.expectOne(suitesUrl);
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({
      name: 'Login tests',
      description: 'Covers sign-in',
      kanbanTicketIds: [],
    });
    create.flush({ data: { ...suite, description: 'Covers sign-in' } });
    await vi.waitFor(() => expect(modal()).toBeNull());
    expect(component.suiteId).toBe(suite.id);

    component.openSuiteModal(component.selectedSuite);
    TestBed.tick();
    http.expectOne(boardUrl).flush({ data: [] });
    expect(modal()?.textContent).toContain('Edit test suite');
    expect(modal()!.querySelector('input')!.value).toBe('Login tests');
    expect(modal()!.querySelector('textarea')!.value).toBe('Covers sign-in');
    fillModal('Regression tests', '');
    submitModal();
    const update = http.expectOne(`${suitesUrl}/${suite.id}`);
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual({
      name: 'Regression tests',
      description: '',
      kanbanTicketIds: [],
    });
    update.flush({ data: { ...suite, name: 'Regression tests', description: '' } });
    await vi.waitFor(() => expect(modal()).toBeNull());
    expect(component.selectedSuite?.name).toBe('Regression tests');

    confirm.mockReturnValueOnce(of(true));
    component.deleteSuite();
    expect(confirm).toHaveBeenCalledWith({
      title: 'Delete test suite?',
      message: 'Really delete Regression tests? This cannot be undone.',
      confirmText: 'Delete',
      config: { confirmColor: 'error' },
    });
    const deletion = http.expectOne(`${suitesUrl}/${suite.id}`);
    expect(deletion.request.method).toBe('DELETE');
    deletion.flush({ data: { id: suite.id } });
    expect(component.suites).toEqual([]);
    expect(component.suiteId).toBeNull();
  });

  it('moves an edited suite and its view to the selected project', async () => {
    const fixture = loadFixture(
      [],
      [suite],
      [
        { id: 'project-1', project_name: 'Project' },
        { id: 'project-2', project_name: 'Destination' },
      ],
    );
    const component = fixture.componentInstance;
    component.selectSuite(suite.id);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const reloadScenes = vi.spyOn(component, 'loadScenes').mockImplementation(() => undefined);
    component.openSuiteModal(component.selectedSuite);
    TestBed.tick();
    http.expectOne(boardUrl).flush({ data: [] });
    const projectSelect = modal()!.querySelector('select') as HTMLSelectElement;
    projectSelect.value = 'project-2';
    projectSelect.dispatchEvent(new Event('change'));
    http.expectOne(`${environment.apiBaseUrl}/api/kanban/board?projectId=project-2`).flush({
      data: [
        {
          tickets: [
            {
              id: 'DS2',
              title: 'Destination card',
              project: { id: 'project-2' },
            },
          ],
        },
      ],
    });
    TestBed.tick();
    (modal()!.querySelector('.ticket-options input') as HTMLInputElement).click();
    fillModal('Login tests', 'Moved suite');
    submitModal();
    const update = http.expectOne(`${suitesUrl}/${suite.id}`);
    expect(update.request.body).toEqual({
      name: 'Login tests',
      description: 'Moved suite',
      kanbanTicketIds: ['DS2'],
      projectId: 'project-2',
    });
    update.flush({ data: { ...suite, projectId: 'project-2', kanbanTicketIds: ['DS2'] } });
    await vi.waitFor(() => expect(modal()).toBeNull());
    fixture.detectChanges();
    expect(component.projectId).toBe('project-2');
    expect(reloadScenes).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('requires a suite name before saving in the modal', () => {
    const component = loadFixture().componentInstance;
    component.openSuiteModal();
    TestBed.tick();
    http.expectOne(boardUrl).flush({ data: [] });
    fillModal('   ', 'Notes only');
    submitModal();
    http.expectNone(suitesUrl);
    TestBed.tick();
    expect(modal()?.textContent).toContain('Enter a suite name.');
  });

  it('keeps the modal and its values open after a failed suite save', async () => {
    const component = loadFixture().componentInstance;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    component.openSuiteModal();
    TestBed.tick();
    http.expectOne(boardUrl).flush({ data: [] });
    fillModal('Smoke tests', 'Quick checks');
    submitModal();
    http.expectOne(suitesUrl).flush({}, { status: 500, statusText: 'Server error' });
    TestBed.tick();
    expect(modal()?.textContent).toContain('Could not save this suite');
    expect(modal()!.querySelector('input')!.value).toBe('Smoke tests');
    expect(modal()!.querySelector('textarea')!.value).toBe('Quick checks');
    expect(component.suites).toEqual([suite]);
    modal()!.querySelector<HTMLButtonElement>('.secondary-button')!.click();
    await vi.waitFor(() => expect(modal()).toBeNull());
    vi.restoreAllMocks();
  });

  it('shows the suite description in the list and inside the suite', () => {
    const fixture = loadFixture([], [{ ...suite, description: 'Covers sign-in and sign-out' }]);
    const row = fixture.nativeElement.querySelector('.suite-row') as HTMLButtonElement;
    expect(row.querySelector('.suite-description')?.textContent).toContain(
      'Covers sign-in and sign-out',
    );
    row.click();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.scene-list .suite-description')?.textContent,
    ).toContain('Covers sign-in and sign-out');
  });

  it('blocks populated suite deletion and handles a concurrent scene preventing deletion', () => {
    const fixture = loadFixture([makeScene('SC-01', SceneStatus.NotStart)]);
    const component = fixture.componentInstance;
    component.selectSuite(suite.id);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    (
      fixture.nativeElement.querySelectorAll('.suite-actions button')[1] as HTMLButtonElement
    ).click();
    http.expectNone(`${suitesUrl}/${suite.id}`);
    expect(component.error).toContain('Move or delete all scenes');
    expect(confirm).not.toHaveBeenCalled();
    component.scenes = [];
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    confirm.mockReturnValueOnce(of(true));
    component.deleteSuite();
    http.expectOne(`${suitesUrl}/${suite.id}`).flush({}, { status: 409, statusText: 'Conflict' });
    expect(component.suites).toEqual([suite]);
    expect(component.error).toContain('Reload, then move or delete');
    vi.restoreAllMocks();
  });

  it('uses the shared confirmation for scene deletion and empty suite deletion', () => {
    const fixture = loadFixture([makeScene('SC-01', SceneStatus.Pass)]);
    (fixture.nativeElement.querySelector('.suite-row') as HTMLButtonElement).click();
    fixture.detectChanges();
    const deleteButton = fixture.nativeElement.querySelectorAll(
      '.detail-actions button',
    )[1] as HTMLButtonElement;
    deleteButton.click();
    fixture.detectChanges();
    http.expectNone(`${sceneUrl}/SC-01`);
    expect(confirm).toHaveBeenCalledWith({
      title: 'Delete scene?',
      message: 'Delete SC-01? This scene will be permanently deleted.',
      confirmText: 'Delete scene',
      config: { confirmColor: 'error' },
    });

    confirm.mockReturnValueOnce(of(true));
    deleteButton.click();
    fixture.detectChanges();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failedRequest = http.expectOne(`${sceneUrl}/SC-01`);
    expect(failedRequest.request.method).toBe('DELETE');
    expect(fixture.componentInstance.contextLocked).toBe(true);
    failedRequest.flush({}, { status: 500, statusText: 'Server error' });
    fixture.detectChanges();
    expect(fixture.componentInstance.visibleScenes).toHaveLength(1);
    expect(fixture.nativeElement.textContent).toContain('Could not delete this scene');

    confirm.mockReturnValueOnce(of(true));
    deleteButton.click();
    http.expectOne(`${sceneUrl}/SC-01`).flush({ data: { id: 'SC-01' } });
    fixture.detectChanges();
    expect(fixture.componentInstance.visibleScenes).toHaveLength(0);
    expect(fixture.componentInstance.percent(SceneStatus.Pass)).toBe(0);
    const suiteDelete = fixture.nativeElement.querySelectorAll(
      '.suite-actions button',
    )[1] as HTMLButtonElement;
    suiteDelete.click();
    fixture.detectChanges();
    confirm.mockReturnValueOnce(of(true));
    suiteDelete.click();
    http.expectOne(`${suitesUrl}/${suite.id}`).flush({ data: { id: suite.id } });
    expect(fixture.componentInstance.suites).toEqual([]);
    vi.restoreAllMocks();
  });

  it('allows deleting unassigned scenes even when there are no suites', () => {
    const fixture = loadFixture(
      [{ ...makeScene('Legacy', SceneStatus.NotStart), suiteId: null }],
      [],
    );
    (fixture.nativeElement.querySelector('.suite-row') as HTMLButtonElement).click();
    fixture.detectChanges();
    confirm.mockReturnValueOnce(of(true));
    (fixture.nativeElement.querySelector('.detail-actions button') as HTMLButtonElement).click();
    http.expectOne(`${sceneUrl}/Legacy`).flush({ data: { id: 'Legacy' } });
    expect(fixture.componentInstance.unassignedCount).toBe(0);
    expect(fixture.componentInstance.suiteId).toBeNull();
  });

  it('does not replace another project suites with a late response', () => {
    const fixture = TestBed.createComponent(ScenesComponent);
    fixture.detectChanges();
    http.expectOne(`${projectsUrl}/get-projects`).flush({
      data: [
        { id: 'project-1', project_name: 'First project' },
        { id: 'project-2', project_name: 'Second project' },
      ],
    });
    const firstRequest = http.expectOne(sceneUrl);
    const component = fixture.componentInstance;
    component.projectId = 'project-2';
    component.loadScenes();
    const secondSuite = { ...suite, id: 'suite-2', projectId: 'project-2' };
    http.expectOne(`${projectsUrl}/project-2/scenes`).flush({
      data: { scenes: [], suites: [secondSuite], canEdit: false },
    });
    firstRequest.flush({ data: { scenes: [], suites: [suite], canEdit: true } });
    expect(component.suites).toEqual([secondSuite]);
    expect(component.suiteId).toBeNull();
    expect(component.canEdit).toBe(false);
    expect(component.loadingScenes).toBe(false);
  });
});
