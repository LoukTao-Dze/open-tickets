import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { Request } from 'express';
import { EnumUserRole } from '../../auth/auth.dto';
import { SessionGuard } from '../../auth/session.guard';
import { SupabaseService } from '../../supabase/supabase.service';
import { ProjectAccessService } from '../roles/project-access.service';
import { SceneDto, SceneStatus, SceneStatusDto } from './dto/scene.dto';
import { ScenesController } from './scenes.controller';
import { ScenesService } from './scenes.service';
import { TestSuiteDto } from './dto/test-suite.dto';
import { TestSuitesController } from './test-suites.controller';

const scene: SceneDto = {
  suiteId: '550e8400-e29b-41d4-a716-446655440000',
  sceneNo: 'SC-01',
  test: 'Sign in',
  status: SceneStatus.NotStart,
  detailsIssue: '',
  expectedResult: '',
  action: '',
  dataTest: '',
  remark: '',
};

describe('Scene validation', () => {
  afterEach(() => jest.clearAllMocks());

  it('rejects whitespace-only required fields and invalid statuses', async () => {
    const invalid = plainToInstance(SceneDto, {
      ...scene,
      sceneNo: '  ',
      status: 'failed',
    });
    const errors = await validate(invalid);
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['sceneNo', 'status']),
    );
    expect(await validate(plainToInstance(SceneDto, scene))).toHaveLength(0);
  });

  it('accepts only known statuses for status-only updates', async () => {
    const valid = plainToInstance(SceneStatusDto, { status: 'pass' });
    const invalid = plainToInstance(SceneStatusDto, { status: 'failed' });
    expect(await validate(valid)).toHaveLength(0);
    expect(await validate(invalid)).not.toHaveLength(0);
  });

  it('accepts multiple distinct card references and rejects invalid arrays', async () => {
    expect(
      await validate(
        plainToInstance(TestSuiteDto, {
          name: 'Tests',
          kanbanTicketIds: ['DS1', 'DS2'],
        }),
      ),
    ).toHaveLength(0);
    for (const kanbanTicketIds of [null, ['DS1', 'DS1'], [''], [123]]) {
      const errors = await validate(
        plainToInstance(TestSuiteDto, { name: 'Tests', kanbanTicketIds }),
      );
      expect(errors.map((error) => error.property)).toContain(
        'kanbanTicketIds',
      );
    }
  });

  it.each([undefined, null, '', 'not-a-uuid'])(
    'requires a suite UUID: %s',
    async (suiteId) => {
      const errors = await validate(
        plainToInstance(SceneDto, { ...scene, suiteId }),
      );
      expect(errors.map((error) => error.property)).toContain('suiteId');
    },
  );

  it.each([undefined, null, '', '  ', 'x'.repeat(241)])(
    'rejects an invalid suite name',
    async (name) => {
      expect(
        await validate(plainToInstance(TestSuiteDto, { name })),
      ).not.toHaveLength(0);
    },
  );

  it('trims suite text and limits the description', async () => {
    const suite = plainToInstance(TestSuiteDto, {
      name: '  Login tests  ',
      description: '  Covers sign-in  ',
    });
    expect(await validate(suite)).toHaveLength(0);
    expect(suite.name).toBe('Login tests');
    expect(suite.description).toBe('Covers sign-in');
    const withoutDescription = plainToInstance(TestSuiteDto, { name: 'x' });
    expect(await validate(withoutDescription)).toHaveLength(0);
    const tooLong = plainToInstance(TestSuiteDto, {
      name: 'x',
      description: 'x'.repeat(2001),
    });
    expect(await validate(tooLong)).not.toHaveLength(0);
  });

  it('accepts an optional destination project UUID and rejects invalid values', async () => {
    expect(
      await validate(
        plainToInstance(TestSuiteDto, {
          name: 'Tests',
          projectId: '550e8400-e29b-41d4-a716-446655440000',
        }),
      ),
    ).toHaveLength(0);
    expect(
      await validate(plainToInstance(TestSuiteDto, { name: 'Tests', projectId: 'invalid' })),
    ).not.toHaveLength(0);
  });
});

describe('ScenesController', () => {
  const service = {
    list: jest.fn(),
    listSuites: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    delete: jest.fn(),
  };
  const access = { assertProjectAccess: jest.fn() };
  const controller = new ScenesController(
    service as unknown as ScenesService,
    access as unknown as ProjectAccessService,
  );
  const session = { user: { role: EnumUserRole.USER } } as Parameters<
    ScenesController['list']
  >[1];
  const request = {
    get: jest.fn().mockReturnValue(undefined),
  } as unknown as Request;

  afterEach(() => jest.clearAllMocks());

  it('returns scenes and edit access for the selected project', async () => {
    access.assertProjectAccess.mockResolvedValue('view');
    service.list.mockResolvedValue([scene]);
    service.listSuites.mockResolvedValue([
      { id: scene.suiteId, name: 'Login tests' },
    ]);
    await expect(controller.list('project', session)).resolves.toEqual({
      data: {
        scenes: [scene],
        suites: [{ id: scene.suiteId, name: 'Login tests' }],
        canEdit: false,
      },
    });
    expect(access.assertProjectAccess).toHaveBeenCalledWith(
      EnumUserRole.USER,
      'project',
      'view',
    );
    expect(service.list).toHaveBeenCalledWith('project');
  });

  it('does not update without project edit access', async () => {
    access.assertProjectAccess.mockRejectedValue(new ForbiddenException());
    await expect(
      controller.update('project', 'scene', scene, session, request),
    ).rejects.toThrow(ForbiddenException);
    expect(service.update).not.toHaveBeenCalled();
  });

  it('does not read scenes or suites without project view access', async () => {
    access.assertProjectAccess.mockRejectedValue(new ForbiddenException());
    await expect(controller.list('project', session)).rejects.toThrow(
      ForbiddenException,
    );
    expect(service.list).not.toHaveBeenCalled();
    expect(service.listSuites).not.toHaveBeenCalled();
  });

  it('updates only the status after checking edit access', async () => {
    const passed = { ...scene, status: SceneStatus.Pass };
    access.assertProjectAccess.mockResolvedValue('edit');
    service.updateStatus.mockResolvedValue(passed);
    await expect(
      controller.updateStatus(
        'project',
        'scene',
        { status: SceneStatus.Pass },
        session,
        request,
      ),
    ).resolves.toEqual({ data: passed });
    expect(access.assertProjectAccess).toHaveBeenCalledWith(
      EnumUserRole.USER,
      'project',
      'edit',
    );
    expect(service.updateStatus).toHaveBeenCalledWith(
      'project',
      'scene',
      SceneStatus.Pass,
    );
  });

  it('does not change status without project edit access', async () => {
    access.assertProjectAccess.mockRejectedValue(new ForbiddenException());
    await expect(
      controller.updateStatus(
        'project',
        'scene',
        { status: SceneStatus.Pass },
        session,
        request,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(service.updateStatus).not.toHaveBeenCalled();
  });

  it('deletes a scene only with project edit access', async () => {
    access.assertProjectAccess.mockResolvedValue('edit');
    service.delete.mockResolvedValue({ id: 'scene' });
    await expect(
      controller.delete('project', 'scene', session, request),
    ).resolves.toEqual({
      data: { id: 'scene' },
    });
    expect(access.assertProjectAccess).toHaveBeenCalledWith(
      EnumUserRole.USER,
      'project',
      'edit',
    );
    expect(service.delete).toHaveBeenCalledWith('project', 'scene');

    service.delete.mockClear();
    access.assertProjectAccess.mockRejectedValue(new ForbiddenException());
    await expect(
      controller.delete('project', 'scene', session, request),
    ).rejects.toThrow(ForbiddenException);
    expect(service.delete).not.toHaveBeenCalled();
  });
});

describe('ScenesService', () => {
  afterEach(() => jest.clearAllMocks());

  it('limits updates to the given project and returns not found for a missing scene', async () => {
    const maybeSingle = jest
      .fn()
      .mockResolvedValue({ data: null, error: null });
    const select = jest.fn().mockReturnValue({ maybeSingle });
    const eq = jest.fn().mockReturnThis();
    const update = jest.fn().mockReturnValue({ eq, select });
    const supabase = { getClient: () => ({ from: () => ({ update }) }) };
    const service = new ScenesService(supabase as unknown as SupabaseService);

    await expect(service.update('project', 'scene', scene)).rejects.toThrow(
      NotFoundException,
    );
    expect(eq).toHaveBeenNthCalledWith(1, 'project_id', 'project');
    expect(eq).toHaveBeenNthCalledWith(2, 'id', 'scene');
  });

  it('writes only the status column for a status update', async () => {
    const row = {
      id: 'scene',
      project_id: 'project',
      suite_id: null,
      scene_no: 'SC-01',
      test: 'Sign in',
      status: SceneStatus.Pass,
      created_at: '2026-01-01',
    };
    const maybeSingle = jest.fn().mockResolvedValue({ data: row, error: null });
    const select = jest.fn().mockReturnValue({ maybeSingle });
    const eq = jest.fn().mockReturnThis();
    const update = jest.fn().mockReturnValue({ eq, select });
    const supabase = { getClient: () => ({ from: () => ({ update }) }) };
    const service = new ScenesService(supabase as unknown as SupabaseService);

    await expect(
      service.updateStatus('project', 'scene', SceneStatus.Pass),
    ).resolves.toMatchObject({ status: SceneStatus.Pass, suiteId: null });
    expect(update).toHaveBeenCalledWith({ status: SceneStatus.Pass });
  });

  it('deletes only a scene in the given project and reports missing records and errors', async () => {
    const maybeSingle = jest
      .fn()
      .mockResolvedValue({ data: { id: 'scene' }, error: null });
    const select = jest.fn().mockReturnValue({ maybeSingle });
    const eq = jest.fn().mockReturnThis();
    const deleteScene = jest.fn().mockReturnValue({ eq, select });
    const from = jest.fn().mockReturnValue({ delete: deleteScene });
    const service = new ScenesService({
      getClient: () => ({ from }),
    } as unknown as SupabaseService);

    await expect(service.delete('project', 'scene')).resolves.toEqual({
      id: 'scene',
    });
    expect(from).toHaveBeenCalledWith('scenes');
    expect(eq).toHaveBeenNthCalledWith(1, 'project_id', 'project');
    expect(eq).toHaveBeenNthCalledWith(2, 'id', 'scene');
    maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    await expect(service.delete('project', 'missing')).rejects.toThrow(
      NotFoundException,
    );
    maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'database unavailable' },
    });
    await expect(service.delete('project', 'scene')).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});

describe('Test suite mutations', () => {
  const suiteRow = {
    id: scene.suiteId,
    project_id: 'project',
    name: 'Login tests',
    description: 'Covers sign-in and sign-out',
    created_at: '2026-01-01',
    last_scene_update_at: '2026-01-02T10:00:00Z',
    kanban_ticket_ids: [],
  };
  const maybeSingle = jest.fn();
  const single = jest.fn();
  const order = jest.fn();
  const query = {
    select: jest.fn(),
    eq: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    maybeSingle,
    single,
    order,
    returns: jest.fn(),
  };
  const from = jest.fn().mockReturnValue(query);
  const rpc = jest.fn();
  const access = { assertProjectAccess: jest.fn() };
  let service: ScenesService;
  let controller: TestSuitesController;
  const session = { user: { role: EnumUserRole.USER } } as Parameters<
    TestSuitesController['create']
  >[2];
  const request = { get: () => undefined } as Request;

  beforeEach(async () => {
    for (const method of [
      query.select,
      query.eq,
      query.insert,
      query.update,
      query.delete,
    ]) {
      method.mockReturnValue(query);
    }
    maybeSingle.mockResolvedValue({ data: suiteRow, error: null });
    single.mockResolvedValue({ data: suiteRow, error: null });
    order.mockReturnValue(query);
    query.returns.mockResolvedValue({ data: [suiteRow], error: null });
    access.assertProjectAccess.mockResolvedValue('edit');
    const module = await Test.createTestingModule({
      controllers: [TestSuitesController],
      providers: [
        ScenesService,
        {
          provide: SupabaseService,
          useValue: { getClient: () => ({ from, rpc }) },
        },
        { provide: ProjectAccessService, useValue: access },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    service = module.get(ScenesService);
    controller = module.get(TestSuitesController);
  });

  afterEach(() => jest.clearAllMocks());

  it('lists only the selected project suites and maps their fields', async () => {
    await expect(service.listSuites('project')).resolves.toEqual([
      {
        id: suiteRow.id,
        projectId: 'project',
        name: suiteRow.name,
        description: suiteRow.description,
        createdAt: suiteRow.created_at,
        lastSceneUpdateAt: suiteRow.last_scene_update_at,
        kanbanTicketIds: [],
      },
    ]);
    expect(from).toHaveBeenCalledWith('test_suites');
    expect(query.eq).toHaveBeenCalledWith('project_id', 'project');
    query.returns.mockResolvedValueOnce({ data: [], error: null });
    await expect(service.listSuites('empty')).resolves.toEqual([]);
  });

  it('creates and updates suites within the authorized project', async () => {
    await controller.create(
      'project',
      { name: suiteRow.name, description: suiteRow.description },
      session,
      request,
    );
    expect(query.insert).toHaveBeenCalledWith({
      project_id: 'project',
      name: suiteRow.name,
      description: suiteRow.description,
    });
    await controller.create('project', { name: 'No notes' }, session, request);
    expect(query.insert).toHaveBeenLastCalledWith({
      project_id: 'project',
      name: 'No notes',
      description: '',
    });
    await controller.update(
      'project',
      suiteRow.id,
      { name: 'New name', description: 'New notes' },
      session,
      request,
    );
    expect(query.update).toHaveBeenCalledWith({
      name: 'New name',
      description: 'New notes',
    });
    expect(query.eq).toHaveBeenNthCalledWith(1, 'project_id', 'project');
    expect(query.eq).toHaveBeenNthCalledWith(2, 'id', suiteRow.id);
    expect(access.assertProjectAccess).toHaveBeenCalledWith(
      EnumUserRole.USER,
      'project',
      'edit',
    );
  });

  it('checks destination edit access and moves a suite through the atomic database operation', async () => {
    access.assertProjectAccess
      .mockResolvedValueOnce('edit')
      .mockRejectedValueOnce(new ForbiddenException());
    await expect(
      controller.update(
        'project',
        suiteRow.id,
        { name: 'Moved suite', projectId: 'project-2' },
        session,
        request,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(access.assertProjectAccess).toHaveBeenNthCalledWith(
      2,
      EnumUserRole.USER,
      'project-2',
      'edit',
    );
    expect(rpc).not.toHaveBeenCalled();

    access.assertProjectAccess.mockReset().mockResolvedValue('edit');
    rpc.mockReturnValue({ maybeSingle });
    maybeSingle.mockResolvedValue({
      data: { ...suiteRow, project_id: 'project-2' },
      error: null,
    });
    await expect(
      controller.update(
        'project',
        suiteRow.id,
        { name: 'Moved suite', projectId: 'project-2', kanbanTicketIds: [] },
        session,
        request,
      ),
    ).resolves.toMatchObject({ data: { projectId: 'project-2' } });
    expect(rpc).toHaveBeenCalledWith('move_test_suite', {
      source_project_id: 'project',
      suite_id: suiteRow.id,
      destination_project_id: 'project-2',
      suite_name: 'Moved suite',
      suite_description: null,
      suite_kanban_ticket_ids: [],
    });
    expect(access.assertProjectAccess).toHaveBeenNthCalledWith(
      2,
      EnumUserRole.USER,
      'project-2',
      'edit',
    );
  });

  it('rejects all suite mutations without project edit access', async () => {
    access.assertProjectAccess.mockRejectedValue(new ForbiddenException());
    await expect(
      controller.create('project', { name: 'Tests' }, session, request),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.update(
        'project',
        suiteRow.id,
        { name: 'Tests' },
        session,
        request,
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.delete('project', suiteRow.id, session, request),
    ).rejects.toThrow(ForbiddenException);
    expect(from).not.toHaveBeenCalled();
  });

  it('deletes only the project-owned empty suite', async () => {
    await expect(
      controller.delete('project', suiteRow.id, session, request),
    ).resolves.toEqual({ data: { id: suiteRow.id } });
    expect(query.eq).toHaveBeenNthCalledWith(1, 'project_id', 'project');
    expect(query.eq).toHaveBeenNthCalledWith(2, 'id', suiteRow.id);
  });

  it('reports a conflict when the database prevents deletion of a populated suite', async () => {
    maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { code: '23503', message: 'foreign key' },
    });
    await expect(service.deleteSuite('project', suiteRow.id)).rejects.toThrow(
      ConflictException,
    );
  });

  it('reports missing suites for update and delete', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(
      service.updateSuite('project', 'missing', { name: 'Tests' }),
    ).rejects.toThrow(NotFoundException);
    await expect(service.deleteSuite('project', 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('writes the chosen suite when creating or moving a scene', async () => {
    const sceneRow = {
      ...suiteRow,
      scene_no: scene.sceneNo,
      suite_id: scene.suiteId,
      test: scene.test,
      status: scene.status,
    };
    single.mockResolvedValueOnce({ data: sceneRow, error: null });
    maybeSingle.mockResolvedValueOnce({ data: sceneRow, error: null });
    await expect(service.create('project', scene)).resolves.toMatchObject({
      suiteId: scene.suiteId,
    });

    expect(query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        suite_id: scene.suiteId,
        project_id: 'project',
      }),
    );
    await service.update('project', 'scene', scene);
    expect(query.update).toHaveBeenCalledWith(
      expect.objectContaining({ suite_id: scene.suiteId }),
    );
  });

  it('writes and returns suite card references and keeps them when omitted', async () => {
    single.mockResolvedValueOnce({
      data: { ...suiteRow, kanban_ticket_ids: ['DS1', 'DS2'] },
      error: null,
    });
    await expect(
      service.createSuite('project', {
        name: 'Tests',
        kanbanTicketIds: ['DS1', 'DS2'],
      }),
    ).resolves.toMatchObject({ kanbanTicketIds: ['DS1', 'DS2'] });
    expect(query.insert).toHaveBeenLastCalledWith(
      expect.objectContaining({ kanban_ticket_ids: ['DS1', 'DS2'] }),
    );
    maybeSingle.mockResolvedValue({
      data: { ...suiteRow, kanban_ticket_ids: ['DS1', 'DS2'] },
      error: null,
    });
    await expect(
      service.updateSuite('project', 'suite', {
        name: 'Tests',
        kanbanTicketIds: ['DS1', 'DS2'],
      }),
    ).resolves.toMatchObject({ kanbanTicketIds: ['DS1', 'DS2'] });
    expect(query.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ kanban_ticket_ids: ['DS1', 'DS2'] }),
    );
    await service.updateSuite('project', 'suite', { name: 'Tests' });
    expect(query.update.mock.calls.at(-1)?.[0]).not.toHaveProperty(
      'kanban_ticket_ids',
    );
    await service.updateSuite('project', 'suite', {
      name: 'Tests',
      kanbanTicketIds: [],
    });
    expect(query.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ kanban_ticket_ids: [] }),
    );
    maybeSingle.mockResolvedValueOnce({
      data: null,
      error: { code: '23503', message: 'invalid ticket' },
    });
    await expect(
      service.updateSuite('project', 'suite', {
        name: 'Tests',
        kanbanTicketIds: ['other-project'],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a scene referencing a nonexistent or another project suite', async () => {
    const failure = {
      data: null,
      error: { code: '23503', message: 'foreign key' },
    };
    single.mockResolvedValueOnce(failure);
    maybeSingle.mockResolvedValueOnce(failure);
    await expect(service.create('project', scene)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.update('project', 'scene', scene)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('surfaces database errors instead of returning an empty suite list', async () => {
    query.returns.mockResolvedValueOnce({
      data: null,
      error: { message: 'database unavailable' },
    });
    await expect(service.listSuites('project')).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});
