import { Test, TestingModule } from '@nestjs/testing';
import { CanvasController } from './canvas.controller';
import { CanvasService } from './canvas.service';
import { SessionGuard } from '../../auth/session.guard';
import { EnumUserRole } from '../../auth/auth.dto';
import { ProjectAccessService } from '../roles/project-access.service';

describe('CanvasController', () => {
  let controller: CanvasController;
  const canvasService = {
    saveCanvasItem: jest.fn(),
    getCanvasItem: jest.fn(),
    deleteCanvasItem: jest.fn(),
  };

  const projectAccess = { filterByProject: jest.fn() };
  const session = {
    user: { role: EnumUserRole.GUEST },
  } as Parameters<CanvasController['getCanvasItem']>[0];

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CanvasController],
      providers: [
        { provide: CanvasService, useValue: canvasService },
        { provide: ProjectAccessService, useValue: projectAccess },
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
});
