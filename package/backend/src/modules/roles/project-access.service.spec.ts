import { InternalServerErrorException } from '@nestjs/common';
import { EnumUserRole } from '../../auth/auth.dto';
import { ProjectAccessService } from './project-access.service';

function createService(result: { data: unknown; error: unknown }) {
  const maybeSingle = jest.fn().mockResolvedValue(result);
  const eq = jest.fn().mockReturnValue({ maybeSingle });
  const select = jest.fn().mockReturnValue({ eq });
  const from = jest.fn().mockReturnValue({ select });
  const service = new ProjectAccessService({
    getClient: () => ({ from }),
  } as never);
  return { service, from };
}

const items = [{ projectId: 'p1' }, { projectId: 'p2' }, {}];
const projectIdOf = (item: { projectId?: string }) => item.projectId;

describe('ProjectAccessService', () => {
  it('returns everything for admins without querying', async () => {
    const { service, from } = createService({ data: null, error: null });
    await expect(
      service.filterByProject(EnumUserRole.ADMIN, items, projectIdOf),
    ).resolves.toBe(items);
    expect(from).not.toHaveBeenCalled();
  });

  it('removes projects set to none and keeps the rest', async () => {
    const { service } = createService({
      data: { default_access: 'view', project_access: { p1: 'none' } },
      error: null,
    });
    await expect(
      service.filterByProject(EnumUserRole.GUEST, items, projectIdOf),
    ).resolves.toEqual([{ projectId: 'p2' }, {}]);
  });

  it('applies a default of none to unlisted and project-less items', async () => {
    const { service } = createService({
      data: { default_access: 'none', project_access: { p2: 'edit' } },
      error: null,
    });
    await expect(
      service.filterByProject(EnumUserRole.USER, items, projectIdOf),
    ).resolves.toEqual([{ projectId: 'p2' }]);
  });

  it('falls back to role defaults when no row is saved', async () => {
    const { service } = createService({ data: null, error: null });
    await expect(
      service.filterByProject(EnumUserRole.GUEST, items, projectIdOf),
    ).resolves.toEqual(items);
  });

  it('fails closed when permissions cannot be loaded', async () => {
    const { service } = createService({
      data: null,
      error: { message: 'db down' },
    });
    await expect(
      service.filterByProject(EnumUserRole.USER, items, projectIdOf),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
