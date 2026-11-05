import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentSession, SessionGuard } from './auth/session.guard';
import type { AuthSession } from './auth/auth.dto';
import { ProjectAccessService } from './modules/roles/project-access.service';
import { AppService } from './app.service';

interface UploadedImage {
  buffer: Buffer;
  originalname: string;
}

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('projects')
  @UseGuards(SessionGuard)
  async getAllProjects(@CurrentSession() session: AuthSession) {
    const { data } = await this.appService.getAllProjects();
    return {
      data: await this.projectAccess.filterByProject(
        session.user.role,
        data ?? [],
        (project: { id: string }) => project.id,
      ),
    };
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
