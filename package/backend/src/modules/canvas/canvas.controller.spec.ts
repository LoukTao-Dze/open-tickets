import { Test, TestingModule } from '@nestjs/testing';
import { CanvasController } from './canvas.controller';
import { CanvasService } from './canvas.service';
import { SessionGuard } from '../../auth/session.guard';
import { EnumUserRole } from '../../auth/auth.dto';
import { ProjectAccessService } from '../roles/project-access.service';
import {
  BadRequestException,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionStore } from '../../auth/session-store';
import {
  CanvasSelectionDto,
  CreateCanvasGroupDto,
  MoveCanvasGroupDto,
  UpdateCanvasGroupDto,
  CanvasGroupDto,
} from './dto/canvas-selection.dto';

describe('CanvasController', () => {
  let controller: CanvasController;
  const canvasService = {
    saveCanvasItem: jest.fn(),
    getCanvasItem: jest.fn(),
    deleteCanvasItem: jest.fn(),
    deleteCanvasItems: jest.fn(),
    createGroup: jest.fn(),
    moveGroup: jest.fn(),
    getGroups: jest.fn(),
    updateGroup: jest.fn(),
    ungroup: jest.fn(),
  };

  const projectAccess = {
    filterByProject: jest.fn(),
    assertProjectAccess: jest.fn(),
  };
  const sessions = { recordAttempt: jest.fn() };
  const request = { get: jest.fn() } as Pick<Request, 'get'> as Request;
  const session = {
    user: { role: EnumUserRole.GUEST, user_id: 'u1' },
  } as Parameters<CanvasController['getCanvasItem']>[0];

  beforeEach(async () => {
    jest.resetAllMocks();
    projectAccess.assertProjectAccess.mockResolvedValue('edit');
    sessions.recordAttempt.mockResolvedValue(1);
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CanvasController],
      providers: [
        { provide: CanvasService, useValue: canvasService },
        { provide: ProjectAccessService, useValue: projectAccess },
        { provide: SessionStore, useValue: sessions },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<CanvasController>(CanvasController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate saveCanvasItem to the service', () => {
    const body = { projectId: 'p1', type: 'text' };
    canvasService.saveCanvasItem.mockReturnValue('saved');

    expect(controller.saveCanvasItem(body)).toBe('saved');
    expect(canvasService.saveCanvasItem).toHaveBeenCalledWith(body);
  });

  it('should return only canvas items the role can access', async () => {
    const items = [{ projectId: 'p1' }, { projectId: 'p2' }];
    canvasService.getCanvasItem.mockResolvedValue({ data: items });
    projectAccess.filterByProject.mockImplementation(
      (
        _role: unknown,
        list: typeof items,
        projectIdOf: (i: unknown) => string,
      ) => list.filter((item) => projectIdOf(item) === 'p1'),
    );

    await expect(controller.getCanvasItem(session, 'p1')).resolves.toEqual({
      data: [{ projectId: 'p1' }],
    });
    expect(canvasService.getCanvasItem).toHaveBeenCalledWith('p1');
    expect(projectAccess.filterByProject).toHaveBeenCalledWith(
      EnumUserRole.GUEST,
      items,
      expect.any(Function),
    );
  });

  it('should delegate deleteCanvasItem to the service', () => {
    const body = { id: '1', type: 'text' };
    canvasService.deleteCanvasItem.mockReturnValue('deleted');

    expect(controller.deleteCanvasItem(body)).toBe('deleted');
    expect(canvasService.deleteCanvasItem).toHaveBeenCalledWith(body);
  });

  it('authorizes bulk deletion before calling the service', async () => {
    const body = { projectId: 'p1', items: [{ id: 1, type: 'text' }] };
    canvasService.deleteCanvasItems.mockResolvedValue({ deletedCount: 1 });
    await expect(
      controller.deleteCanvasItems(body, session, request),
    ).resolves.toEqual({ deletedCount: 1 });
    expect(projectAccess.assertProjectAccess).toHaveBeenCalledWith(
      EnumUserRole.GUEST,
      'p1',
      'edit',
    );
    expect(canvasService.deleteCanvasItems).toHaveBeenCalledWith(body);
  });

  it('denies group creation, movement and deletion without edit access', async () => {
    projectAccess.assertProjectAccess.mockRejectedValue(
      new ForbiddenException(),
    );
    const selection = { projectId: 'p1', items: [{ id: 1, type: 'text' }] };
    await expect(
      controller.createGroup(selection, session, request),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.moveGroup(
        { projectId: 'p1', groupId: 1, dx: 1, dy: 2 },
        session,
        request,
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.deleteCanvasItems(selection, session, request),
    ).rejects.toThrow(ForbiddenException);
    expect(canvasService.createGroup).not.toHaveBeenCalled();
    expect(canvasService.moveGroup).not.toHaveBeenCalled();
    expect(canvasService.deleteCanvasItems).not.toHaveBeenCalled();
  });

  it('rejects untrusted origins before deleting', async () => {
    jest.mocked(request.get).mockReturnValue('https://untrusted.invalid');
    await expect(
      controller.deleteCanvasItems(
        { projectId: 'p1', items: [{ id: 1, type: 'text' }] },
        session,
        request,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(canvasService.deleteCanvasItems).not.toHaveBeenCalled();
  });

  it('rate-limits costly mutations before making changes', async () => {
    sessions.recordAttempt.mockResolvedValue(121);
    await expect(
      controller.deleteCanvasItems(
        { projectId: 'p1', items: [{ id: 1, type: 'text' }] },
        session,
        request,
      ),
    ).rejects.toMatchObject({ status: 429 });
    expect(canvasService.deleteCanvasItems).not.toHaveBeenCalled();
  });

  it('authorizes and delegates group editing and ungrouping', async () => {
    const body = {
      projectId: 'p1',
      groupId: 7,
      name: 'Release',
      color: '#123456',
    };
    canvasService.updateGroup.mockResolvedValue({ data: body });
    canvasService.ungroup.mockResolvedValue({ groupId: 7 });
    await expect(
      controller.updateGroup(body, session, request),
    ).resolves.toEqual({ data: body });
    await expect(
      controller.ungroup({ projectId: 'p1', groupId: 7 }, session, request),
    ).resolves.toEqual({ groupId: 7 });
    expect(projectAccess.assertProjectAccess).toHaveBeenCalledWith(
      EnumUserRole.GUEST,
      'p1',
      'edit',
    );
    expect(sessions.recordAttempt).toHaveBeenCalledTimes(2);
    expect(canvasService.updateGroup).toHaveBeenCalledWith(body);
    expect(canvasService.ungroup).toHaveBeenCalledWith({
      projectId: 'p1',
      groupId: 7,
    });
  });

  it('denies group editing and ungrouping without edit access', async () => {
    projectAccess.assertProjectAccess.mockRejectedValue(
      new ForbiddenException(),
    );
    await expect(
      controller.updateGroup(
        { projectId: 'p1', groupId: 7, name: 'Release', color: '#123456' },
        session,
        request,
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.ungroup({ projectId: 'p1', groupId: 7 }, session, request),
    ).rejects.toThrow(ForbiddenException);
    expect(canvasService.updateGroup).not.toHaveBeenCalled();
    expect(canvasService.ungroup).not.toHaveBeenCalled();
  });

  it('rejects cross-origin group edits and ungrouping', async () => {
    jest.mocked(request.get).mockReturnValue('https://untrusted.invalid');
    await expect(
      controller.updateGroup(
        { projectId: 'p1', groupId: 7, name: 'Release', color: '#123456' },
        session,
        request,
      ),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.ungroup({ projectId: 'p1', groupId: 7 }, session, request),
    ).rejects.toThrow(ForbiddenException);
    expect(canvasService.updateGroup).not.toHaveBeenCalled();
    expect(canvasService.ungroup).not.toHaveBeenCalled();
  });

  describe('selection request validation', () => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });

    it.each([
      null,
      {},
      { projectId: 'p1', items: [] },
      { projectId: 'p1', items: [{ id: 0, type: 'text' }] },
      { projectId: 'p1', items: [{ id: 1, type: 'unknown' }] },
    ])('rejects invalid bulk input %#', async (body) => {
      await expect(
        pipe.transform(body, { type: 'body', metatype: CanvasSelectionDto }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts an omitted group name and rejects oversized names and invalid deltas', async () => {
      const body = { projectId: 'p1', items: [{ id: 1, type: 'text' }] };
      await expect(
        pipe.transform(body, { type: 'body', metatype: CreateCanvasGroupDto }),
      ).resolves.toMatchObject(body);
      await expect(
        pipe.transform(
          { ...body, name: 'x'.repeat(81) },
          { type: 'body', metatype: CreateCanvasGroupDto },
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        pipe.transform(
          { projectId: 'p1', groupId: 1, dx: Infinity, dy: 0 },
          { type: 'body', metatype: MoveCanvasGroupDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it.each(['red', '#abc', '#12345z', '', null])(
      'rejects invalid group color %s',
      async (color) => {
        await expect(
          pipe.transform(
            { projectId: 'p1', groupId: 7, name: 'Release', color },
            { type: 'body', metatype: UpdateCanvasGroupDto },
          ),
        ).rejects.toThrow(BadRequestException);
      },
    );

    it('accepts blank names but rejects missing edit fields and invalid group IDs', async () => {
      const body = { projectId: 'p1', groupId: 7, name: '', color: '#AABBCC' };
      await expect(
        pipe.transform(body, { type: 'body', metatype: UpdateCanvasGroupDto }),
      ).resolves.toMatchObject(body);
      await expect(
        pipe.transform(
          { projectId: 'p1', groupId: 7 },
          { type: 'body', metatype: UpdateCanvasGroupDto },
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        pipe.transform(
          { ...body, name: 'x'.repeat(81) },
          { type: 'body', metatype: UpdateCanvasGroupDto },
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        pipe.transform(
          { projectId: 'p1', groupId: 0 },
          { type: 'body', metatype: CanvasGroupDto },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
