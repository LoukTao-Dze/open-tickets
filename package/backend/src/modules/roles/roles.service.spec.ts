import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import {
  MENU_KEYS,
  MenuKey,
  RolePermissionDto,
} from './dto/update-role-permissions.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

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
  menu_access: [],
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
          menuAccess: ['kanban'],
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
          menu_access: ['kanban'],
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
          menuAccess: [] as MenuKey[],
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
          menu_access: [...MENU_KEYS],
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
      menuAccess: [] as MenuKey[],
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
      menuAccess: [] as MenuKey[],
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
            menuAccess: [],
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
            menuAccess: [],
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
        menu_access: [],
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

  describe('getMenuAccess', () => {
    const makeService = (response: { data: unknown; error: unknown }) => {
      const maybeSingle = jest.fn().mockResolvedValue(response);
      const eq = jest.fn().mockReturnValue({ maybeSingle });
      const select = jest.fn().mockReturnValue({ eq });
      const from = jest.fn().mockReturnValue({ select });
      const service = new RolesService({
        getClient: () => ({ from }),
      } as never);
      return { service, from, eq };
    };

    it('returns only the requested role menus and denies a missing role', async () => {
      const { service, eq } = makeService({
        data: { menu_access: ['projects'] },
        error: null,
      });
      await expect(service.getMenuAccess('user')).resolves.toEqual([
        'projects',
      ]);
      expect(eq).toHaveBeenCalledWith('role', 'user');
      const missing = makeService({ data: null, error: null });
      await expect(missing.service.getMenuAccess('deleted')).resolves.toEqual(
        [],
      );
    });

    it('grants admin all menus without querying storage', async () => {
      const { service, from } = makeService({ data: null, error: null });
      await expect(service.getMenuAccess('admin')).resolves.toEqual([
        ...MENU_KEYS,
      ]);
      expect(from).not.toHaveBeenCalled();
    });

    it('rejects failed or malformed storage responses', async () => {
      const failed = makeService({
        data: null,
        error: { message: 'unavailable' },
      });
      await expect(failed.service.getMenuAccess('user')).rejects.toThrow(
        'Failed to load',
      );
      const malformed = makeService({
        data: { menu_access: ['unknown'] },
        error: null,
      });
      await expect(malformed.service.getMenuAccess('user')).rejects.toThrow(
        'Failed to load',
      );
    });
  });

  it('validates menu keys and rejects duplicates', async () => {
    const permission = {
      role: 'user',
      canEdit: true,
      defaultAccess: 'view',
      projectAccess: {},
    };
    for (const menuAccess of [['unknown'], ['kanban', 'kanban'], null]) {
      const dto = plainToInstance(RolePermissionDto, {
        ...permission,
        menuAccess,
      });
      expect(
        (await validate(dto)).some((error) => error.property === 'menuAccess'),
      ).toBe(true);
    }
    expect(
      await validate(
        plainToInstance(RolePermissionDto, { ...permission, menuAccess: [] }),
      ),
    ).toEqual([]);
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
