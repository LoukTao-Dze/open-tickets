import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('projects')
  getAllProjects() {
    return this.appService.getAllProjects();
  }

  @Post('upload-image')
  uploadImageToDiscord(
    @Body('imageBuffer') imageBuffer: Buffer,
    @Body('filename') filename: string,
  ) {
    return this.appService.uploadImageToDiscord(imageBuffer, filename);
  }
}
