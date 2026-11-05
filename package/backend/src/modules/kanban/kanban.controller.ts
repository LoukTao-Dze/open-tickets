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
  UseGuards,
} from '@nestjs/common';
import { CurrentSession, SessionGuard } from '../../auth/session.guard';
import type { AuthSession } from '../../auth/auth.dto';
import { ProjectAccessService } from '../roles/project-access.service';
import { KanbanService } from './kanban.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { MoveTicketDto } from './dto/move-ticket.dto';

@Controller('kanban')
export class KanbanController {
  constructor(
    private readonly kanbanService: KanbanService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  @Get('board')
  @UseGuards(SessionGuard)
  async getBoard(
    @CurrentSession() session: AuthSession,
    @Query('projectId') projectId?: string,
  ) {
    const { data } = await this.kanbanService.getBoard(projectId);
    const columns = await Promise.all(
      data.map(async (column) => {
        const tickets = await this.projectAccess.filterByProject(
          session.user.role,
          column.tickets,
          (ticket) => ticket.project.id || undefined,
        );
        return { ...column, tickets, count: tickets.length };
      }),
    );
    return { data: columns };
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
