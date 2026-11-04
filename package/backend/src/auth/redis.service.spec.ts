import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { RedisService } from './redis.service';

const mockClient = {
  isOpen: false,
  isReady: false,
  connect: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  on: jest.fn(),
  set: jest
    .fn<
      Promise<string>,
      [key: string, value: string, options: { EX: number }]
    >()
    .mockResolvedValue('OK'),
  get: jest.fn<Promise<string | null>, [key: string]>().mockResolvedValue(null),
  del: jest.fn<Promise<number>, [key: string]>().mockResolvedValue(1),
  eval: jest
    .fn<
      Promise<unknown>,
      [script: string, options: { keys: string[]; arguments: string[] }]
    >()
    .mockResolvedValue(1),
  destroy: jest.fn(),
};

jest.mock('redis', () => ({ createClient: () => mockClient }));

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(() => {
    mockClient.isOpen = false;
    mockClient.isReady = false;
    mockClient.connect.mockImplementation(() => {
      mockClient.isOpen = true;
      mockClient.isReady = true;
      return Promise.resolve();
    });
    service = new RedisService(
      new ConfigService({ REDIS_URL: 'redis://localhost:6379' }),
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('stores the session with Redis EX and returns a missing session as null', async () => {
    expect(await service.setSession('session-key', '{}', 60)).toBe('OK');
    expect(mockClient.set).toHaveBeenCalledWith('session-key', '{}', {
      EX: 60,
    });
    expect(await service.getSession('missing')).toBeNull();
    expect(mockClient.connect).toHaveBeenCalledTimes(1);
  });

  it('waits for the same initial connection across concurrent requests', async () => {
    let finishConnection: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      finishConnection = resolve;
    });
    mockClient.connect.mockImplementationOnce(async () => {
      mockClient.isOpen = true;
      await pending;
      mockClient.isReady = true;
    });
    const first = service.getSession('first');
    const second = service.getSession('second');
    expect(mockClient.connect).toHaveBeenCalledTimes(1);
    expect(mockClient.get).not.toHaveBeenCalled();
    finishConnection?.();
    await Promise.all([first, second]);
    expect(mockClient.get).toHaveBeenCalledTimes(2);
  });

  it('increments attempts and sets the first expiry atomically', async () => {
    expect(await service.recordAttempt('attempt-key')).toBe(1);
    expect(mockClient.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('EXPIRE'"),
      { keys: ['attempt-key'], arguments: ['60'] },
    );
  });

  it('deletes only the requested session key', async () => {
    expect(await service.deleteSession('session-key')).toBe(1);
    expect(mockClient.del).toHaveBeenCalledWith('session-key');
  });

  it('returns zero for an already deleted session', async () => {
    mockClient.del.mockResolvedValueOnce(0);
    expect(await service.deleteSession('missing')).toBe(0);
  });

  it('surfaces deletion failures', async () => {
    mockClient.del.mockRejectedValueOnce(new Error('Delete failed'));
    await expect(service.deleteSession('session-key')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('surfaces connection failure and retries on a later request', async () => {
    mockClient.connect.mockRejectedValueOnce(new Error('Connection refused'));
    await expect(service.getSession('key')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.getSession('key')).resolves.toBeNull();
  });

  it('surfaces write failures instead of succeeding without a persisted session', async () => {
    mockClient.set.mockRejectedValueOnce(new Error('Write failed'));
    await expect(service.setSession('key', '{}', 60)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('rejects invalid rate-limit replies', async () => {
    mockClient.eval.mockResolvedValueOnce(null);
    await expect(service.recordAttempt('key')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('closes the client when the module is destroyed', async () => {
    await service.getSession('key');
    service.onModuleDestroy();
    expect(mockClient.destroy).toHaveBeenCalledTimes(1);
  });
});
