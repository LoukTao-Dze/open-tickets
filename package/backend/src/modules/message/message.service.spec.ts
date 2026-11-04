import { Test, TestingModule } from '@nestjs/testing';
import { createClient } from '@supabase/supabase-js';
import { MessageService } from './message.service';

jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

describe('MessageService', () => {
  let service: MessageService;
  const insert = jest.fn();
  const from = jest.fn();

  beforeEach(async () => {
    jest.resetAllMocks();
    from.mockReturnValue({ insert });
    insert.mockResolvedValue({ error: null });
    (createClient as jest.Mock).mockReturnValue({ from });

    const module: TestingModule = await Test.createTestingModule({
      providers: [MessageService],
    }).compile();

    service = module.get<MessageService>(MessageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should insert the message into the messages table', async () => {
    const message = { id: 'm1', content: 'hello' };

    await service.save(message);

    expect(from).toHaveBeenCalledWith('messages');
    expect(insert).toHaveBeenCalledWith(message);
  });
});
