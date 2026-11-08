import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SupabaseService } from '../../supabase/supabase.service';
import { DocsService } from './docs.service';

describe('DocsService', () => {
  let service: DocsService;
  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn(),
  };
  const client = { from: jest.fn(() => query) };
  const row = {
    content: '# Guide',
    updated_at: '2026-11-08T08:00:00.123456+00:00',
  };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        DocsService,
        { provide: SupabaseService, useValue: { getClient: () => client } },
      ],
    }).compile();
    service = module.get<DocsService>(DocsService);
    query.maybeSingle.mockResolvedValue({ data: row, error: null });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('loads the singleton guide and preserves timestamp precision', async () => {
    await expect(service.getGuide()).resolves.toEqual({
      data: { content: row.content, updatedAt: row.updated_at },
    });
    expect(client.from).toHaveBeenCalledWith('documentation');
    expect(query.eq).toHaveBeenCalledWith('id', 'user-guide');
  });

  it('reports a missing guide rather than returning a success-shaped default', async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(service.getGuide()).rejects.toMatchObject({ status: 404 });
  });

  it('atomically saves only the version the admin loaded', async () => {
    await expect(
      service.updateGuide({
        content: '# Updated',
        updatedAt: row.updated_at,
      }),
    ).resolves.toEqual({
      data: { content: row.content, updatedAt: row.updated_at },
    });
    expect(query.update).toHaveBeenCalledWith({ content: '# Updated' });
    expect(query.eq).toHaveBeenCalledWith('updated_at', row.updated_at);
  });

  it('rejects stale updates without overwriting the newer version', async () => {
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(
      service.updateGuide({
        content: '# Updated',
        updatedAt: row.updated_at,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it.each(['load', 'save'])(
    'reports database errors on %s without exposing content',
    async (operation) => {
      const log = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});
      query.maybeSingle.mockResolvedValue({
        data: null,
        error: { code: '42501', message: 'sensitive database detail' },
      });
      const pending =
        operation === 'load'
          ? service.getGuide()
          : service.updateGuide({
              content: '# Updated',
              updatedAt: row.updated_at,
            });
      await expect(pending).rejects.toMatchObject({
        status: 500,
        message: 'Unable to access user guide',
      });
      expect(log).toHaveBeenCalledWith(expect.stringContaining('42501'));
      expect(log).not.toHaveBeenCalledWith(
        expect.stringContaining('sensitive'),
      );
    },
  );
});
