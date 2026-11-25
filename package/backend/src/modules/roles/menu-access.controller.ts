import { Controller, Get, Header, Req } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../../auth/auth.service';
import { extractSessionId } from '../../auth/session-cookie';
import { RolesService } from './roles.service';

@Controller('roles')
export class MenuAccessController {
  constructor(
    private readonly rolesService: RolesService,
    private readonly auth: AuthService,
  ) {}

  @Get('my-menu')
  @Header('Cache-Control', 'no-store')
  async getMenuAccess(@Req() request: Request) {
    // The session, not a client-provided role, determines the permissions returned.
    const session = await this.auth.getSession(extractSessionId(request));
    return this.rolesService.getMenuAccess(session.user.role);
  }
}
