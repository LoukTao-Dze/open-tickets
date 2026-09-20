import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { SupabaseService } from '../../supabase/supabase.service';

interface ProjectRow {
  priority?: string;
  deadline?: string;
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  status?: string;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly supabaseService: SupabaseService) {}

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
  async createProject(dto: CreateProjectDto) {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('projects')
        .insert({
          name: dto.name,
          description: dto.description ?? null,
          is_default: dto.isDefault ?? false,
          priority: dto.priority ?? null,
          deadline: dto.deadline ? new Date(dto.deadline).toISOString() : null,
          status: dto.status ?? 'Planning',
        })
        .select(
          'id, name, description, is_default, created_at, updated_at, status, priority, deadline',
        )
        .single();
      if (error) {
        throw error;
      }

      return { message: 'Project created', data: this.mapProjectRow(data) };
    } catch (err: unknown) {
      throw this.createProjectPersistenceException('create', err);
    }
  }

  async updateProject(id: string, dto: UpdateProjectDto) {
    await this.assertProjectExists(id);

    const record: Record<string, unknown> = {};
    if (dto.name !== undefined) record.name = dto.name;
    if (dto.description !== undefined) record.description = dto.description;
    if (dto.isDefault !== undefined) record.is_default = dto.isDefault;
    if (dto.priority !== undefined) record.priority = dto.priority;
    if (dto.deadline !== undefined) record.deadline = dto.deadline;
    if (dto.status !== undefined) record.status = dto.status;

    if (!Object.keys(record).length) {
      throw new BadRequestException('Project update payload is required');
    }
    record.updated_at = new Date().toISOString();
    record.deadline = dto.deadline
      ? new Date(dto.deadline).toISOString()
      : null;

    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('projects')
        .update(record)
        .eq('id', id)
        .select(
          'id, name, description, is_default, created_at, updated_at, status, priority, deadline',
        )
        .single();
      if (error) {
        throw error;
      }

      return { message: 'Project updated', data: this.mapProjectRow(data) };
    } catch (err: unknown) {
      throw this.createProjectPersistenceException('update', err);
    }
  }

  async deleteProject(id: string) {
    await this.assertProjectExists(id);

    try {
      const { error } = await this.supabaseService
        .getClient()
        .from('projects')
        .delete()
        .eq('id', id);
      if (error) {
        throw error;
      }

      return { message: 'Project deleted', data: { id } };
    } catch (err: unknown) {
      throw this.createProjectPersistenceException('delete', err);
    }
  }
  private createProjectPersistenceException(
    operation: string,
    err: unknown,
  ): InternalServerErrorException {
    const detail = this.getPersistenceErrorMessage(err);
    console.error(`Failed to ${operation} project:`, detail);
    return new InternalServerErrorException({
      message: `Failed to ${operation} project`,
      detail,
      timestamp: new Date().toISOString(),
    });
  }

  private getPersistenceErrorMessage(err: unknown): string {
    if (err instanceof Error) {
      return err.message;
    }
    if (typeof err === 'object' && err !== null && 'message' in err) {
      const message = err.message;
      if (typeof message === 'string') {
        return message;
      }
    }
    return 'Unknown error';
  }
  private async assertProjectExists(id: string): Promise<void> {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('projects')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      throw new InternalServerErrorException({
        message: 'Failed to look up project',
        detail: error.message,
        timestamp: new Date().toISOString(),
      });
    }
    if (!data) {
      throw new NotFoundException(`Project ${id} not found`);
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
      status: project.status,
      priority: project.priority,
      deadline: project.deadline,
    };
  }
}
