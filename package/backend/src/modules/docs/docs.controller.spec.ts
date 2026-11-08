import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import { AuthService } from '../../auth/auth.service';
import { AdminGuard } from '../../auth/admin.guard';
import {
  AuthSession,
  EnumAuthProvider,
  EnumUserRole,
} from '../../auth/auth.dto';
import { SessionGuard } from '../../auth/session.guard';
import { SESSION_COOKIE } from '../../auth/auth.constants';
import { DocsController } from './docs.controller';
import { DocsService } from './docs.service';
import { MAX_DOCS_LENGTH } from './update-docs.dto';
import { configureDocsBodyParser } from './docs-request.config';

describe('DocsController authorization and validation', () => {
  let app: INestApplication<Server>;
  let server: Server;
  const docs = { getGuide: jest.fn(), updateGuide: jest.fn() };
  const guide = {
    content: '# Guide',
    updatedAt: '2026-11-08T08:00:00.123456+00:00',
  };
  const auth = {
    getSession: jest.fn(
      (sessionId: string | undefined): Promise<AuthSession> => {
        if (!sessionId) return Promise.reject(new UnauthorizedException());
        return Promise.resolve({
          user: {
            user_id: 'test-user',
            username: 'test-user',
            auth_provider: EnumAuthProvider.TOKEN,
            role: sessionId,
          },
          expires_at: '2099-01-01T00:00:00Z',
        });
      },
    ),
  };
  const cookie = (role: string) => `${SESSION_COOKIE}=${role}`;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [DocsController],
      providers: [
        AdminGuard,
        SessionGuard,
        { provide: AuthService, useValue: auth },
        { provide: DocsService, useValue: docs },
      ],
    }).compile();
    app = module.createNestApplication<INestApplication<Server>>();
    app.setGlobalPrefix('api');
    configureDocsBodyParser(app);
    await app.init();
    server = app.getHttpServer();
  });

  beforeEach(() => {
    docs.getGuide.mockResolvedValue({ data: guide });
    docs.updateGuide.mockResolvedValue({ data: guide });
  });

  afterEach(() => jest.clearAllMocks());
  afterAll(async () => app.close());

  it.each([
    EnumUserRole.ADMIN,
    EnumUserRole.USER,
    EnumUserRole.GUEST,
    'custom-editor',
  ])('allows authenticated %s to read', async (role) => {
    await request(server)
      .get('/api/docs')
      .set('Cookie', cookie(role))
      .expect(200)
      .expect('Cache-Control', 'no-store')
      .expect({ data: guide });
  });

  it.each(['get', 'put'] as const)(
    'rejects unauthenticated %s',
    async (method) => {
      await request(server)[method]('/api/docs').send(guide).expect(401);
      expect(docs.getGuide).not.toHaveBeenCalled();
      expect(docs.updateGuide).not.toHaveBeenCalled();
    },
  );

  it.each([EnumUserRole.USER, EnumUserRole.GUEST, 'custom-editor'])(
    'rejects edits by %s even when it claims admin in the body',
    async (role) => {
      await request(server)
        .put('/api/docs')
        .set('Cookie', cookie(role))
        .send({ ...guide, role: EnumUserRole.ADMIN, canEdit: true })
        .expect(403);
      expect(docs.updateGuide).not.toHaveBeenCalled();
    },
  );

  it('allows admin to publish valid Markdown', async () => {
    await request(server)
      .put('/api/docs')
      .set('Cookie', cookie(EnumUserRole.ADMIN))
      .send(guide)
      .expect(200)
      .expect({ data: guide });
    expect(docs.updateGuide).toHaveBeenCalledWith(guide);
  });

  it('rejects cross-origin writes even for an admin session', async () => {
    await request(server)
      .put('/api/docs')
      .set('Cookie', cookie(EnumUserRole.ADMIN))
      .set('Origin', 'https://untrusted.invalid')
      .send(guide)
      .expect(403);
    expect(docs.updateGuide).not.toHaveBeenCalled();
  });

  it.each([
    { ...guide, content: '' },
    { ...guide, content: ' \n\t ' },
    { ...guide, content: null },
    { ...guide, content: 123 },
    { ...guide, content: 'x'.repeat(MAX_DOCS_LENGTH + 1) },
    { ...guide, updatedAt: 'not-a-date' },
    { content: guide.content },
    { ...guide, unexpected: true },
  ])('rejects invalid payload %#', async (body) => {
    await request(server)
      .put('/api/docs')
      .set('Cookie', cookie(EnumUserRole.ADMIN))
      .send(body)
      .expect(400);
    expect(docs.updateGuide).not.toHaveBeenCalled();
  });

  it.each(['x', 'ก'])(
    'accepts exactly the content length limit for %s',
    async (character) => {
      await request(server)
        .put('/api/docs')
        .set('Cookie', cookie(EnumUserRole.ADMIN))
        .send({ ...guide, content: character.repeat(MAX_DOCS_LENGTH) })
        .expect(200);
    },
  );

  it('rejects requests exceeding the bounded JSON body size', async () => {
    await request(server)
      .put('/api/docs')
      .set('Cookie', cookie(EnumUserRole.ADMIN))
      .send({ ...guide, content: 'x'.repeat(1_048_576) })
      .expect(413);
    expect(docs.updateGuide).not.toHaveBeenCalled();
  });
});
