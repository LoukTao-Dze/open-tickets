import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ColumnDto, ColumnOrderDto } from './column.dto';
import { CreateTicketDto } from './create-ticket.dto';
import { MoveTicketDto } from './move-ticket.dto';
import { UpdateTicketDto } from './update-ticket.dto';

describe('Kanban lane validation', () => {
  it('accepts a unique ordered list of lane IDs', async () => {
    const order = plainToInstance(ColumnOrderDto, { columnIds: ['a', 'b'] });
    expect(await validate(order)).toEqual([]);
  });

  it.each([[[]], [['a', 'a']], [['a', '']], [['a', 1]], ['a'], [undefined]])(
    'rejects an invalid lane order: %j',
    async (columnIds) => {
      const order = plainToInstance(ColumnOrderDto, { columnIds });
      expect(await validate(order)).not.toHaveLength(0);
    },
  );

  it('trims lane names and accepts a six-digit hex color', async () => {
    const lane = plainToInstance(ColumnDto, {
      name: '  Review  ',
      color: '#Aa00Ff',
    });
    expect(await validate(lane)).toEqual([]);
    expect(lane.name).toBe('Review');
  });

  it.each(['', '   ', null, 'x'.repeat(81)])(
    'rejects invalid names: %s',
    async (name) => {
      const lane = plainToInstance(ColumnDto, { name, color: '#123abc' });
      expect(await validate(lane)).not.toHaveLength(0);
    },
  );

  it('accepts a name at the maximum length', async () => {
    expect(
      await validate(
        plainToInstance(ColumnDto, {
          name: 'x'.repeat(80),
          color: '#123abc',
        }),
      ),
    ).toEqual([]);
  });

  it.each(['red', '#fff', '#zzzzzz', '', null, undefined])(
    'rejects invalid colors: %s',
    async (color) => {
      expect(
        await validate(plainToInstance(ColumnDto, { name: 'Review', color })),
      ).not.toHaveLength(0);
    },
  );

  it.each([CreateTicketDto, UpdateTicketDto, MoveTicketDto])(
    'allows custom lane IDs in ticket DTOs',
    async (TicketDto) => {
      const ticket = plainToInstance(TicketDto, {
        columnId: '54861571-6dd7-4aeb-93f6-06aeef821443',
      });
      const errors = await validate(ticket, { skipMissingProperties: true });
      expect(errors).toEqual([]);
    },
  );
});
