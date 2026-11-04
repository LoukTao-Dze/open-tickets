import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Request, Response } from 'express';
import { getCorsOrigins } from '../cors-origins';
import { SESSION_COOKIE } from './auth.constants';
import { TokenLoginDto } from './auth.dto';
import { AuthService } from './auth.service';

@Controller('auth')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login/token')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async login(
    @Body() body: TokenLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    // Reject cross-origin login CSRF even when browsers can send cross-site cookies.
    this.validateOrigin(request);
    await this.auth.checkRateLimit(request.ip ?? 'unknown');
    const { sessionId, session, ttl } = await this.auth.login(body.token);
    response.cookie(SESSION_COOKIE, sessionId, this.cookieOptions(ttl));
    return session;
  }

  @Get('session')
  @Header('Cache-Control', 'no-store')
  async session(@Req() request: Request) {
    return this.auth.getSession(this.sessionId(request));
  }

  @Post('logout')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    // Prevent cross-site logout; clear the cookie only after Redis confirms deletion.
    this.validateOrigin(request);
    await this.auth.logout(this.sessionId(request));
    response.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  private validateOrigin(request: Request): void {
    const origin = request.get('origin');
    if (origin && !getCorsOrigins().includes(origin)) {
      throw new ForbiddenException();
    }
  }

  private sessionId(request: Request): string | undefined {
    const cookie = request.headers.cookie
      ?.split(';')
      .map((part: string) => part.trim())
      .find((part: string) => part.startsWith(`${SESSION_COOKIE}=`));
    return cookie?.slice(SESSION_COOKIE.length + 1);
  }

  private cookieOptions(ttl?: number): CookieOptions {
    const secure = this.config.get<string>('AUTH_COOKIE_SECURE') !== 'false';
    const sameSite =
      this.config.get<string>('AUTH_COOKIE_SAME_SITE') === 'none'
        ? 'none'
        : 'lax';
    if (sameSite === 'none' && !secure) {
      throw new Error('SameSite=None requires secure cookies');
    }
    return {
      httpOnly: true,
      secure,
      sameSite,
      path: '/api',
      ...(ttl === undefined ? {} : { maxAge: ttl * 1000 }),
    };
  }
}
