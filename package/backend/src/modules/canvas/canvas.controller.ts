import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request } from 'express';
import { validateRequestOrigin } from '../../auth/request-origin';
import { SessionStore } from '../../auth/session-store';
import { CurrentSession, SessionGuard } from '../../auth/session.guard';
import type { AuthSession } from '../../auth/auth.dto';
import { ProjectAccessService } from '../roles/project-access.service';
import { CanvasService } from './canvas.service';
import {
  CanvasSelectionDto,
  CanvasGroupDto,
  CreateCanvasGroupDto,
  MoveCanvasGroupDto,
  UpdateCanvasGroupDto,
} from './dto/canvas-selection.dto';
import {
  CanvasConnectionDto,
  CanvasConnectionIdDto,
  UpdateCanvasConnectionDto,
} from './dto/canvas-connection.dto';

const CANVAS_MUTATION_LIMIT = 120;

@Controller('canvas')
export class CanvasController {
  constructor(
    private readonly canvasService: CanvasService,
    private readonly projectAccess: ProjectAccessService,
    private readonly sessions: SessionStore,
  ) {}

  @Post('save-canvas-item')
  saveCanvasItem(@Body() body: any) {
    return this.canvasService.saveCanvasItem(body);
  }

  @Get('get-canvas-item')
  @UseGuards(SessionGuard)
  async getCanvasItem(
    @CurrentSession() session: AuthSession,
    @Query('projectId') projectId?: string,
  ) {
    const { data } = await this.canvasService.getCanvasItem(projectId);
    return {
      data: await this.projectAccess.filterByProject(
        session.user.role,
        data,
        (item) => (item as { projectId?: string }).projectId,
      ),
    };
  }

  @Post('delete-canvas-item')
  deleteCanvasItem(@Body() body: { id: string; type: string }) {
    return this.canvasService.deleteCanvasItem(body);
  }

  @Get('groups')
  @UseGuards(SessionGuard)
  async getGroups(
    @CurrentSession() session: AuthSession,
    @Query('projectId') projectId: string,
  ) {
    const access = await this.projectAccess.assertProjectAccess(
      session.user.role,
      projectId,
      'view',
    );
    return {
      ...(await this.canvasService.getGroups(projectId)),
      canEdit: access === 'edit',
    };
  }

  @Get('connections')
  @UseGuards(SessionGuard)
  async getConnections(
    @CurrentSession() session: AuthSession,
    @Query('projectId') projectId: string,
  ) {
    await this.projectAccess.assertProjectAccess(
      session.user.role,
      projectId,
      'view',
    );
    return this.canvasService.getConnections(projectId);
  }

  @Post('connections')
  @UseGuards(SessionGuard)
  async createConnection(
    @Body() body: CanvasConnectionDto,
    @CurrentSession() session: AuthSession,
    @Req() request: Request,
  ) {
    await this.authorizeMutation(body.projectId, session, request);
    return this.canvasService.createConnection(body);
  }

  @Post('connections/update')
  @UseGuards(SessionGuard)
  async updateConnectionStyle(
    @Body() body: UpdateCanvasConnectionDto,
    @CurrentSession() session: AuthSession,
    @Req() request: Request,
  ) {
    await this.authorizeMutation(body.projectId, session, request);
    return this.canvasService.updateConnectionStyle(body);
  }

  @Post('connections/delete')
  @UseGuards(SessionGuard)
  async deleteConnection(
    @Body() body: CanvasConnectionIdDto,
    @CurrentSession() session: AuthSession,
    @Req() request: Request,
  ) {
    await this.authorizeMutation(body.projectId, session, request);
    return this.canvasService.deleteConnection(body);
  }

  @Post('groups')
  @UseGuards(SessionGuard)
  async createGroup(
    @Body() body: CreateCanvasGroupDto,
    @CurrentSession() session: AuthSession,
    @Req() request: Request,
  ) {
    await this.authorizeMutation(body.projectId, session, request);
    return this.canvasService.createGroup(body);
  }

  @Post('groups/move')
  @UseGuards(SessionGuard)
  async moveGroup(
    @Body() body: MoveCanvasGroupDto,
    @CurrentSession() session: AuthSession,
    @Req() request: Request,
  ) {
    await this.authorizeMutation(body.projectId, session, request);
    return this.canvasService.moveGroup(body);
  }

  @Post('groups/update')
  @UseGuards(SessionGuard)
  async updateGroup(
    @Body() body: UpdateCanvasGroupDto,
    @CurrentSession() session: AuthSession,
    @Req() request: Request,
  ) {
    await this.authorizeMutation(body.projectId, session, request);
    return this.canvasService.updateGroup(body);
  }

  @Post('groups/ungroup')
  @UseGuards(SessionGuard)
  async ungroup(
    @Body() body: CanvasGroupDto,
    @CurrentSession() session: AuthSession,
    @Req() request: Request,
  ) {
    await this.authorizeMutation(body.projectId, session, request);
    return this.canvasService.ungroup(body);
  }

  @Post('delete-canvas-items')
  @UseGuards(SessionGuard)
  async deleteCanvasItems(
    @Body() body: CanvasSelectionDto,
    @CurrentSession() session: AuthSession,
    @Req() request: Request,
  ) {
    await this.authorizeMutation(body.projectId, session, request);
    return this.canvasService.deleteCanvasItems(body);
  }

  private async authorizeMutation(
    projectId: string,
    session: AuthSession,
    request: Request,
  ) {
    // Authorize every project and rate-limit costly selection transactions per user.
    validateRequestOrigin(request);
    await this.projectAccess.assertProjectAccess(
      session.user.role,
      projectId,
      'edit',
    );
    const userHash = createHash('sha256')
      .update(session.user.user_id)
      .digest('hex');
    const attempts = await this.sessions.recordAttempt(
      `canvas:mutations:${userHash}`,
    );
    if (attempts > CANVAS_MUTATION_LIMIT) {
      throw new HttpException(
        'Too many canvas changes. Try again shortly.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
