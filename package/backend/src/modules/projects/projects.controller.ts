import {
  Controller,
  Post,
  Body,
  Param,
  Delete,
  Put,
  ParseUUIDPipe,
  Get,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get('get-projects')
  getProjects() {
    return this.projectsService.getProjects();
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
