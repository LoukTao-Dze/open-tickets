import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SessionGuard } from './auth/session.guard';
import { EnumUserRole } from './auth/auth.dto';
import { ProjectAccessService } from './modules/roles/project-access.service';

describe('AppController', () => {
  let appController: AppController;
  const appService = {
    getHealth: jest.fn(),
    getAllProjects: jest.fn(),
    uploadImageToDiscord: jest.fn(),
  };

  const projectAccess = { filterByProject: jest.fn() };
  const session = {
    user: { role: EnumUserRole.GUEST },
  } as Parameters<AppController['getAllProjects']>[0];

  beforeEach(async () => {
    jest.resetAllMocks();
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: AppService, useValue: appService },
        { provide: ProjectAccessService, useValue: projectAccess },
      ],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    appController = app.get<AppController>(AppController);
  });

  it('should return the health status from the service', async () => {
    const health = { backend_healthy: { status: 'healthy' } };
    appService.getHealth.mockResolvedValue(health);

    await expect(appController.getHealth()).resolves.toBe(health);
  });

  it('should return all projects from the service', async () => {
    const projects = { data: [{ id: '1' }, { id: '2' }] };
    appService.getAllProjects.mockResolvedValue(projects);
    projectAccess.filterByProject.mockResolvedValue([{ id: '1' }]);

    await expect(appController.getAllProjects(session)).resolves.toEqual({
      data: [{ id: '1' }],
    });
    expect(projectAccess.filterByProject).toHaveBeenCalledWith(
      EnumUserRole.GUEST,
      projects.data,
      expect.any(Function),
    );
  });

  describe('uploadImageToDiscord', () => {
    it('should throw when no image is provided', () => {
      expect(() => appController.uploadImageToDiscord('1', undefined)).toThrow(
        BadRequestException,
      );
      expect(appService.uploadImageToDiscord).not.toHaveBeenCalled();
    });

    it('should forward the image to the service', async () => {
      const buffer = Buffer.from('image');
      appService.uploadImageToDiscord.mockResolvedValue({ id: 'message' });

      await expect(
        appController.uploadImageToDiscord('1', {
          buffer,
          originalname: 'a.png',
        }),
      ).resolves.toEqual({ id: 'message' });
      expect(appService.uploadImageToDiscord).toHaveBeenCalledWith(
        buffer,
        'a.png',
        '1',
      );
    });
  });
});
