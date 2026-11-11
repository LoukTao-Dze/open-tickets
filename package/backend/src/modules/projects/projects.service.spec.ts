import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../supabase/supabase.service';
import { ProjectsService } from './projects.service';

describe('ProjectsService', () => {
  let service: ProjectsService;
  const client = { from: jest.fn() };
  const projectRow = {
    id: 'p1',
    name: 'Project',
    description: null,
    is_default: false,
    created_at: '2026-01-01',
    updated_at: '2026-01-02',
    status: 'Planning',
    priority: 'High',
    deadline: null,
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: SupabaseService, useValue: { getClient: () => client } },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProjects', () => {
    it('should map rows to the API shape', async () => {
      client.from.mockReturnValue({
        select: () => ({
          order: () => Promise.resolve({ data: [projectRow], error: null }),
        }),
      });

      await expect(service.getProjects()).resolves.toEqual({
        data: [
          {
            id: 'p1',
            project_name: 'Project',
            description: null,
            isDefault: false,
            createdAt: '2026-01-01',
            updatedAt: '2026-01-02',
            status: 'Planning',
            priority: 'High',
            deadline: null,
          },
        ],
      });
    });

    it('should wrap query errors', async () => {
      client.from.mockReturnValue({
        select: () => ({
          order: () =>
            Promise.resolve({ data: null, error: new Error('db down') }),
        }),
      });

      await expect(service.getProjects()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('createProject', () => {
    it('should insert the project with defaults', async () => {
      const insert = jest.fn().mockReturnValue({
        select: () => ({
          single: () => Promise.resolve({ data: projectRow, error: null }),
        }),
      });
      client.from.mockReturnValue({ insert });

      const result = await service.createProject({
        name: 'Project',
        status: 'Planning',
      });

      expect(insert).toHaveBeenCalledWith({
        name: 'Project',
        description: null,
        is_default: false,
        priority: null,
        deadline: null,
        status: 'Planning',
      });
      expect(result.message).toBe('Project created');
      expect(result.data.id).toBe('p1');
    });

    it('should wrap persistence errors', async () => {
      client.from.mockReturnValue({
        insert: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({ data: null, error: { message: 'duplicate' } }),
          }),
        }),
      });

      await expect(
        service.createProject({ name: 'Project', status: 'Planning' }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('progress logs', () => {
    const projectLookup = (data: unknown) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data, error: null }),
        }),
      }),
    });

    it('returns project logs ordered by day and creation time', async () => {
      const row = {
        id: 'log-1',
        project_id: 'p1',
        log_date: '2026-11-10',
        details: 'Reviewed scope',
        created_by: 'developer',
        created_at: '2026-11-10T09:00:00.000Z',
      };
      const orderByCreatedAt = jest
        .fn()
        .mockResolvedValue({ data: [row], error: null });
      const orderByDate = jest
        .fn()
        .mockReturnValue({ order: orderByCreatedAt });
      const eq = jest.fn().mockReturnValue({ order: orderByDate });
      const select = jest.fn().mockReturnValue({ eq });
      client.from
        .mockReturnValueOnce(projectLookup({ id: 'p1' }))
        .mockReturnValueOnce({ select });

      await expect(service.getProgressLogs('p1')).resolves.toEqual({
        data: [
          {
            id: 'log-1',
            projectId: 'p1',
            date: '2026-11-10',
            details: 'Reviewed scope',
            createdBy: 'developer',
            createdAt: '2026-11-10T09:00:00.000Z',
          },
        ],
      });
      expect(eq).toHaveBeenCalledWith('project_id', 'p1');
      expect(orderByDate).toHaveBeenCalledWith('log_date', {
        ascending: false,
      });
      expect(orderByCreatedAt).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
    });

    it('persists a dated project log with the authenticated author', async () => {
      const row = {
        id: 'log-2',
        project_id: 'p1',
        log_date: '2026-11-10',
        details: 'Completed implementation',
        created_by: 'developer',
        created_at: '2026-11-10T10:00:00.000Z',
      };
      const insert = jest.fn().mockReturnValue({
        select: () => ({
          single: () => Promise.resolve({ data: row, error: null }),
        }),
      });
      client.from
        .mockReturnValueOnce(projectLookup({ id: 'p1' }))
        .mockReturnValueOnce({ insert });

      await expect(
        service.createProgressLog(
          'p1',
          row.log_date,
          row.details,
          row.created_by,
        ),
      ).resolves.toEqual({
        message: 'Progress log created',
        data: {
          id: 'log-2',
          projectId: 'p1',
          date: '2026-11-10',
          details: 'Completed implementation',
          createdBy: 'developer',
          createdAt: '2026-11-10T10:00:00.000Z',
        },
      });
      expect(insert).toHaveBeenCalledWith({
        project_id: 'p1',
        log_date: row.log_date,
        details: row.details,
        created_by: row.created_by,
      });
    });

    it('deletes a log only when it belongs to the project', async () => {
      const eqLogId = jest.fn().mockReturnValue({
        select: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: { id: 'log-1' }, error: null }),
        }),
      });
      const eqProjectId = jest.fn().mockReturnValue({ eq: eqLogId });
      const deleteLog = jest.fn().mockReturnValue({ eq: eqProjectId });
      client.from
        .mockReturnValueOnce(projectLookup({ id: 'p1' }))
        .mockReturnValueOnce({ delete: deleteLog });

      await expect(service.deleteProgressLog('p1', 'log-1')).resolves.toEqual({
        message: 'Progress log deleted',
        data: { id: 'log-1' },
      });
      expect(eqProjectId).toHaveBeenCalledWith('project_id', 'p1');
      expect(eqLogId).toHaveBeenCalledWith('id', 'log-1');
    });

    it('returns not found when the log does not belong to the project', async () => {
      const eqLogId = jest.fn().mockReturnValue({
        select: () => ({
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }),
      });
      const eqProjectId = jest.fn().mockReturnValue({ eq: eqLogId });
      client.from
        .mockReturnValueOnce(projectLookup({ id: 'p1' }))
        .mockReturnValueOnce({
          delete: () => ({ eq: eqProjectId }),
        });

      await expect(service.deleteProgressLog('p1', 'log-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteProject', () => {
    const mockExistingLookup = (data: unknown) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data, error: null }),
        }),
      }),
    });

    it('should throw NotFoundException when the project does not exist', async () => {
      client.from.mockReturnValue(mockExistingLookup(null));

      await expect(service.deleteProject('p1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delete an existing project', async () => {
      client.from
        .mockReturnValueOnce(mockExistingLookup({ id: 'p1' }))
        .mockReturnValueOnce({
          delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        });

      await expect(service.deleteProject('p1')).resolves.toEqual({
        message: 'Project deleted',
        data: { id: 'p1' },
      });
    });
  });
});
