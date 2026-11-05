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
          canEdit: true,
          defaultAccess: 'edit',
          projectAccess: { 'project-1': 'none' },
        },
        { role: 'guest', canEdit: false, defaultAccess: 'view', projectAccess: {} },
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
});
