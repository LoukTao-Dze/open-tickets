import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { ADMIN_ROLE } from './auth.constants';
import { AuthService } from './auth.service';
import { extractSessionId } from './session-cookie';

// Authorization is checked against the server-side session, never client input.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const session = await this.auth.getSession(extractSessionId(request));
    if (session.user.role !== ADMIN_ROLE) {
      throw new ForbiddenException();
    }
    return true;
  }
}
