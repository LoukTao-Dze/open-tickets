import { Test, TestingModule } from '@nestjs/testing';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { SessionGuard } from '../../auth/session.guard';
import { EnumUserRole } from '../../auth/auth.dto';
import { ProjectAccessService } from '../roles/project-access.service';
import type { Request } from 'express';
import { ForbiddenException } from '@nestjs/common';

describe('ProjectsController', () => {
  let controller: ProjectsController;
  const projectsService = {
    getProjects: jest.fn(),
    getProgressLogs: jest.fn(),
    createProgressLog: jest.fn(),
    deleteProgressLog: jest.fn(),
    createProject: jest.fn(),
    updateProject: jest.fn(),
    deleteProject: jest.fn(),
  };

  const projectAccess = {
    filterByProject: jest.fn(),
    assertProjectAccess: jest.fn(),
  };
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

  it('returns project logs and their edit permission', async () => {
    const logs = [{ id: 'log-1', details: 'Reviewed scope' }];
    projectAccess.assertProjectAccess.mockResolvedValue('edit');
    projectsService.getProgressLogs.mockResolvedValue({ data: logs });

    await expect(controller.getProgressLogs('p1', session)).resolves.toEqual({
      data: { logs, canEdit: true },
    });
    expect(projectAccess.assertProjectAccess).toHaveBeenCalledWith(
      EnumUserRole.USER,
      'p1',
      'view',
    );
    expect(projectsService.getProgressLogs).toHaveBeenCalledWith('p1');
  });

  it('creates a project log with the authenticated username', async () => {
    const body = { date: '2026-11-10', details: 'Completed implementation' };
    const request = { get: jest.fn().mockReturnValue(undefined) } as Request;
    const authenticatedSession = {
      user: { ...session.user, username: 'developer' },
    } as Parameters<ProjectsController['createProgressLog']>[2];
    projectAccess.assertProjectAccess.mockResolvedValue('edit');
    projectsService.createProgressLog.mockResolvedValue({
      data: { id: 'log-1' },
    });

    await expect(
      controller.createProgressLog('p1', body, authenticatedSession, request),
    ).resolves.toEqual({ data: { id: 'log-1' } });
    expect(projectsService.createProgressLog).toHaveBeenCalledWith(
      'p1',
      body.date,
      body.details,
      'developer',
    );
  });

  it('deletes a project log after checking edit access', async () => {
    const request = { get: jest.fn().mockReturnValue(undefined) } as Request;
    projectAccess.assertProjectAccess.mockResolvedValue('edit');
    projectsService.deleteProgressLog.mockResolvedValue({
      data: { id: 'log-1' },
    });

    await expect(
      controller.deleteProgressLog('p1', 'log-1', session, request),
    ).resolves.toEqual({ data: { id: 'log-1' } });
    expect(projectAccess.assertProjectAccess).toHaveBeenCalledWith(
      EnumUserRole.USER,
      'p1',
      'edit',
    );
    expect(projectsService.deleteProgressLog).toHaveBeenCalledWith(
      'p1',
      'log-1',
    );
  });

  it('does not delete a project log without edit access', async () => {
    const request = { get: jest.fn().mockReturnValue(undefined) } as Request;
    projectAccess.assertProjectAccess.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      controller.deleteProgressLog('p1', 'log-1', session, request),
    ).rejects.toThrow(ForbiddenException);
    expect(projectsService.deleteProgressLog).not.toHaveBeenCalled();
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
