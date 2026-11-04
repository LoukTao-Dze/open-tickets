import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;
  const appService = {
    getHealth: jest.fn(),
    getAllProjects: jest.fn(),
    uploadImageToDiscord: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: appService }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('should return the health status from the service', async () => {
    const health = { backend_healthy: { status: 'healthy' } };
    appService.getHealth.mockResolvedValue(health);

    await expect(appController.getHealth()).resolves.toBe(health);
  });

  it('should return all projects from the service', async () => {
    const projects = { data: [{ id: '1' }] };
    appService.getAllProjects.mockResolvedValue(projects);

    await expect(appController.getAllProjects()).resolves.toBe(projects);
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
