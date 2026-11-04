import { Test, TestingModule } from '@nestjs/testing';
import { CanvasController } from './canvas.controller';
import { CanvasService } from './canvas.service';

describe('CanvasController', () => {
  let controller: CanvasController;
  const canvasService = {
    saveCanvasItem: jest.fn(),
    getCanvasItem: jest.fn(),
    deleteCanvasItem: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CanvasController],
      providers: [{ provide: CanvasService, useValue: canvasService }],
    }).compile();

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

  it('should delegate getCanvasItem to the service', () => {
    canvasService.getCanvasItem.mockReturnValue('items');

    expect(controller.getCanvasItem('p1')).toBe('items');
    expect(canvasService.getCanvasItem).toHaveBeenCalledWith('p1');
  });

  it('should delegate deleteCanvasItem to the service', () => {
    const body = { id: '1', type: 'text' };
    canvasService.deleteCanvasItem.mockReturnValue('deleted');

    expect(controller.deleteCanvasItem(body)).toBe('deleted');
    expect(canvasService.deleteCanvasItem).toHaveBeenCalledWith(body);
  });
});
