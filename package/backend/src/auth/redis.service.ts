import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from 'redis';
import { LOGIN_WINDOW_SECONDS } from './auth.constants';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: ReturnType<typeof createClient>;
  private connection?: Promise<unknown>;

  constructor(config: ConfigService) {
    this.client = createClient({
      url: config.getOrThrow<string>('REDIS_URL'),
      socket: { connectTimeout: 5000, reconnectStrategy: false },
      disableOfflineQueue: true,
    });
    // Never log connection errors verbatim: Redis URLs can contain credentials.
    this.client.on('error', () => this.logger.error('Redis connection failed'));
  }

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    try {
      if (!this.client.isReady) {
        this.connection ??= this.client.connect().finally(() => {
          this.connection = undefined;
        });
        await this.connection;
      }
      return await operation();
    } catch {
      this.logger.error('Redis operation failed');
      throw new ServiceUnavailableException(
        'Authentication temporarily unavailable',
      );
    }
  }

  setSession(key: string, value: string, ttl: number): Promise<string | null> {
    return this.execute(() => this.client.set(key, value, { EX: ttl }));
  }

  getSession(key: string): Promise<string | null> {
    return this.execute(() => this.client.get(key));
  }

  deleteSession(key: string): Promise<number> {
    return this.execute(() => this.client.del(key));
  }

  async recordAttempt(key: string): Promise<number> {
    // Atomic expiry prevents permanent lockouts if a request is interrupted.
    const attempts = await this.execute(() =>
      this.client.eval(
        "local count = redis.call('INCR', KEYS[1]); if count == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end; return count",
        { keys: [key], arguments: [String(LOGIN_WINDOW_SECONDS)] },
      ),
    );
    if (typeof attempts !== 'number') {
      this.logger.error('Invalid Redis rate-limit response');
      throw new ServiceUnavailableException(
        'Authentication temporarily unavailable',
      );
    }
    return attempts;
  }

  onModuleDestroy(): void {
    if (this.client.isOpen) this.client.destroy();
  }
}
