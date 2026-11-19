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
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  BYPASS_COMMAND,
  BYPASS_SECRET_MIN_BYTES,
  JWT_AUDIENCE,
  JWT_ISSUER,
  LOGIN_ATTEMPT_LIMIT,
  SECONDS_PER_DAY,
  SESSION_ID_PATTERN,
  SESSION_MAX_SECONDS,
  SESSION_PREFIX,
} from './auth.constants';
import {
  AuthSession,
  BypassLifetime,
  EnumAuthProvider,
  EnumUserRole,
  LoginClaims,
} from './auth.dto';
import { SessionStore } from './session-store';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly secret: string;
  private readonly bypassSecret: string | undefined;

  constructor(
    private readonly jwt: JwtService,
    private readonly sessions: SessionStore,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('JWT_SECRET');
    if (Buffer.byteLength(this.secret) < 32) {
      throw new Error('JWT_SECRET must contain at least 32 bytes');
    }
    this.bypassSecret = config.get<string>('OPEN_TICKET_BYPASS_SECRET');
    if (
      this.bypassSecret !== undefined &&
      (Buffer.byteLength(this.bypassSecret) < BYPASS_SECRET_MIN_BYTES ||
        /\s/.test(this.bypassSecret))
    ) {
      throw new Error(
        'OPEN_TICKET_BYPASS_SECRET must contain at least 32 bytes without whitespace',
      );
    }
  }

  async checkRateLimit(address: string): Promise<void> {
    const addressHash = createHash('sha256').update(address).digest('hex');
    const attempts = await this.sessions.recordAttempt(
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

  private parseBypassCommand(token: string): LoginClaims {
    const [, role, third, fourth, ...extra] = token.trim().split(/\s+/);
    const hasDays = third !== undefined && /^\d+$/.test(third);
    const lifetime = plainToInstance(BypassLifetime, {
      days: hasDays ? Number(third) : 1,
    });
    const suppliedSecret = hasDays ? fourth : third;
    const claims = plainToInstance(LoginClaims, {
      sub: `bypass-${role}`,
      username: `bypass-${role}`,
      auth_provider: EnumAuthProvider.BYPASS,
      role,
      exp: Math.floor(Date.now() / 1000) + lifetime.days * SECONDS_PER_DAY,
    });
    if (
      extra.length ||
      (!hasDays && fourth !== undefined) ||
      validateSync(lifetime).length ||
      validateSync(claims).length
    ) {
      this.logger.warn('Bypass login rejected: invalid command');
      throw new UnauthorizedException('Invalid or expired access token');
    }
    // Only guest access is public; every other role requires a server-held secret.
    const publicRole: string = EnumUserRole.GUEST;
    if (role !== publicRole || suppliedSecret !== undefined) {
      this.verifyBypassSecret(suppliedSecret);
    }
    return claims;
  }

  private verifyBypassSecret(suppliedSecret?: string): void {
    // Compare fixed-length hashes to avoid exposing secret contents or timing.
    if (
      !this.bypassSecret ||
      !suppliedSecret ||
      !timingSafeEqual(
        createHash('sha256').update(this.bypassSecret).digest(),
        createHash('sha256').update(suppliedSecret).digest(),
      )
    ) {
      this.logger.warn('Bypass login rejected: invalid credentials');
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }

  async login(
    token: string,
  ): Promise<{ sessionId: string; session: AuthSession; ttl: number }> {
    const isBypassCommand = token.trim().split(/\s+/, 1)[0] === BYPASS_COMMAND;
    const claims = isBypassCommand
      ? this.parseBypassCommand(token)
      : await this.verifyToken(token);
    if (claims.auth_provider !== EnumAuthProvider.BYPASS) {
      throw new UnauthorizedException('Login Failed');
    }
    const ttl = Math.min(
      Math.floor((claims.exp * 1000 - Date.now()) / 1000),
      isBypassCommand ? Infinity : SESSION_MAX_SECONDS,
    );
    if (ttl <= 0)
      throw new UnauthorizedException('Invalid or expired access token');
    return this.createSession(claims, ttl);
  }

  private async createSession(
    claims: LoginClaims,
    ttl: number,
  ): Promise<{ sessionId: string; session: AuthSession; ttl: number }> {
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
    await this.sessions.setSession(
      this.sessionKey(sessionId),
      JSON.stringify(session),
      ttl,
      {
        authProvider: claims.auth_provider,
        expiresAt: session.expires_at,
      },
    );
    return { sessionId, session, ttl };
  }

  async getSession(sessionId?: string): Promise<AuthSession> {
    if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
      throw new UnauthorizedException('Session expired or missing');
    }
    const stored = await this.sessions.getSession(this.sessionKey(sessionId));
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
    await this.sessions.deleteSession(this.sessionKey(sessionId));
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
      this.logger.error('Invalid session record');
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
