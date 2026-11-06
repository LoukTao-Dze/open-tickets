import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RolesService } from './roles.service';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

const EXISTING_ROLES = [{ role: 'admin' }, { role: 'user' }, { role: 'guest' }];

function createService(
  upsertError: { message: string } | null = null,
  insertResult: { data: unknown; error: unknown } = { data: null, error: null },
  deleteResult: { data: unknown; error: unknown } = { data: [], error: null },
) {
  const upsert = jest.fn().mockResolvedValue({ error: upsertError });
  const loaded = { data: EXISTING_ROLES, error: null };
  const select = jest.fn().mockReturnValue(
    Object.assign(Promise.resolve(loaded), {
      order: jest.fn().mockResolvedValue(loaded),
    }),
  );
  const single = jest.fn().mockResolvedValue(insertResult);
  const insertSelect = jest.fn().mockReturnValue({ single });
  const insert = jest.fn().mockReturnValue({ select: insertSelect });
  const deleteSelect = jest.fn().mockResolvedValue(deleteResult);
  const eq = jest.fn().mockReturnValue({ select: deleteSelect });
  const remove = jest.fn().mockReturnValue({ eq });
  const from = jest
    .fn()
    .mockReturnValue({ upsert, select, insert, delete: remove });
  const service = new RolesService({
    getClient: () => ({ from }),
  } as never);
  return { service, upsert, insert, eq };
}

const CREATED_ROW = {
  role: 'QA reviewer',
  description: null,
  can_edit: false,
  default_access: 'view',
  project_access: {},
};

describe('RolesService', () => {
  it('upserts rows and downgrades edit access when canEdit is false', async () => {
    const { service, upsert } = createService();
    await service.updatePermissions({
      roles: [
        {
          role: 'guest',
          canEdit: false,
          defaultAccess: 'edit',
          projectAccess: { [PROJECT_ID]: 'edit' },
        },
      ],
    });
    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          role: 'guest',
          can_edit: false,
          default_access: 'view',
          project_access: { [PROJECT_ID]: 'view' },
        }),
      ],
      { onConflict: 'role' },
    );
  });

  it('forces admin to full access whatever the request says', async () => {
    const { service, upsert } = createService();
    await service.updatePermissions({
      roles: [
        {
          role: 'admin',
          canEdit: false,
          defaultAccess: 'none',
          projectAccess: { [PROJECT_ID]: 'none' },
        },
      ],
    });
    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          role: 'admin',
          can_edit: true,
          default_access: 'edit',
          project_access: {},
        }),
      ],
      { onConflict: 'role' },
    );
  });

  it('rejects non-UUID project ids and unknown access levels', async () => {
    const { service, upsert } = createService();
    const base = {
      role: 'user',
      canEdit: true,
      defaultAccess: 'view',
    } as const;
    await expect(
      service.updatePermissions({
        roles: [{ ...base, projectAccess: { nope: 'view' } }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.updatePermissions({
        roles: [{ ...base, projectAccess: { [PROJECT_ID]: 'owner' as never } }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('rejects duplicate roles', async () => {
    const { service } = createService();
    const role = {
      role: 'user',
      canEdit: true,
      defaultAccess: 'view',
      projectAccess: {},
    } as const;
    await expect(
      service.updatePermissions({ roles: [role, role] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('hides database error details from the client', async () => {
    const { service } = createService({ message: 'secret detail' });
    await expect(
      service.updatePermissions({
        roles: [
          {
            role: 'user',
            canEdit: true,
            defaultAccess: 'view',
            projectAccess: {},
          },
        ],
      }),
    ).rejects.toThrow('Failed to save role permissions');
  });

  it('rejects updates for roles that do not exist', async () => {
    const { service, upsert } = createService();
    await expect(
      service.updatePermissions({
        roles: [
          {
            role: 'ghost',
            canEdit: true,
            defaultAccess: 'view',
            projectAccess: {},
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(upsert).not.toHaveBeenCalled();
  });

  describe('createRole', () => {
    it('stores the name as the role and downgrades edit when canEdit is false', async () => {
      const { service, insert } = createService(null, {
        data: CREATED_ROW,
        error: null,
      });
      const result = await service.createRole({
        name: 'QA reviewer',
        canEdit: false,
        defaultAccess: 'edit',
      });
      expect(insert).toHaveBeenCalledWith({
        role: 'QA reviewer',
        description: null,
        can_edit: false,
        default_access: 'view',
        project_access: {},
      });
      expect(result.data).toEqual(
        expect.objectContaining({
          role: 'QA reviewer',
          isSystem: false,
        }),
      );
    });

    it('keeps non-English names as they are', async () => {
      const { service, insert } = createService(null, {
        data: { ...CREATED_ROW, role: 'ทีมตรวจสอบ' },
        error: null,
      });
      await service.createRole({
        name: 'ทีมตรวจสอบ',
        canEdit: true,
        defaultAccess: 'view',
      });
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'ทีมตรวจสอบ' }),
      );
    });

    it('rejects a name that matches an existing role ignoring case', async () => {
      const { service, insert } = createService();
      await expect(
        service.createRole({
          name: 'Admin',
          canEdit: true,
          defaultAccess: 'edit',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(insert).not.toHaveBeenCalled();
    });

    it('reports a database duplicate as a conflict', async () => {
      const { service } = createService(null, {
        data: null,
        error: { code: '23505', message: 'duplicate key' },
      });
      await expect(
        service.createRole({
          name: 'Reviewers',
          canEdit: false,
          defaultAccess: 'view',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('hides database error details from the client', async () => {
      const { service } = createService(null, {
        data: null,
        error: { message: 'secret detail' },
      });
      await expect(
        service.createRole({
          name: 'Reviewer',
          canEdit: true,
          defaultAccess: 'view',
        }),
      ).rejects.toThrow('Failed to create role permissions');
    });
  });

  describe('deleteRole', () => {
    it('deletes a custom role', async () => {
      const { service, eq } = createService(null, undefined, {
        data: [{ role: 'QA reviewer' }],
        error: null,
      });
      await expect(service.deleteRole('QA reviewer')).resolves.toEqual({
        message: 'Role deleted',
      });
      expect(eq).toHaveBeenCalledWith('role', 'QA reviewer');
    });

    it.each(['admin', 'user', 'guest'])(
      'never deletes the %s role',
      async (role) => {
        const { service, eq } = createService();
        await expect(service.deleteRole(role)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
        expect(eq).not.toHaveBeenCalled();
      },
    );

    it('reports a missing role', async () => {
      const { service } = createService();
      await expect(service.deleteRole('Ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('hides database error details from the client', async () => {
      const { service } = createService(null, undefined, {
        data: null,
        error: { message: 'secret detail' },
      });
      await expect(service.deleteRole('QA reviewer')).rejects.toThrow(
        'Failed to delete role permissions',
      );
    });
  });
});
