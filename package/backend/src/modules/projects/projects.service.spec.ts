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
