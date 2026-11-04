import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  const projectsService = {
    getProjects: jest.fn(),
    createProject: jest.fn(),
    updateProject: jest.fn(),
    deleteProject: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectsController],
      providers: [{ provide: ProjectsService, useValue: projectsService }],
    }).compile();

    controller = module.get<ProjectsController>(ProjectsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate getProjects to the service', () => {
    projectsService.getProjects.mockReturnValue('projects');

    expect(controller.getProjects()).toBe('projects');
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
