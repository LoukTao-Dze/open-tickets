import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentSession, SessionGuard } from '../../auth/session.guard';
import { EnumUserRole, type AuthSession } from '../../auth/auth.dto';
import { ProjectAccessService } from '../roles/project-access.service';
import { KanbanService } from './kanban.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { MoveTicketDto } from './dto/move-ticket.dto';
import { ColumnDto, ColumnOrderDto } from './dto/column.dto';

@Controller('kanban')
export class KanbanController {
  constructor(
    private readonly kanbanService: KanbanService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  @Post('columns')
  @UseGuards(SessionGuard)
  createColumn(
    @CurrentSession() session: AuthSession,
    @Body() body: ColumnDto,
  ) {
    this.assertCanManageColumns(session);
    return this.kanbanService.createColumn(body);
  }

  // Declared before `columns/:id` so "order" is not read as a lane ID.
  @Put('columns/order')
  @UseGuards(SessionGuard)
  reorderColumns(
    @CurrentSession() session: AuthSession,
    @Body() body: ColumnOrderDto,
  ) {
    this.assertCanManageColumns(session);
    return this.kanbanService.reorderColumns(body.columnIds);
  }

  @Put('columns/:id')
  @UseGuards(SessionGuard)
  updateColumn(
    @CurrentSession() session: AuthSession,
    @Param('id') id: string,
    @Body() body: ColumnDto,
  ) {
    this.assertCanManageColumns(session);
    return this.kanbanService.updateColumn(id, body);
  }

  @Delete('columns/:id')
  @UseGuards(SessionGuard)
  deleteColumn(
    @CurrentSession() session: AuthSession,
    @Param('id') id: string,
  ) {
    this.assertCanManageColumns(session);
    return this.kanbanService.deleteColumn(id);
  }

  private assertCanManageColumns(session: AuthSession): void {
    // Lanes are board-wide; only existing editor roles may change them.
    const role = session.user.role;
    if (role !== EnumUserRole.ADMIN && role !== EnumUserRole.USER)
      throw new ForbiddenException();
  }

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
