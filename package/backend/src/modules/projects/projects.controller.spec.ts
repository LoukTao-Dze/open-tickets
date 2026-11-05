import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { SessionGuard } from '../../auth/session.guard';
import { EnumUserRole } from '../../auth/auth.dto';
import { ProjectAccessService } from '../roles/project-access.service';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  const projectsService = {
    getProjects: jest.fn(),
    createProject: jest.fn(),
    updateProject: jest.fn(),
    deleteProject: jest.fn(),
  };

  const projectAccess = { filterByProject: jest.fn() };
  const session = {
    user: { role: EnumUserRole.USER },
  } as Parameters<ProjectsController['getProjects']>[0];

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [
        { provide: ProjectsService, useValue: projectsService },
        { provide: ProjectAccessService, useValue: projectAccess },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ProjectsController>(ProjectsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return only projects the role can access', async () => {
    const projects = [{ id: 'p1' }, { id: 'p2' }];
    projectsService.getProjects.mockResolvedValue({ data: projects });
    projectAccess.filterByProject.mockResolvedValue([projects[0]]);

    await expect(controller.getProjects(session)).resolves.toEqual({
      data: [{ id: 'p1' }],
    });
    expect(projectAccess.filterByProject).toHaveBeenCalledWith(
      EnumUserRole.USER,
      projects,
      expect.any(Function),
    );
  });

  it('should delegate createProject to the service', () => {
    const body = { name: 'Project', status: 'Planning' };
    projectsService.createProject.mockReturnValue('created');

    expect(controller.createProject(body)).toBe('created');
    expect(projectsService.createProject).toHaveBeenCalledWith(body);
  });

  it('should delegate updateProject to the service', () => {
    projectsService.updateProject.mockReturnValue('updated');

    expect(controller.updateProject('id', { name: 'New' })).toBe('updated');
    expect(projectsService.updateProject).toHaveBeenCalledWith('id', {
      name: 'New',
    });
  });

  it('should delegate deleteProject to the service', () => {
    projectsService.deleteProject.mockReturnValue('deleted');

    expect(controller.deleteProject('id')).toBe('deleted');
    expect(projectsService.deleteProject).toHaveBeenCalledWith('id');
  });
});
