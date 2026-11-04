import { ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { EnumAuthProvider } from './auth.dto';
import { DatabaseSessionService } from './database-session.service';

type QueryResult = { data?: unknown; error?: unknown; count?: number };

function createQuery(result: QueryResult) {
  const query: Record<string, jest.Mock> = {};
  for (const method of ['upsert', 'select', 'delete', 'eq', 'lte']) {
    query[method] = jest.fn().mockReturnValue(query);
  }
  query.maybeSingle = jest.fn().mockResolvedValue(result);
  (query as { then?: unknown }).then = (
    resolve: (value: QueryResult) => void,
  ) => resolve(result);
  return query;
}

describe('DatabaseSessionService', () => {
  const metadata = {
    authProvider: EnumAuthProvider.BYPASS,
    expiresAt: '2030-01-01T00:00:00.000Z',
  };
  const from = jest.fn();
  const rpc = jest.fn();
  let service: DatabaseSessionService;

  beforeEach(() => {
    service = new DatabaseSessionService({
      getClient: () => ({ from, rpc }),
    } as unknown as SupabaseService);
  });

  afterEach(() => jest.resetAllMocks());

  it('upserts the session by session_id with auth_provider and expires_at', async () => {
    const query = createQuery({ error: null });
    from.mockReturnValue(query);
    await service.setSession('hash', '{"a":1}', 60, metadata);
    expect(query.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        session_id: 'hash',
        session: { a: 1 },
        ttl: 60,
        auth_provider: 'bypass',
        expires_at: metadata.expiresAt,
        update_date: expect.any(String) as string,
      }),
      { onConflict: 'session_id' },
    );
    expect(query.upsert.mock.calls[0][0]).not.toHaveProperty('create_date');
  });

  it('returns the stored session as JSON', async () => {
    from.mockReturnValue(
      createQuery({
        data: { session: { a: 1 }, expires_at: metadata.expiresAt },
      }),
    );
    expect(await service.getSession('hash')).toBe('{"a":1}');
  });

  it('treats missing and expired rows as absent', async () => {
    from.mockReturnValueOnce(createQuery({ data: null }));
    expect(await service.getSession('missing')).toBeNull();
    from.mockReturnValueOnce(
      createQuery({
        data: { session: {}, expires_at: '2000-01-01T00:00:00.000Z' },
      }),
    );
    expect(await service.getSession('expired')).toBeNull();
  });

  it('denies access when the database fails', async () => {
    from.mockReturnValue(createQuery({ error: { message: 'secret detail' } }));
    await expect(service.getSession('hash')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(
      service.setSession('hash', '{}', 60, metadata),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.deleteSession('hash')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('records login attempts through the atomic database function', async () => {
    rpc.mockResolvedValueOnce({ data: 3, error: null });
    expect(await service.recordAttempt('key')).toBe(3);
    expect(rpc).toHaveBeenCalledWith('record_login_attempt', {
      p_key: 'key',
      p_window_seconds: 60,
    });
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
    await expect(service.recordAttempt('key')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
