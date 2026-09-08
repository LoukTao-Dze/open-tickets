import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppService } from './app.service';

interface UploadedImage {
  buffer: Buffer;
  originalname: string;
}

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

  @Post('upload-image/:id')
  @UseInterceptors(FileInterceptor('imageBuffer'))
  uploadImageToDiscord(
    @Param('id') id: string,
    @UploadedFile() image: UploadedImage | undefined,
  ) {
    if (!image) {
      throw new BadRequestException('An image file is required.');
    }
    return this.appService.uploadImageToDiscord(
      image.buffer,
      image.originalname,
      id,
    );
  }
}
