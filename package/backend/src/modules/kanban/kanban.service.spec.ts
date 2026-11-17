import {
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SupabaseService } from '../../supabase/supabase.service';
import { KanbanService } from './kanban.service';

describe('KanbanService lanes', () => {
  let service: KanbanService;
  const query = {
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    single: jest.fn(),
    maybeSingle: jest.fn(),
    returns: jest.fn(),
  };
  const client = { from: jest.fn().mockReturnValue(query) };
  const lane = {
    id: 'custom-lane',
    name: 'Review',
    color: '#123abc',
    status: 'active',
  };
  const payload = { name: lane.name, color: lane.color };

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        KanbanService,
        { provide: SupabaseService, useValue: { getClient: () => client } },
      ],
    }).compile();
    service = module.get<KanbanService>(KanbanService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('creates a lane with a generated ID and stored color', async () => {
    query.single.mockResolvedValue({ data: lane, error: null });
    await expect(service.createColumn(payload)).resolves.toEqual({
      data: { ...lane, count: 0, tickets: [] },
    });
    expect(query.insert).toHaveBeenCalledWith({
      ...payload,
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it('changes the name and color without changing the lane ID', async () => {
    query.maybeSingle.mockResolvedValue({ data: lane, error: null });
    await expect(service.updateColumn(lane.id, payload)).resolves.toMatchObject(
      {
        data: lane,
      },
    );
    expect(query.update).toHaveBeenCalledWith(payload);
    expect(query.eq).toHaveBeenCalledWith('id', lane.id);
  });

  it('saves lane order by updating each lane position', async () => {
    query.select.mockResolvedValueOnce({
      data: [{ id: 'todo' }, { id: 'review' }],
      error: null,
    });
    await expect(service.reorderColumns(['review', 'todo'])).resolves.toEqual({
      data: { columnIds: ['review', 'todo'] },
    });
    expect(query.update).toHaveBeenNthCalledWith(1, { position: 1 });
    expect(query.update).toHaveBeenNthCalledWith(2, { position: 2 });
    expect(query.eq).toHaveBeenNthCalledWith(1, 'id', 'review');
    expect(query.eq).toHaveBeenNthCalledWith(2, 'id', 'todo');
  });

  it.each([['todo'], ['todo', 'review', 'extra'], ['todo', 'missing']])(
    'rejects a stale lane list without changing any position: %s',
    async (...columnIds) => {
      query.select.mockResolvedValueOnce({
        data: [{ id: 'todo' }, { id: 'review' }],
        error: null,
      });
      await expect(service.reorderColumns(columnIds)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(query.update).not.toHaveBeenCalled();
    },
  );

  it('fails when any lane position cannot be saved', async () => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    query.select.mockResolvedValueOnce({ data: [{ id: 'todo' }], error: null });
    query.eq.mockResolvedValueOnce({ error: { code: 'DB_ERROR' } });
    await expect(service.reorderColumns(['todo'])).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('deletes an empty lane', async () => {
    query.maybeSingle.mockResolvedValue({ data: { id: lane.id }, error: null });
    await expect(service.deleteColumn(lane.id)).resolves.toEqual({
      data: { id: lane.id },
    });
  });

  it('rejects deletion when the database finds any card, including a concurrent insert', async () => {
    query.maybeSingle.mockResolvedValue({
      data: null,
      error: { code: '23503' },
    });
    await expect(service.deleteColumn(lane.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it.each(['update', 'delete'])(
    'returns not found for a missing lane on %s',
    async (operation) => {
      query.maybeSingle.mockResolvedValue({ data: null, error: null });
      const request =
        operation === 'update'
          ? service.updateColumn(lane.id, payload)
          : service.deleteColumn(lane.id);
      await expect(request).rejects.toBeInstanceOf(NotFoundException);
    },
  );

  it.each(['create', 'update', 'delete'])(
    'surfaces database errors on %s without exposing details',
    async (operation) => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      const failure = {
        data: null,
        error: { code: 'DB_ERROR', message: 'private details' },
      };
      query.single.mockResolvedValue(failure);
      query.maybeSingle.mockResolvedValue(failure);
      const request =
        operation === 'create'
          ? service.createColumn(payload)
          : operation === 'update'
            ? service.updateColumn(lane.id, payload)
            : service.deleteColumn(lane.id);
      await expect(request).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        expect.not.stringContaining('private details'),
      );
    },
  );

  it('loads persisted colors and uses database lane order rather than fixed IDs', async () => {
    query.returns.mockResolvedValue({ data: [lane], error: null });
    client.from.mockReturnValueOnce(query).mockReturnValueOnce({
      select: jest.fn().mockResolvedValue({ data: [], error: null }),
    });
    await expect(service.getBoard()).resolves.toEqual({
      data: [{ ...lane, count: 0, tickets: [] }],
    });
    expect(query.order).toHaveBeenCalledWith('position', { ascending: true });
  });
});
