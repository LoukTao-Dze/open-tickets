import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ProjectApiService } from '../../services/project.service';
import { MAIN_MENUS } from '../../shared/menu-access';
import { RolesComponent } from './roles.component';

describe('RolesComponent menu access', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RolesComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { cachedSession: { user: { role: 'admin' } } } },
        { provide: ProjectApiService, useValue: { getProjects: () => of([]) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('saves menu changes alongside existing project permissions', () => {
    const fixture = TestBed.createComponent(RolesComponent);
    fixture.detectChanges();
    const menus = MAIN_MENUS.map((menu) => menu.key);
    http.expectOne('/api/roles/permissions').flush({
      data: [
        {
          role: 'user',
          isSystem: true,
          description: null,
          canEdit: true,
          defaultAccess: 'edit',
          projectAccess: {},
          menuAccess: menus,
        },
        {
          role: 'guest',
          isSystem: true,
          description: null,
          canEdit: false,
          defaultAccess: 'view',
          projectAccess: {},
          menuAccess: menus,
        },
      ],
    });
    fixture.detectChanges();
    fixture.nativeElement.querySelector('#menu-access-heading').click();
    const workspaceSwitch = fixture.nativeElement.querySelector(
      '[aria-labelledby="menu-workspace"]',
    ) as HTMLButtonElement;
    expect(workspaceSwitch.getAttribute('aria-checked')).toBe('true');
    workspaceSwitch.click();
    fixture.detectChanges();
    expect(workspaceSwitch.getAttribute('aria-checked')).toBe('false');
    fixture.componentInstance.savePermissions();
    const save = http.expectOne('/api/roles/permissions');
    const guest = save.request.body.roles.find((role: { role: string }) => role.role === 'guest');
    expect(guest.menuAccess).not.toContain('workspace');
    expect(guest.projectAccess).toEqual({});
    save.flush({
      data: [
        { ...guest, isSystem: true, description: null },
        {
          role: 'user',
          isSystem: true,
          description: null,
          canEdit: true,
          defaultAccess: 'edit',
          projectAccess: {},
          menuAccess: menus,
        },
      ],
    });
  });

  it('does not allow edits after permissions fail to load', () => {
    const fixture = TestBed.createComponent(RolesComponent);
    fixture.detectChanges();
    http.expectOne('/api/roles/permissions').flush({}, { status: 500, statusText: 'Error' });
    fixture.detectChanges();
    expect(fixture.componentInstance.isEditable()).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'Permissions could not be loaded',
    );
    expect(fixture.nativeElement.querySelector('[aria-labelledby="menu-workspace"]')).toBeNull();
  });

  it('collapses each access section independently without discarding changes', () => {
    const fixture = TestBed.createComponent(RolesComponent);
    fixture.detectChanges();
    const menus = MAIN_MENUS.map((menu) => menu.key);
    http.expectOne('/api/roles/permissions').flush({
      data: [
        {
          role: 'guest',
          isSystem: true,
          description: null,
          canEdit: false,
          defaultAccess: 'view',
          projectAccess: {},
          menuAccess: menus,
        },
      ],
    });
    fixture.detectChanges();
    const sections = fixture.nativeElement.querySelectorAll(
      'details.access-section',
    ) as NodeListOf<HTMLDetailsElement>;
    const menuSection = sections[0];
    const projectSection = sections[1];
    const menuSwitch = menuSection.querySelector(
      '[aria-labelledby="menu-workspace"]',
    ) as HTMLButtonElement;
    expect(menuSection.open).toBe(false);
    expect(projectSection.open).toBe(false);
    menuSection.querySelector('summary')?.click();
    expect(menuSection.open).toBe(true);
    expect(projectSection.open).toBe(false);
    menuSwitch.click();
    fixture.detectChanges();

    projectSection.querySelector('summary')?.click();
    expect(projectSection.open).toBe(true);
    menuSection.querySelector('summary')?.click();
    expect(menuSection.open).toBe(false);
    expect(projectSection.open).toBe(true);
    projectSection.querySelector('summary')?.click();
    expect(projectSection.open).toBe(false);
    expect(menuSection.parentElement?.querySelector('.card-footer')?.textContent).toContain(
      'not direct API access',
    );
    expect(projectSection.parentElement?.querySelector('.card-footer')?.textContent).toContain(
      'No projects yet',
    );
    menuSection.querySelector('summary')?.click();
    expect(menuSection.open).toBe(true);
    expect(menuSwitch.getAttribute('aria-checked')).toBe('false');
    expect(fixture.componentInstance.canSave()).toBe(true);
  });
});
