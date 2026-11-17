import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { EnumUserRole } from '../../auth/auth.dto';
import { SessionGuard } from '../../auth/session.guard';
import { ProjectAccessService } from '../roles/project-access.service';
import { KanbanController } from './kanban.controller';
import { KanbanService } from './kanban.service';

describe('KanbanController', () => {
  let controller: KanbanController;
  const kanbanService = {
    getBoard: jest.fn(),
    reorderColumns: jest.fn(),
    createColumn: jest.fn(),
    updateColumn: jest.fn(),
    deleteColumn: jest.fn(),
  };
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

  afterEach(() => jest.clearAllMocks());

  it.each([EnumUserRole.ADMIN, EnumUserRole.USER])(
    'allows %s to manage board-wide lanes',
    (role) => {
      const editorSession = { ...session, user: { ...session.user, role } };
      const payload = { name: 'Review', color: '#123abc' };
      controller.createColumn(editorSession, payload);
      controller.updateColumn(editorSession, 'lane-1', payload);
      controller.deleteColumn(editorSession, 'lane-1');
      controller.reorderColumns(editorSession, { columnIds: ['b', 'a'] });
      expect(kanbanService.createColumn).toHaveBeenCalledWith(payload);
      expect(kanbanService.reorderColumns).toHaveBeenCalledWith(['b', 'a']);
      expect(kanbanService.updateColumn).toHaveBeenCalledWith(
        'lane-1',
        payload,
      );
      expect(kanbanService.deleteColumn).toHaveBeenCalledWith('lane-1');
    },
  );

  it.each([EnumUserRole.GUEST, 'custom-role'])(
    'denies lane changes for %s',
    (role) => {
      const viewerSession = { ...session, user: { ...session.user, role } };
      const payload = { name: 'Review', color: '#123abc' };
      expect(() => controller.createColumn(viewerSession, payload)).toThrow(
        ForbiddenException,
      );
      expect(() =>
        controller.updateColumn(viewerSession, 'lane-1', payload),
      ).toThrow(ForbiddenException);
      expect(() => controller.deleteColumn(viewerSession, 'lane-1')).toThrow(
        ForbiddenException,
      );
      expect(() =>
        controller.reorderColumns(viewerSession, { columnIds: ['a'] }),
      ).toThrow(ForbiddenException);
      expect(kanbanService.createColumn).not.toHaveBeenCalled();
      expect(kanbanService.reorderColumns).not.toHaveBeenCalled();
      expect(kanbanService.updateColumn).not.toHaveBeenCalled();
      expect(kanbanService.deleteColumn).not.toHaveBeenCalled();
    },
  );

  it('requires server-side sessions for every lane mutation', () => {
    for (const handler of [
      controller.createColumn,
      controller.reorderColumns,
      controller.updateColumn,
      controller.deleteColumn,
    ]) {
      expect(Reflect.getMetadata('__guards__', handler)).toContain(
        SessionGuard,
      );
    }
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
