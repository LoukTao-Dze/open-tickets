import { BadRequestException } from '@nestjs/common';
import { RolesService } from './roles.service';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function createService(upsertError: { message: string } | null = null) {
  const upsert = jest.fn().mockResolvedValue({ error: upsertError });
  const select = jest.fn().mockResolvedValue({ data: [], error: null });
  const from = jest.fn().mockReturnValue({ upsert, select });
  const service = new RolesService({
    getClient: () => ({ from }),
  } as never);
  return { service, upsert };
}

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
});
