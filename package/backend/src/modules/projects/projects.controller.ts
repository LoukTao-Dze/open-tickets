import {
  Controller,
  Post,
  Body,
  Param,
  Delete,
  Put,
  ParseUUIDPipe,
  Get,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentSession, SessionGuard } from '../../auth/session.guard';
import type { AuthSession } from '../../auth/auth.dto';
import { validateRequestOrigin } from '../../auth/request-origin';
import { ProjectAccessService } from '../roles/project-access.service';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateProgressLogDto } from './dto/create-progress-log.dto';

@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  @Get('get-projects')
  @UseGuards(SessionGuard)
  async getProjects(@CurrentSession() session: AuthSession) {
    const { data } = await this.projectsService.getProjects();
    return {
      data: await this.projectAccess.filterByProject(
        session.user.role,
        data,
        (project) => project.id,
      ),
    };
  }

  @Get(':id/progress-logs')
  @UseGuards(SessionGuard)
  async getProgressLogs(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentSession() session: AuthSession,
  ) {
    const access = await this.projectAccess.assertProjectAccess(
      session.user.role,
      id,
      'view',
    );
    const { data } = await this.projectsService.getProgressLogs(id);
    return { data: { logs: data, canEdit: access === 'edit' } };
  }

  @Post(':id/progress-logs')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(SessionGuard)
  async createProgressLog(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CreateProgressLogDto,
    @CurrentSession() session: AuthSession,
    @Req() request: Request,
  ) {
    validateRequestOrigin(request);
    await this.projectAccess.assertProjectAccess(session.user.role, id, 'edit');
    return this.projectsService.createProgressLog(
      id,
      body.date,
      body.details,
      session.user.username,
    );
  }

  @Delete(':id/progress-logs/:logId')
  @UseGuards(SessionGuard)
  async deleteProgressLog(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('logId', ParseUUIDPipe) logId: string,
    @CurrentSession() session: AuthSession,
    @Req() request: Request,
  ) {
    validateRequestOrigin(request);
    await this.projectAccess.assertProjectAccess(session.user.role, id, 'edit');
    return this.projectsService.deleteProgressLog(id, logId);
  }

  @Post('projects')
  createProject(@Body() body: CreateProjectDto) {
    return this.projectsService.createProject(body);
  }

  @Put('update/:id')
  updateProject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateProjectDto,
  ) {
    return this.projectsService.updateProject(id, body);
  }

  @Delete('delete/:id')
  deleteProject(@Param('id', ParseUUIDPipe) id: string) {
    return this.projectsService.deleteProject(id);
  }
}
