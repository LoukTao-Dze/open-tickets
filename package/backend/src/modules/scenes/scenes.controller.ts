import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthSession } from '../../auth/auth.dto';
import { validateRequestOrigin } from '../../auth/request-origin';
import { CurrentSession, SessionGuard } from '../../auth/session.guard';
import { ProjectAccessService } from '../roles/project-access.service';
import { SceneDto, SceneStatusDto } from './dto/scene.dto';
import { ScenesService } from './scenes.service';

@Controller('projects/:projectId/scenes')
@UseGuards(SessionGuard)
export class ScenesController {
  constructor(
    private readonly scenes: ScenesService,
    private readonly access: ProjectAccessService,
  ) {}

  @Get()
  async list(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentSession() session: AuthSession,
  ) {
    // Project authorization is checked before reading scene data.
    const access = await this.access.assertProjectAccess(
      session.user.role,
      projectId,
      'view',
    );
    const [scenes, suites] = await Promise.all([
      this.scenes.list(projectId),
      this.scenes.listSuites(projectId),
    ]);
    return {
      data: {
        scenes,
        suites,
        canEdit: access === 'edit',
      },
    };
  }

  @Post()
  async create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() scene: SceneDto,
    @CurrentSession() session: AuthSession,
    @Req() request: Request,
  ) {
    validateRequestOrigin(request);
    await this.access.assertProjectAccess(session.user.role, projectId, 'edit');
    return { data: await this.scenes.create(projectId, scene) };
  }

  @Put(':sceneId')
  async update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('sceneId', ParseUUIDPipe) sceneId: string,
    @Body() scene: SceneDto,
    @CurrentSession() session: AuthSession,
    @Req() request: Request,
  ) {
    validateRequestOrigin(request);
    await this.access.assertProjectAccess(session.user.role, projectId, 'edit');
    return { data: await this.scenes.update(projectId, sceneId, scene) };
  }

  @Patch(':sceneId/status')
  async updateStatus(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('sceneId', ParseUUIDPipe) sceneId: string,
    @Body() body: SceneStatusDto,
    @CurrentSession() session: AuthSession,
    @Req() request: Request,
  ) {
    validateRequestOrigin(request);
    await this.access.assertProjectAccess(session.user.role, projectId, 'edit');
    return {
      data: await this.scenes.updateStatus(projectId, sceneId, body.status),
    };
  }

  @Delete(':sceneId')
  async delete(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('sceneId', ParseUUIDPipe) sceneId: string,
    @CurrentSession() session: AuthSession,
    @Req() request: Request,
  ) {
    // Prevent cross-origin or unauthorized deletion of project scenes.
    validateRequestOrigin(request);
    await this.access.assertProjectAccess(session.user.role, projectId, 'edit');
    return { data: await this.scenes.delete(projectId, sceneId) };
  }
}
