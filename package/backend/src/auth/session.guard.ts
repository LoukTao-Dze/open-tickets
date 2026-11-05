import {
  CanActivate,
  ExecutionContext,
  Injectable,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthSession } from './auth.dto';
import { AuthService } from './auth.service';
import { extractSessionId } from './session-cookie';

type SessionRequest = Request & { authSession?: AuthSession };

// Rejects requests without a valid server-side session (401) and exposes it to handlers.
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SessionRequest>();
    request.authSession = await this.auth.getSession(extractSessionId(request));
    return true;
  }
}

export const CurrentSession = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthSession =>
    context.switchToHttp().getRequest<SessionRequest>()
      .authSession as AuthSession,
);
