import {
  Controller,
  Post,
  Body,
  Param,
  Delete,
  Put,
  ParseUUIDPipe,
  Get,
  UseGuards,
} from '@nestjs/common';
import { CurrentSession, SessionGuard } from '../../auth/session.guard';
import type { AuthSession } from '../../auth/auth.dto';
import { ProjectAccessService } from '../roles/project-access.service';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

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
