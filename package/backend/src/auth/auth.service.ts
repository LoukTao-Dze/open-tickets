import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtVerifyOptions } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  JWT_AUDIENCE,
  JWT_ISSUER,
  LOGIN_ATTEMPT_LIMIT,
  SESSION_ID_PATTERN,
  SESSION_MAX_SECONDS,
  SESSION_PREFIX,
} from './auth.constants';
import {
  AuthSession,
  EnumAuthProvider,
  EnumUserRole,
  LoginClaims,
} from './auth.dto';
import { RedisService } from './redis.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly secret: string;

  constructor(
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('JWT_SECRET');
    if (Buffer.byteLength(this.secret) < 32) {
      throw new Error('JWT_SECRET must contain at least 32 bytes');
    }
  }

  async checkRateLimit(address: string): Promise<void> {
    const addressHash = createHash('sha256').update(address).digest('hex');
    const attempts = await this.redis.recordAttempt(
      `auth:attempts:${addressHash}`,
    );
    if (attempts > LOGIN_ATTEMPT_LIMIT) {
      throw new HttpException(
        'Too many authentication attempts',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async verifyToken(token: string): Promise<LoginClaims> {
    try {
      const options: JwtVerifyOptions = {
        secret: this.secret,
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      };
      const payload = await this.jwt.verifyAsync<Record<string, unknown>>(
        token,
        options,
      );
      const claims = plainToInstance(LoginClaims, payload);
      if (
        validateSync(claims).length ||
        claims.exp <= Math.floor(Date.now() / 1000)
      ) {
        throw new UnauthorizedException();
      }
      return claims;
    } catch {
      this.logger.warn('Token login rejected');
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  async login(
    token: string,
  ): Promise<{ sessionId: string; session: AuthSession; ttl: number }> {
    const claims = await this.verifyToken(token);
    const ttl = Math.min(
      Math.floor((claims.exp * 1000 - Date.now()) / 1000),
      SESSION_MAX_SECONDS,
    );
    if (ttl <= 0)
      throw new UnauthorizedException('Invalid or expired access token');
    const sessionId = randomBytes(32).toString('hex');
    const session: AuthSession = {
      user: {
        user_id: claims.sub,
        username: claims.username,
        auth_provider: claims.auth_provider,
        role: claims.role,
      },
      expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
    };
    await this.redis.setSession(
      this.sessionKey(sessionId),
      JSON.stringify(session),
      ttl,
    );
    return { sessionId, session, ttl };
  }

  async getSession(sessionId?: string): Promise<AuthSession> {
    if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
      throw new UnauthorizedException('Session expired or missing');
    }
    const stored = await this.redis.getSession(this.sessionKey(sessionId));
    if (!stored) throw new UnauthorizedException('Session expired or missing');
    const session = this.parseSession(stored);
    if (Date.parse(session.expires_at) <= Date.now()) {
      throw new UnauthorizedException('Session expired or missing');
    }
    return session;
  }

  async logout(sessionId?: string): Promise<void> {
    if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
      throw new UnauthorizedException('Session expired or missing');
    }
    await this.redis.deleteSession(this.sessionKey(sessionId));
  }

  private parseSession(stored: string): AuthSession {
    try {
      const parsed: unknown = JSON.parse(stored);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Invalid session');
      }
      const session = plainToInstance(AuthSession, parsed);
      if (
        validateSync(session, { whitelist: true, forbidNonWhitelisted: true })
          .length
      ) {
        throw new Error('Invalid session');
      }
      return session;
    } catch {
      this.logger.error('Invalid session record in Redis');
      throw new ServiceUnavailableException(
        'Authentication temporarily unavailable',
      );
    }
  }

  private sessionKey(sessionId: string): string {
    return (
      SESSION_PREFIX + createHash('sha256').update(sessionId).digest('hex')
    );
  }
}
