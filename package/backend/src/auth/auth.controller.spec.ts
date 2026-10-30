import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import { AuthModule } from './auth.module';
import { RedisService } from './redis.service';
import {
  JWT_AUDIENCE,
  JWT_ISSUER,
  LOGIN_ATTEMPT_LIMIT,
  SESSION_COOKIE,
  SESSION_PREFIX,
} from './auth.constants';

describe('Token login HTTP flow', () => {
  const secret = 'test-only-signing-secret-with-at-least-32-bytes';
  const records = new Map<string, string>();
  const redis = {
    setSession: jest
      .fn<Promise<string>, [key: string, value: string, ttl: number]>()
      .mockImplementation((key: string, value: string) => {
        records.set(key, value);
        return Promise.resolve('OK');
      }),
    getSession: jest.fn((key: string) =>
      Promise.resolve(records.get(key) ?? null),
    ),
    deleteSession: jest.fn((key: string) =>
      Promise.resolve(records.delete(key) ? 1 : 0),
    ),
    recordAttempt: jest
      .fn<Promise<number>, [key: string]>()
      .mockResolvedValue(1),
  };
  let app: INestApplication<Server>;
  let jwt: JwtService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        AuthModule,
      ],
    })
      .overrideProvider(ConfigService)
      .useValue(new ConfigService({ JWT_SECRET: secret }))
      .overrideProvider(RedisService)
      .useValue(redis)
      .compile();
    // ConfigService is normally global through AppModule.
    jwt = module.get<JwtService>(JwtService);
    app = module.createNestApplication<INestApplication<Server>>();
    app.setGlobalPrefix('api');
    await app.init();
  });

  beforeEach(() => {
    records.clear();
  });

  afterEach(() => jest.clearAllMocks());
  afterAll(async () => app?.close());

  function signToken(payload: Record<string, unknown> = {}) {
    return jwt.sign(
      { sub: 'mock-user', username: 'mock-user', ...payload },
      {
        secret,
        algorithm: 'HS256',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        expiresIn: '1h',
      },
    );
  }

  it('verifies JWT, persists profile with bounded TTL, sets HttpOnly cookie and reads session', async () => {
    const token = signToken();
    const response = await request(app.getHttpServer())
      .post('/api/auth/login/token')
      .send({ token })
      .expect(200);
    expect(response.body.user).toEqual({
      user_id: 'mock-user',
      username: 'mock-user',
      auth_provider: 'token',
      role: 'guest',
    });
    expect(redis.setSession).toHaveBeenCalledWith(
      expect.stringMatching(/^auth:session:[a-f0-9]{64}$/),
      expect.not.stringContaining(token),
      expect.any(Number),
    );
    expect(redis.setSession.mock.calls[0][2]).toBeGreaterThan(3590);
    expect(redis.setSession.mock.calls[0][2]).toBeLessThanOrEqual(3600);
    expect(Date.parse(response.body.expires_at as string)).toBeLessThanOrEqual(
      jwt.decode<{ exp: number }>(token).exp * 1000,
    );
    const cookie = response.headers['set-cookie'][0];
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api');
    expect(response.headers['cache-control']).toBe('no-store');
    const session = await request(app.getHttpServer())
      .get('/api/auth/session')
      .set('Cookie', cookie.split(';')[0])
      .expect(200);
    expect(session.body).toEqual(response.body);
  });

  it('rotates session IDs and caps long-lived JWT sessions at one day', async () => {
    const token = jwt.sign(
      { sub: 'mock-user', username: 'mock-user' },
      {
        secret,
        algorithm: 'HS256',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        expiresIn: '7d',
      },
    );
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await request(app.getHttpServer())
        .post('/api/auth/login/token')
        .send({ token })
        .expect(200);
    }
    expect(records.size).toBe(2);
    expect(redis.setSession.mock.calls[0][2]).toBe(86400);
  });

  it.each([
    null,
    {},
    { token: '' },
    { token: 123 },
    { token: 'x'.repeat(8193) },
    { token: 'x', role: 'admin' },
  ])('rejects invalid request body %j', async (body) => {
    await request(app.getHttpServer())
      .post('/api/auth/login/token')
      .send(body ?? {})
      .expect(400);
    expect(redis.setSession).not.toHaveBeenCalled();
  });

  it.each([
    'byPass',
    `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from('{"sub":"mock"}').toString('base64url')}.`,
  ])('rejects unverified token %s', async (token) => {
    await request(app.getHttpServer())
      .post('/api/auth/login/token')
      .send({ token })
      .expect(401);
    expect(redis.setSession).not.toHaveBeenCalled();
  });

  it.each([
    { secret: 'a-different-secret', algorithm: 'HS256' as const },
    { secret, algorithm: 'HS384' as const },
    { secret, issuer: 'other-app' },
    { secret, audience: 'other-app' },
    { secret, expiresIn: -1 },
  ])('rejects invalid JWT verification options %j', async (options) => {
    const token = jwt.sign(
      { sub: 'mock-user', username: 'mock-user' },
      {
        secret,
        algorithm: 'HS256',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        expiresIn: 3600,
        ...options,
      },
    );
    await request(app.getHttpServer())
      .post('/api/auth/login/token')
      .send({ token })
      .expect(401);
  });

  it.each([{ sub: '' }, { username: null }])(
    'rejects missing profile claims %j',
    async (claims) => {
      await request(app.getHttpServer())
        .post('/api/auth/login/token')
        .send({ token: signToken(claims) })
        .expect(401);
    },
  );

  it('requires an expiry claim', async () => {
    const token = jwt.sign(
      { sub: 'mock', username: 'mock' },
      {
        secret,
        algorithm: 'HS256',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      },
    );
    await request(app.getHttpServer())
      .post('/api/auth/login/token')
      .send({ token })
      .expect(401);
  });

  it.each([
    '',
    `${SESSION_COOKIE}=byPass`,
    `${SESSION_COOKIE}=${'a'.repeat(64)}`,
  ])('rejects missing, forged or expired sessions', async (cookie) => {
    await request(app.getHttpServer())
      .get('/api/auth/session')
      .set('Cookie', cookie)
      .expect(401);
  });

  it('denies access to corrupted Redis records', async () => {
    const sessionId = 'a'.repeat(64);
    const key =
      SESSION_PREFIX + createHash('sha256').update(sessionId).digest('hex');
    records.set(key, '{"user":null}');
    await request(app.getHttpServer())
      .get('/api/auth/session')
      .set('Cookie', `${SESSION_COOKIE}=${sessionId}`)
      .expect(503);
  });

  it('returns 429 at the login rate limit without verifying or storing a session', async () => {
    redis.recordAttempt.mockResolvedValueOnce(LOGIN_ATTEMPT_LIMIT + 1);
    await request(app.getHttpServer())
      .post('/api/auth/login/token')
      .send({ token: signToken() })
      .expect(429);
    expect(redis.setSession).not.toHaveBeenCalled();
  });

  it('denies cross-origin login requests', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login/token')
      .set('Origin', 'https://untrusted.invalid')
      .send({ token: signToken() })
      .expect(403);
    expect(redis.setSession).not.toHaveBeenCalled();
  });

  it('does not set cookies when Redis persistence fails', async () => {
    redis.setSession.mockRejectedValueOnce(new ServiceUnavailableException());
    const response = await request(app.getHttpServer())
      .post('/api/auth/login/token')
      .send({ token: signToken() })
      .expect(503);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  describe('POST /api/auth/logout', () => {
    const sessionId = 'a'.repeat(64);
    const cookie = `${SESSION_COOKIE}=${sessionId}`;
    const key =
      SESSION_PREFIX + createHash('sha256').update(sessionId).digest('hex');

    it('deletes the current session, preserves other keys and expires the cookie', async () => {
      records.set(key, '{"user":null}');
      records.set('unrelated-key', 'keep');
      const response = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', `other=value; ${cookie}`)
        .expect(204);
      expect(redis.deleteSession).toHaveBeenCalledWith(key);
      expect(records.has(key)).toBe(false);
      expect(records.get('unrelated-key')).toBe('keep');
      expect(response.text).toBe('');
      expect(response.headers['cache-control']).toBe('no-store');
      const clearedCookie = response.headers['set-cookie'][0];
      expect(clearedCookie).toContain(`${SESSION_COOKIE}=;`);
      expect(clearedCookie).toContain('Expires=Thu, 01 Jan 1970');
      expect(clearedCookie).toContain('Path=/api');
      expect(clearedCookie).toContain('HttpOnly');
      expect(clearedCookie).toContain('Secure');
      expect(clearedCookie).toContain('SameSite=Lax');
      await request(app.getHttpServer())
        .get('/api/auth/session')
        .set('Cookie', cookie)
        .expect(401);
    });

    it('allows repeated logout for an already removed session', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .expect(204);
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .expect(204);
    });

    it.each(['', `${SESSION_COOKIE}=`, `${SESSION_COOKIE}=invalid`])(
      'rejects missing or malformed cookie %j without deleting anything',
      async (invalidCookie) => {
        const response = await request(app.getHttpServer())
          .post('/api/auth/logout')
          .set('Cookie', invalidCookie)
          .expect(401);
        expect(redis.deleteSession).not.toHaveBeenCalled();
        expect(response.headers['set-cookie']).toBeUndefined();
      },
    );

    it('rejects cross-origin logout', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Origin', 'https://untrusted.invalid')
        .set('Cookie', cookie)
        .expect(403);
      expect(redis.deleteSession).not.toHaveBeenCalled();
    });

    it('does not clear the cookie or report success when Redis deletion fails', async () => {
      redis.deleteSession.mockRejectedValueOnce(
        new ServiceUnavailableException(),
      );
      const response = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', cookie)
        .expect(503);
      expect(response.headers['set-cookie']).toBeUndefined();
    });
  });
});
