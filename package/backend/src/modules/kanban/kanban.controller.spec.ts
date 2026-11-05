import { Test, TestingModule } from '@nestjs/testing';
import { EnumUserRole } from '../../auth/auth.dto';
import { SessionGuard } from '../../auth/session.guard';
import { ProjectAccessService } from '../roles/project-access.service';
import { KanbanController } from './kanban.controller';
import { KanbanService } from './kanban.service';

describe('KanbanController', () => {
  let controller: KanbanController;
  const kanbanService = { getBoard: jest.fn() };
  const projectAccess = { filterByProject: jest.fn() };
  const session = {
    user: { role: EnumUserRole.GUEST },
  } as Parameters<KanbanController['getBoard']>[0];

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [KanbanController],
      providers: [
        { provide: KanbanService, useValue: kanbanService },
        { provide: ProjectAccessService, useValue: projectAccess },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(KanbanController);
  });

  it('removes tickets from inaccessible projects and recounts columns', async () => {
    const allowed = { id: 't1', project: { id: 'p1' } };
    const hidden = { id: 't2', project: { id: 'p2' } };
    kanbanService.getBoard.mockResolvedValue({
      data: [{ id: 'todo', count: 2, tickets: [allowed, hidden] }],
    });
    projectAccess.filterByProject.mockResolvedValue([allowed]);

    await expect(controller.getBoard(session)).resolves.toEqual({
      data: [{ id: 'todo', count: 1, tickets: [allowed] }],
    });
    expect(projectAccess.filterByProject).toHaveBeenCalledWith(
      EnumUserRole.GUEST,
      [allowed, hidden],
      expect.any(Function),
    );
  });
});
