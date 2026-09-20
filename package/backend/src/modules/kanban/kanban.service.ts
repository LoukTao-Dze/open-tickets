import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../../supabase/supabase.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';

const TICKET_ID_PREFIX = 'DS';
const DEFAULT_ASSIGNEE_AVATAR_URL =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%238b919d'><circle cx='12' cy='8' r='4'/><path d='M4 20c0-4 4-6 8-6s8 2 8 6'/></svg>";
const DEFAULT_TICKET_META: { icon: string; label: string }[] = [
  { icon: 'schedule', label: 'New' },
];

const KANBAN_COLUMN_ORDER = [
  'todo',
  'in-progress',
  'ready-to-test',
  'test-in-progress',
  'test-fail',
  'done',
];

interface TicketRow {
  id: string;
  column_id: string;
  title: string;
  priority: string;
  detail: string | null;
  assignee_avatar_url: string;
  assignee_alt: string;
  alert: string | null;
  create_date: string | null;
  update_date: string | null;
  task_type: string | null;
  job_type: string | null;
  projects: { id: string; name: string } | null;
  kanban_ticket_meta:
    { icon: string; label: string; position: number }[] | null;
}

interface ProjectRow {
  priority: string | null;
  deadline: string | null;
  status: string | null;
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class KanbanService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async getBoard(projectId?: string) {
    try {
      const client = this.supabaseService.getClient();

      const { data: columns, error: columnsError } = await client
        .from('kanban_columns')
        .select('*');
      if (columnsError) {
        throw columnsError;
      }

      let ticketsQuery = client
        .from('kanban_tickets')
        .select(
          '*, projects(id, name), kanban_ticket_meta(icon, label, position)',
        );
      if (projectId) {
        ticketsQuery = ticketsQuery.eq('project_id', projectId);
      }
      const { data: tickets, error: ticketsError } = await ticketsQuery;
      if (ticketsError) {
        throw ticketsError;
      }

      const mappedTickets = (tickets ?? []).map((row) =>
        this.mapTicketRow(row as TicketRow),
      );

      const orderedColumns = (columns ?? [])
        .slice()
        .sort(
          (a, b) =>
            KANBAN_COLUMN_ORDER.indexOf(a.id) -
            KANBAN_COLUMN_ORDER.indexOf(b.id),
        );

      const data = orderedColumns.map((column) => {
        const columnTickets = mappedTickets.filter(
          (ticket) => ticket.columnId === column.id,
        );
        return {
          id: column.id,
          name: column.name,
          status: column.status,
          count: columnTickets.length,
          tickets: columnTickets,
        };
      });

      return { data };
    } catch (err: any) {
      console.error('Failed to load kanban board:', err?.message || err);
      throw new InternalServerErrorException({
        message: 'Failed to load kanban board',
        detail: err?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  async getProjects() {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('projects')
        .select(
          'id, name, description, is_default, created_at, updated_at, priority, deadline, status',
        )
        .order('name');
      if (error) {
        throw error;
      }

      return {
        data: (data ?? []).map((project) =>
          this.mapProjectRow(project as ProjectRow),
        ),
      };
    } catch (err: any) {
      console.error('Failed to load projects:', err?.message || err);
      throw new InternalServerErrorException({
        message: 'Failed to load projects',
        detail: err?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  async createTicket(dto: CreateTicketDto) {
    try {
      const client = this.supabaseService.getClient();
      const id = await this.generateTicketId();

      const record = {
        id,
        column_id: dto.columnId,
        title: dto.title,
        detail: dto.detail ?? null,
        priority: dto.priority,
        project_id: dto.projectId,
        assignee_avatar_url:
          dto.assigneeAvatarUrl ?? DEFAULT_ASSIGNEE_AVATAR_URL,
        assignee_alt: dto.assigneeAlt,
        create_date: dto.createDate ?? null,
        update_date: dto.updateDate ?? null,
        task_type: dto.taskType ?? null,
        job_type: dto.jobType ?? null,
      };

      const { error: insertError } = await client
        .from('kanban_tickets')
        .insert(record);
      if (insertError) {
        throw insertError;
      }

      const meta = dto.meta && dto.meta.length ? dto.meta : DEFAULT_TICKET_META;
      await this.replaceTicketMeta(id, meta);

      const data = await this.fetchTicketById(id);
      return { message: 'Ticket created', data };
    } catch (err: any) {
      console.error('Failed to create ticket:', err?.message || err);
      throw new InternalServerErrorException({
        message: 'Failed to create ticket',
        detail: err?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  async updateTicket(id: string, dto: UpdateTicketDto) {
    await this.assertTicketExists(id);

    try {
      const client = this.supabaseService.getClient();
      const record: Record<string, unknown> = {};

      if (dto.columnId !== undefined) record.column_id = dto.columnId;
      if (dto.title !== undefined) record.title = dto.title;
      if (dto.detail !== undefined) record.detail = dto.detail;
      if (dto.priority !== undefined) record.priority = dto.priority;
      if (dto.projectId !== undefined) record.project_id = dto.projectId;
      if (dto.assigneeAvatarUrl !== undefined)
        record.assignee_avatar_url = dto.assigneeAvatarUrl;
      if (dto.assigneeAlt !== undefined) record.assignee_alt = dto.assigneeAlt;
      if (dto.createDate !== undefined) record.create_date = dto.createDate;
      if (dto.updateDate !== undefined) record.update_date = dto.updateDate;
      if (dto.taskType !== undefined) record.task_type = dto.taskType;
      if (dto.jobType !== undefined) record.job_type = dto.jobType;

      if (Object.keys(record).length) {
        const { error } = await client
          .from('kanban_tickets')
          .update(record)
          .eq('id', id);
        if (error) {
          throw error;
        }
      }

      if (dto.meta !== undefined) {
        await this.replaceTicketMeta(id, dto.meta);
      }

      const data = await this.fetchTicketById(id);
      return { message: 'Ticket updated', data };
    } catch (err: any) {
      console.error('Failed to update ticket:', err?.message || err);
      throw new InternalServerErrorException({
        message: 'Failed to update ticket',
        detail: err?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  async moveTicket(id: string, columnId: string) {
    await this.assertTicketExists(id);

    try {
      const { error } = await this.supabaseService
        .getClient()
        .from('kanban_tickets')
        .update({ column_id: columnId })
        .eq('id', id);
      if (error) {
        throw error;
      }

      const data = await this.fetchTicketById(id);
      return { message: 'Ticket moved', data };
    } catch (err: any) {
      console.error('Failed to move ticket:', err?.message || err);
      throw new InternalServerErrorException({
        message: 'Failed to move ticket',
        detail: err?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  async deleteTicket(id: string) {
    await this.assertTicketExists(id);

    try {
      const { error } = await this.supabaseService
        .getClient()
        .from('kanban_tickets')
        .delete()
        .eq('id', id);
      if (error) {
        throw error;
      }

      return { message: 'Ticket deleted', data: { id } };
    } catch (err: any) {
      console.error('Failed to delete ticket:', err?.message || err);
      throw new InternalServerErrorException({
        message: 'Failed to delete ticket',
        detail: err?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async assertTicketExists(id: string): Promise<void> {
    if (!id) {
      throw new BadRequestException('Ticket id is required');
    }

    const { data, error } = await this.supabaseService
      .getClient()
      .from('kanban_tickets')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException({
        message: 'Failed to look up ticket',
        detail: error.message,
        timestamp: new Date().toISOString(),
      });
    }
    if (!data) {
      throw new NotFoundException(`Ticket ${id} not found`);
    }
  }

  private mapProjectRow(project: ProjectRow) {
    return {
      id: project.id,
      project_name: project.name,
      description: project.description,
      isDefault: project.is_default,
      createdAt: project.created_at,
      updatedAt: project.updated_at,
      priority: project.priority,
      deadline: project.deadline,
      status: project.status,
    };
  }

  private async replaceTicketMeta(
    ticketId: string,
    meta: { icon: string; label: string }[],
  ): Promise<void> {
    const client = this.supabaseService.getClient();

    const { error: deleteError } = await client
      .from('kanban_ticket_meta')
      .delete()
      .eq('ticket_id', ticketId);
    if (deleteError) {
      throw deleteError;
    }

    if (!meta.length) {
      return;
    }

    const rows = meta.map((item, index) => ({
      ticket_id: ticketId,
      icon: item.icon,
      label: item.label,
      position: index,
    }));

    const { error: insertError } = await client
      .from('kanban_ticket_meta')
      .insert(rows);
    if (insertError) {
      throw insertError;
    }
  }

  private async fetchTicketById(id: string) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('kanban_tickets')
      .select(
        '*, projects(id, name), kanban_ticket_meta(icon, label, position)',
      )
      .eq('id', id)
      .single();

    if (error) {
      throw error;
    }

    return this.mapTicketRow(data as TicketRow);
  }

  private async generateTicketId(): Promise<string> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('kanban_tickets')
      .select('id');

    if (error) {
      throw error;
    }

    const numericIds = (data ?? [])
      .map((row) => Number((row.id as string).replace(/[^0-9]/g, '')))
      .filter((value) => !Number.isNaN(value));
    const nextNumber = (numericIds.length ? Math.max(...numericIds) : 1000) + 1;
    return `${TICKET_ID_PREFIX}-${nextNumber}`;
  }

  private mapTicketRow(row: TicketRow) {
    const meta = (row.kanban_ticket_meta ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((item) => ({ icon: item.icon, label: item.label }));

    return {
      id: row.id,
      columnId: row.column_id,
      title: row.title,
      priority: row.priority,
      project: {
        id: row.projects?.id ?? '',
        project_name: row.projects?.name ?? '',
      },
      meta,
      assigneeAvatarUrl: row.assignee_avatar_url,
      assigneeAlt: row.assignee_alt,
      alert: row.alert ?? undefined,
      detail: row.detail ?? undefined,
      createDate: row.create_date ?? undefined,
      updateDate: row.update_date ?? undefined,
      taskType: row.task_type ?? undefined,
      jobType: row.job_type ?? undefined,
    };
  }
}
