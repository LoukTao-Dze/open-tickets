import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SupabaseService } from '../../supabase/supabase.service';
import { CanvasService } from './canvas.service';

describe('CanvasService', () => {
  let service: CanvasService;
  let singleResult: { data: unknown; error: unknown };
  let rpcResult: { data?: unknown; error: unknown };
  const queryBuilder = {
    upsert: jest.fn(),
    select: jest.fn(),
    single: jest.fn(),
  };
  const client = { from: jest.fn(), rpc: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    singleResult = { data: { id: '1' }, error: null };
    rpcResult = { data: null, error: null };
    client.rpc.mockReturnValue({
      returns: () => Promise.resolve(rpcResult),
      overrideTypes: () => Promise.resolve(rpcResult),
    });
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

    describe('connections', () => {
      it('loads project connections using camelCase response fields', async () => {
        const connection = {
          id: 8,
          project_id: 'p1',
          source_item_id: 1,
          source_item_type: 'text',
          source_anchor: null,
          target_item_id: 2,
          target_item_type: 'sticky-note',
          target_anchor: 'bottom',
          color: '#414752',
          stroke_width: 2,
        };
        const builder = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          returns: jest
            .fn()
            .mockResolvedValue({ data: [connection], error: null }),
        };
        client.from.mockReturnValue(builder);

        await expect(service.getConnections('p1')).resolves.toEqual({
          data: [
            {
              id: 8,
              projectId: 'p1',
              sourceItemId: 1,
              sourceItemType: 'text',
              sourceAnchor: null,
              targetItemId: 2,
              targetItemType: 'sticky-note',
              targetAnchor: 'bottom',
              color: '#414752',
              strokeWidth: 2,
            },
          ],
        });
        expect(client.from).toHaveBeenCalledWith('canvas_connections');
        expect(builder.eq).toHaveBeenCalledWith('project_id', 'p1');
        await expect(service.getConnections('')).rejects.toThrow(
          BadRequestException,
        );
      });

      it('creates a connection through the project-validating database function', async () => {
        const connection = {
          id: 8,
          project_id: 'p1',
          source_item_id: 1,
          source_item_type: 'text',
          source_anchor: 'top',
          target_item_id: 2,
          target_item_type: 'sticky-note',
          target_anchor: 'bottom',
          color: '#414752',
          stroke_width: 2,
        };
        rpcResult = { data: [connection], error: null };
        await expect(
          service.createConnection({
            projectId: 'p1',
            sourceItemId: 1,
            sourceItemType: 'text',
            sourceAnchor: 'top',
            targetItemId: 2,
            targetItemType: 'sticky-note',
            targetAnchor: 'bottom',
          }),
        ).resolves.toEqual({
          data: {
            id: 8,
            projectId: 'p1',
            sourceItemId: 1,
            sourceItemType: 'text',
            sourceAnchor: 'top',
            targetItemId: 2,
            targetItemType: 'sticky-note',
            targetAnchor: 'bottom',
            color: '#414752',
            strokeWidth: 2,
          },
        });
        expect(client.rpc).toHaveBeenCalledWith(
          'create_canvas_connection_with_anchors',
          {
            p_project_id: 'p1',
            p_source_item_id: 1,
            p_source_item_type: 'text',
            p_source_anchor: 'top',
            p_target_item_id: 2,
            p_target_item_type: 'sticky-note',
            p_target_anchor: 'bottom',
          },
        );
        rpcResult = {
          data: [{ ...connection, source_anchor: null, target_anchor: null }],
          error: null,
        };
        await expect(
          service.createConnection({
            projectId: 'p1',
            sourceItemId: 1,
            sourceItemType: 'text',
            targetItemId: 2,
            targetItemType: 'sticky-note',
          }),
        ).resolves.toMatchObject({ data: { sourceAnchor: null } });
        expect(client.rpc).toHaveBeenLastCalledWith(
          'create_canvas_connection_with_anchors',
          {
            p_project_id: 'p1',
            p_source_item_id: 1,
            p_source_item_type: 'text',
            p_source_anchor: null,
            p_target_item_id: 2,
            p_target_item_type: 'sticky-note',
            p_target_anchor: null,
          },
        );
        await expect(
          service.createConnection({
            projectId: 'p1',
            sourceItemId: 1,
            sourceItemType: 'text',
            targetItemId: 1,
            targetItemType: 'text',
          }),
        ).rejects.toThrow(BadRequestException);
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

    it('creates a project-scoped group and lets the database name blank groups', async () => {
      const items = [
        { id: 1, type: 'text' },
        { id: 1, type: 'image' },
      ];
      rpcResult = {
        data: { id: 7, name: 'Group-7' },
        error: null,
      };
      await expect(
        service.createGroup({ projectId: 'p1', items, name: '  ' }),
      ).resolves.toEqual({ data: { id: 7, name: 'Group-7' } });
      expect(client.rpc).toHaveBeenCalledWith('create_canvas_group', {
        p_project_id: 'p1',
        p_items: items,
        p_name: null,
      });
    });

    it('deletes mixed item types in one transaction', async () => {
      const items = [
        { id: 1, type: 'text' },
        { id: 1, type: 'image' },
      ];
      rpcResult = { data: 2, error: null };
      await expect(
        service.deleteCanvasItems({ projectId: 'p1', items }),
      ).resolves.toEqual({ deletedCount: 2 });
      expect(client.rpc).toHaveBeenCalledWith('mutate_canvas_selection', {
        p_project_id: 'p1',
        p_items: items,
        p_delete: true,
        p_group_id: null,
      });
    });

    it('moves a group using a project-scoped delta', async () => {
      rpcResult = { error: null };
      await service.moveGroup({ projectId: 'p1', groupId: 7, dx: -25, dy: 50 });
      expect(client.rpc).toHaveBeenCalledWith('move_canvas_group', {
        p_project_id: 'p1',
        p_group_id: 7,
        p_dx: -25,
        p_dy: 50,
      });
    });

    it('reports stale selections as conflicts rather than success', async () => {
      rpcResult = { data: null, error: { code: 'P0002' } };
      await expect(
        service.deleteCanvasItems({
          projectId: 'p1',
          items: [{ id: 1, type: 'text' }],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('does not expose database errors to clients', async () => {
      rpcResult = {
        data: null,
        error: { code: 'XX000', message: 'private detail' },
      };
      await expect(
        service.createGroup({
          projectId: 'p1',
          items: [{ id: 1, type: 'text' }],
        }),
      ).rejects.toThrow('Failed to update canvas selection');
    });

    it('loads group labels only from the requested project', async () => {
      const builder = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        returns: jest.fn().mockResolvedValue({
          data: [{ id: 7, name: 'Group-7', color: '#123456' }],
          error: null,
        }),
      };
      client.from.mockReturnValue(builder);
      await expect(service.getGroups('p1')).resolves.toEqual({
        data: [{ id: 7, name: 'Group-7', color: '#123456' }],
      });
      expect(builder.select).toHaveBeenCalledWith(
        'id, name, project_id, color',
      );
      expect(builder.eq).toHaveBeenCalledWith('project_id', 'p1');
      await expect(service.getGroups('')).rejects.toThrow(BadRequestException);
    });

    it('does not let ordinary item saves overwrite group membership', async () => {
      await service.saveCanvasItem({
        id: '1',
        projectId: 'p1',
        type: 'text',
        x: 1,
        y: 2,
        zIndex: 3,
        groupId: 99,
        group_id: 100,
      });
      expect(queryBuilder.upsert).toHaveBeenCalledWith(
        { id: '1', project_id: 'p1', x: 1, y: 2, z_index: 3 },
        { onConflict: 'id' },
      );
    });
  });

  describe('group management', () => {
    const groupQuery = {
      update: jest.fn(),
      delete: jest.fn(),
      eq: jest.fn(),
      select: jest.fn(),
      single: queryBuilder.single,
    };

    beforeEach(() => {
      client.from.mockReturnValue(groupQuery);
      groupQuery.update.mockReturnValue(groupQuery);
      groupQuery.delete.mockReturnValue(groupQuery);
      groupQuery.eq.mockReturnValue(groupQuery);
      groupQuery.select.mockReturnValue(groupQuery);
    });

    it('updates a group name and color only within its project', async () => {
      const group = {
        id: 7,
        project_id: 'p1',
        name: 'Release',
        color: '#aabbcc',
      };
      singleResult = { data: group, error: null };
      await expect(
        service.updateGroup({
          projectId: 'p1',
          groupId: 7,
          name: ' Release ',
          color: '#AABBCC',
        }),
      ).resolves.toEqual({ data: group });
      expect(client.from).toHaveBeenCalledWith('canvas_groups');
      expect(groupQuery.update).toHaveBeenCalledWith({
        name: 'Release',
        color: '#aabbcc',
      });
      expect(groupQuery.eq).toHaveBeenCalledWith('project_id', 'p1');
      expect(groupQuery.eq).toHaveBeenCalledWith('id', 7);
    });

    it('resets a blank group name to its default', async () => {
      await service.updateGroup({
        projectId: 'p1',
        groupId: 7,
        name: '  ',
        color: '#414752',
      });
      expect(groupQuery.update).toHaveBeenCalledWith({
        name: 'Group-7',
        color: '#414752',
      });
    });

    it('ungroups by deleting only the project-scoped group, leaving item detachment to foreign keys', async () => {
      singleResult = { data: { id: 7 }, error: null };
      await expect(
        service.ungroup({ projectId: 'p1', groupId: 7 }),
      ).resolves.toEqual({ groupId: 7 });
      expect(client.from).toHaveBeenCalledTimes(1);
      expect(client.from).toHaveBeenCalledWith('canvas_groups');
      expect(groupQuery.delete).toHaveBeenCalledTimes(1);
      expect(groupQuery.eq).toHaveBeenCalledWith('project_id', 'p1');
      expect(groupQuery.eq).toHaveBeenCalledWith('id', 7);
    });

    it('rejects stale or cross-project groups without reporting success', async () => {
      singleResult = { data: null, error: { code: 'PGRST116' } };
      await expect(
        service.updateGroup({
          projectId: 'p2',
          groupId: 7,
          name: 'Other',
          color: '#414752',
        }),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.ungroup({ projectId: 'p2', groupId: 7 }),
      ).rejects.toThrow(ConflictException);
    });

    it('surfaces database failures for both editing and ungrouping', async () => {
      singleResult = { data: null, error: { code: 'XX000' } };
      await expect(
        service.updateGroup({
          projectId: 'p1',
          groupId: 7,
          name: 'Release',
          color: '#414752',
        }),
      ).rejects.toThrow(InternalServerErrorException);
      await expect(
        service.ungroup({ projectId: 'p1', groupId: 7 }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  it('updates connection color and thickness within the project', async () => {
    const connection = {
      id: 8,
      project_id: 'p1',
      source_item_id: 1,
      source_item_type: 'text',
      source_anchor: null,
      target_item_id: 2,
      target_item_type: 'sticky-note',
      target_anchor: null,
      color: '#ff0000',
      stroke_width: 4,
    };
    const builder = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: connection, error: null }),
    };
    client.from.mockReturnValue(builder);

    await expect(
      service.updateConnectionStyle({
        projectId: 'p1',
        connectionId: 8,
        color: '#FF0000',
        strokeWidth: 4,
      }),
    ).resolves.toEqual({
      data: {
        id: 8,
        projectId: 'p1',
        sourceItemId: 1,
        sourceItemType: 'text',
        sourceAnchor: null,
        targetItemId: 2,
        targetItemType: 'sticky-note',
        targetAnchor: null,
        color: '#ff0000',
        strokeWidth: 4,
      },
    });
    expect(builder.update).toHaveBeenCalledWith({
      color: '#ff0000',
      stroke_width: 4,
    });
    expect(builder.eq).toHaveBeenCalledWith('project_id', 'p1');
    expect(builder.eq).toHaveBeenCalledWith('id', 8);
  });

  it('deletes only the project-scoped connection', async () => {
    const builder = {
      delete: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: 8 }, error: null }),
    };
    client.from.mockReturnValue(builder);

    await expect(
      service.deleteConnection({ projectId: 'p1', connectionId: 8 }),
    ).resolves.toEqual({ id: 8 });
    expect(client.from).toHaveBeenCalledWith('canvas_connections');
    expect(builder.eq).toHaveBeenCalledWith('project_id', 'p1');
    expect(builder.eq).toHaveBeenCalledWith('id', 8);
  });
});
