import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { CurrentSession, SessionGuard } from '../../auth/session.guard';
import type { AuthSession } from '../../auth/auth.dto';
import { ProjectAccessService } from '../roles/project-access.service';
import { CanvasService } from './canvas.service';

@Controller('canvas')
export class CanvasController {
  constructor(
    private readonly canvasService: CanvasService,
    private readonly projectAccess: ProjectAccessService,
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
}
