import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AppService } from './app.service';
import type { CanvasItemPayload } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  @Post('save-canvas-item')
  saveCanvasItem(@Body() body: CanvasItemPayload) {
    return this.appService.saveCanvasItem(body);
  }

  @Get('projects')
  getAllProjects() {
    return this.appService.getAllProjects();
  }

  @Get('get-canvas-item')
  getCanvasItem(@Query('projectId') projectId?: string) {
    return this.appService.getCanvasItem(projectId);
  }

  @Post('delete-canvas-item')
  deleteCanvasItem(@Body() body: { id: string; type: string }) {
    return this.appService.deleteCanvasItem(body.id, body.type);
  }
}
