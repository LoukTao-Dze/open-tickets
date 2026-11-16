import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
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
import { TestSuiteDto } from './dto/test-suite.dto';
import { ScenesService } from './scenes.service';

@Controller('projects/:projectId/test-suites')
@UseGuards(SessionGuard)
export class TestSuitesController {
  constructor(
    private readonly scenes: ScenesService,
    private readonly access: ProjectAccessService,
  ) {}

  @Post()
  async create(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() suite: TestSuiteDto,
    @CurrentSession() session: AuthSession,
    @Req() request: Request,
  ) {
    // Origin and project edit access are checked for every suite mutation.
    validateRequestOrigin(request);
    await this.access.assertProjectAccess(session.user.role, projectId, 'edit');
    return { data: await this.scenes.createSuite(projectId, suite) };
  }

  @Put(':suiteId')
  async update(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('suiteId', ParseUUIDPipe) suiteId: string,
    @Body() suite: TestSuiteDto,
    @CurrentSession() session: AuthSession,
    @Req() request: Request,
  ) {
    validateRequestOrigin(request);
    await this.access.assertProjectAccess(session.user.role, projectId, 'edit');
    if (suite.projectId && suite.projectId !== projectId) {
      await this.access.assertProjectAccess(
        session.user.role,
        suite.projectId,
        'edit',
      );
    }
    return { data: await this.scenes.updateSuite(projectId, suiteId, suite) };
  }

  @Delete(':suiteId')
  async delete(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('suiteId', ParseUUIDPipe) suiteId: string,
    @CurrentSession() session: AuthSession,
    @Req() request: Request,
  ) {
    validateRequestOrigin(request);
    await this.access.assertProjectAccess(session.user.role, projectId, 'edit');
    return { data: await this.scenes.deleteSuite(projectId, suiteId) };
  }
}
