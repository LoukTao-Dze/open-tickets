import { Test, TestingModule } from '@nestjs/testing';
import { AppGateway } from '../gateway/gateway';
import { MessageService } from '../message/message.service';
import { DiscordService } from './discord.service';

describe('DiscordService', () => {
  let service: DiscordService;
  const gateway = { emitMessage: jest.fn() };
  const messageService = { save: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordService,
        { provide: AppGateway, useValue: gateway },
        { provide: MessageService, useValue: messageService },
      ],
    }).compile();

    service = module.get<DiscordService>(DiscordService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleMessage', () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const buildMessage = (isBot: boolean) =>
      ({
        id: 'm1',
        channelId: 'c1',
        content: 'hello',
        author: { bot: isBot, username: 'alice' },
        createdAt,
      }) as never;
    const handleMessage = (message: never): Promise<void> =>
      (
        service as unknown as {
          handleMessage: (msg: never) => Promise<void>;
        }
      ).handleMessage(message);

    it('should ignore bot messages', async () => {
      await handleMessage(buildMessage(true));

      expect(messageService.save).not.toHaveBeenCalled();
      expect(gateway.emitMessage).not.toHaveBeenCalled();
    });

    it('should save and emit user messages', async () => {
      const expected = {
        id: 'm1',
        channel_id: 'c1',
        content: 'hello',
        author: 'alice',
        created_at: createdAt,
      };

      await handleMessage(buildMessage(false));

      expect(messageService.save).toHaveBeenCalledWith(expected);
      expect(gateway.emitMessage).toHaveBeenCalledWith('c1', expected);
    });
  });
});
