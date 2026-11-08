import {
  Body,
  Controller,
  Get,
  Header,
  Put,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AdminGuard } from '../../auth/admin.guard';
import { SessionGuard } from '../../auth/session.guard';
import { DocsService } from './docs.service';
import { UpdateDocsDto } from './update-docs.dto';
import type { Request } from 'express';
import { validateRequestOrigin } from '../../auth/request-origin';

@Controller('docs')
// Apply boundary validation on both local and serverless entry points.
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class DocsController {
  constructor(private readonly docs: DocsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @UseGuards(SessionGuard)
  getGuide() {
    return this.docs.getGuide();
  }

  // Admin authorization comes from the server session, not editable role permissions.
  @Put()
  @Header('Cache-Control', 'no-store')
  @UseGuards(AdminGuard)
  updateGuide(@Body() body: UpdateDocsDto, @Req() request: Request) {
    validateRequestOrigin(request);
    return this.docs.updateGuide(body);
  }
}
