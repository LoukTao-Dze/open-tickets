import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { RolePermissionService } from './role-permission.service';

describe('RolePermissionService', () => {
  let service: RolePermissionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(RolePermissionService);
  });

  it('gives guests view access by default and users edit access', () => {
    expect(service.accessFor('guest', 'project-1')).toBe('view');
    expect(service.accessFor('user', 'project-1')).toBe('edit');
  });

  it('never changes the locked admin role', () => {
    service.setCanEdit('admin', false);
    service.setProjectAccess('admin', 'project-1', 'none');
    expect(service.accessFor('admin', 'project-1')).toBe('edit');
  });

  it('sets access per project', () => {
    service.setProjectAccess('user', 'project-1', 'none');
    expect(service.accessFor('user', 'project-1')).toBe('none');
    expect(service.accessFor('user', 'project-2')).toBe('edit');
  });

  it('refuses edit access while the role cannot edit', () => {
    service.setProjectAccess('guest', 'project-1', 'edit');
    expect(service.accessFor('guest', 'project-1')).toBe('view');
  });

  it('downgrades existing edit access when edit is switched off', () => {
    service.setProjectAccess('user', 'project-1', 'edit');
    service.setCanEdit('user', false);
    expect(service.accessFor('user', 'project-1')).toBe('view');
    expect(service.accessFor('user', 'project-2')).toBe('view');
  });

  it('saves all role permissions and clears the unsaved state', () => {
    const http = TestBed.inject(HttpTestingController);
    service.setProjectAccess('user', 'project-1', 'none');
    expect(service.hasUnsavedChanges()).toBe(true);

    service.save().subscribe();
    const request = http.expectOne('/api/roles/permissions');
    expect(request.request.method).toBe('PUT');
    expect(request.request.withCredentials).toBe(true);
    expect(request.request.body.roles.map((role: { role: string }) => role.role)).toEqual([
      'admin',
      'user',
      'guest',
    ]);
    request.flush({
      data: [
        {
          role: 'user',
          isSystem: true,
          canEdit: true,
          defaultAccess: 'edit',
          projectAccess: { 'project-1': 'none' },
        },
        {
          role: 'guest',
          isSystem: true,
          canEdit: false,
          defaultAccess: 'view',
          projectAccess: {},
        },
      ],
    });

    expect(service.hasUnsavedChanges()).toBe(false);
    http.verify();
  });

  it('keeps unsaved changes when saving fails', () => {
    const http = TestBed.inject(HttpTestingController);
    service.setCanEdit('user', false);
    service.save().subscribe({ error: () => undefined });
    http.expectOne('/api/roles/permissions').flush({}, { status: 500, statusText: 'Error' });
    expect(service.hasUnsavedChanges()).toBe(true);
  });

  it('adds a created role without touching other unsaved edits', () => {
    const http = TestBed.inject(HttpTestingController);
    service.setProjectAccess('user', 'project-1', 'none');

    service
      .createRole({ name: 'QA reviewer', description: '', canEdit: false, defaultAccess: 'view' })
      .subscribe();
    const request = http.expectOne('/api/roles');
    expect(request.request.method).toBe('POST');
    expect(request.request.withCredentials).toBe(true);
    request.flush({
      data: {
        role: 'QA reviewer',
        description: null,
        isSystem: false,
        canEdit: false,
        defaultAccess: 'view',
        projectAccess: {},
      },
    });

    expect(service.accessFor('QA reviewer', 'project-1')).toBe('view');
    expect(service.customRoles()).toEqual([
      { id: 'QA reviewer', label: 'QA reviewer', description: '' },
    ]);
    expect(service.accessFor('user', 'project-1')).toBe('none');
    expect(service.hasUnsavedChanges()).toBe(true);
  });

  it('keeps the role list unchanged when creating fails', () => {
    const http = TestBed.inject(HttpTestingController);
    service
      .createRole({ name: 'Guest', description: '', canEdit: false, defaultAccess: 'view' })
      .subscribe({ error: () => undefined });
    http.expectOne('/api/roles').flush({}, { status: 409, statusText: 'Conflict' });
    expect(service.customRoles()).toEqual([]);
  });

  describe('deleteRole', () => {
    const createQaRole = (http: HttpTestingController) => {
      service
        .createRole({ name: 'QA reviewer', description: '', canEdit: true, defaultAccess: 'view' })
        .subscribe();
      http.expectOne('/api/roles').flush({
        data: {
          role: 'QA reviewer',
          description: null,
          isSystem: false,
          canEdit: true,
          defaultAccess: 'view',
          projectAccess: {},
        },
      });
    };

    it('removes the role after the server deletes it', () => {
      const http = TestBed.inject(HttpTestingController);
      createQaRole(http);

      service.deleteRole('QA reviewer').subscribe();
      const request = http.expectOne('/api/roles/QA%20reviewer');
      expect(request.request.method).toBe('DELETE');
      expect(request.request.withCredentials).toBe(true);
      request.flush({ message: 'Role deleted' });

      expect(service.customRoles()).toEqual([]);
      expect(Object.keys(service.permissions())).toEqual(['admin', 'user', 'guest']);
      expect(service.hasUnsavedChanges()).toBe(false);
    });

    it('keeps the role when the server refuses', () => {
      const http = TestBed.inject(HttpTestingController);
      createQaRole(http);

      service.deleteRole('QA reviewer').subscribe({ error: () => undefined });
      http.expectOne('/api/roles/QA%20reviewer').flush({}, { status: 500, statusText: 'Error' });

      expect(service.customRoles().length).toBe(1);
    });

    it('never sends a request for a system role', () => {
      const http = TestBed.inject(HttpTestingController);
      service.deleteRole('guest').subscribe({ error: () => undefined });
      http.expectNone('/api/roles/guest');
      expect(service.permissions()['guest']).toBeDefined();
    });
  });
});
