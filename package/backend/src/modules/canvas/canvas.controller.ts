import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { CanvasService } from './canvas.service';

@Controller('canvas')
export class CanvasController {
  constructor(private readonly canvasService: CanvasService) {}

  @Post('save-canvas-item')
  saveCanvasItem(@Body() body: any) {
    return this.canvasService.saveCanvasItem(body);
  }

  @Get('get-canvas-item')
  getCanvasItem(@Query('projectId') projectId?: string) {
    return this.canvasService.getCanvasItem(projectId);
  }

  @Post('delete-canvas-item')
  deleteCanvasItem(@Body() body: { id: string; type: string }) {
    return this.canvasService.deleteCanvasItem(body);
  }
}
