import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { KanbanService } from './kanban.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { MoveTicketDto } from './dto/move-ticket.dto';

@Controller('kanban')
export class KanbanController {
  constructor(private readonly kanbanService: KanbanService) {}

  @Get('board')
  getBoard(@Query('projectId') projectId?: string) {
    return this.kanbanService.getBoard(projectId);
  }

  @Post('tickets')
  createTicket(@Body() body: CreateTicketDto) {
    return this.kanbanService.createTicket(body);
  }

  @Put('tickets/:id')
  updateTicket(@Param('id') id: string, @Body() body: UpdateTicketDto) {
    return this.kanbanService.updateTicket(id, body);
  }

  @Patch('tickets/:id/column')
  moveTicket(@Param('id') id: string, @Body() body: MoveTicketDto) {
    return this.kanbanService.moveTicket(id, body.columnId);
  }

  @Delete('tickets/:id')
  deleteTicket(@Param('id') id: string) {
    return this.kanbanService.deleteTicket(id);
  }
}
