import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../supabase/supabase.service';
import { CanvasService } from './canvas.service';

describe('CanvasService', () => {
  let service: CanvasService;
  let singleResult: { data: unknown; error: unknown };
  const queryBuilder = {
    upsert: jest.fn(),
    select: jest.fn(),
    single: jest.fn(),
  };
  const client = { from: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    singleResult = { data: { id: '1' }, error: null };
    client.from.mockReturnValue(queryBuilder);
    queryBuilder.upsert.mockReturnValue(queryBuilder);
    queryBuilder.select.mockReturnValue(queryBuilder);
    queryBuilder.single.mockImplementation(() => Promise.resolve(singleResult));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CanvasService,
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: SupabaseService, useValue: { getClient: () => client } },
      ],
    }).compile();

    service = module.get<CanvasService>(CanvasService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('saveCanvasItem', () => {
    it('should reject an unsupported type', async () => {
      await expect(
        service.saveCanvasItem({
          projectId: 'p1',
          type: 'unknown',
          x: 0,
          y: 0,
          zIndex: 0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject a missing projectId', async () => {
      await expect(
        service.saveCanvasItem({
          projectId: '',
          type: 'text',
          x: 0,
          y: 0,
          zIndex: 0,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should upsert the record using snake_case keys', async () => {
      const result = await service.saveCanvasItem({
        projectId: 'p1',
        type: 'sticky-note',
        x: 1,
        y: 2,
        zIndex: 3,
      });

      expect(client.from).toHaveBeenCalledWith('sticky_notes');
      expect(queryBuilder.upsert).toHaveBeenCalledWith(
        { project_id: 'p1', x: 1, y: 2, z_index: 3 },
        { onConflict: 'id' },
      );
      expect(result).toEqual({
        message: 'Canvas item saved',
        data: { id: '1' },
      });
    });

    it('should wrap persistence errors', async () => {
      singleResult = { data: null, error: new Error('db down') };

      await expect(
        service.saveCanvasItem({
          projectId: 'p1',
          type: 'text',
          x: 0,
          y: 0,
          zIndex: 0,
        }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('getCanvasItem', () => {
    it('should merge items from every table with camelCase keys and type', async () => {
      const filterBuilder = {
        eq: jest.fn(),
        then: (resolve: (value: unknown) => void) =>
          resolve({ data: [{ project_id: 'p1', z_index: 1 }], error: null }),
      };
      filterBuilder.eq.mockReturnValue(filterBuilder);
      client.from.mockReturnValue({
        select: jest.fn().mockReturnValue(filterBuilder),
      });

      const result = await service.getCanvasItem('p1');

      expect(client.from).toHaveBeenCalledTimes(6);
      expect(filterBuilder.eq).toHaveBeenCalledWith('project_id', 'p1');
      expect(result.data).toHaveLength(6);
      expect(result.data[0]).toEqual({
        projectId: 'p1',
        zIndex: 1,
        type: 'sticky-note',
      });
    });

    it('should wrap query errors', async () => {
      const failingBuilder = {
        then: (resolve: (value: unknown) => void) =>
          resolve({ data: null, error: new Error('boom') }),
      };
      client.from.mockReturnValue({
        select: jest.fn().mockReturnValue(failingBuilder),
      });

      await expect(service.getCanvasItem()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('deleteCanvasItem', () => {
    it('should require id and type', async () => {
      await expect(
        service.deleteCanvasItem({ id: '', type: 'text' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject an unsupported type', async () => {
      await expect(
        service.deleteCanvasItem({ id: '1', type: 'unknown' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should delete the item', async () => {
      const deleteBuilder = {
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { id: '1' }, error: null }),
      };
      client.from.mockReturnValue({
        delete: jest.fn().mockReturnValue(deleteBuilder),
      });

      await expect(
        service.deleteCanvasItem({ id: '1', type: 'text' }),
      ).resolves.toEqual({ message: 'Canvas item deleted', data: { id: '1' } });
      expect(client.from).toHaveBeenCalledWith('texts');
    });
  });
});
