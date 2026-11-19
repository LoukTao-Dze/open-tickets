import { ConflictException, Injectable, Logger } from '@nestjs/common';
import type { PostgrestError } from '@supabase/supabase-js';
import {
  CanvasSelectionDto,
  CanvasGroupDto,
  CreateCanvasGroupDto,
  MoveCanvasGroupDto,
  UpdateCanvasGroupDto,
} from './dto/canvas-selection.dto';
import { ConfigService } from '@nestjs/config';
import { CreateCanvaDto } from './dto/create-canva.dto';
import { UpdateCanvaDto } from './dto/update-canva.dto';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common/exceptions';
import { SupabaseService } from '../../supabase/supabase.service';

export interface CanvasItemPayload {
  id?: string;
  projectId: string;
  type: string;
  x: number;
  y: number;
  zIndex: number;
  [key: string]: unknown;
}

export interface CanvasGroupRecord {
  id: number;
  name: string;
  project_id: string;
  color: string;
}

const CANVAS_ITEM_TABLE_BY_TYPE: Record<string, string> = {
  'sticky-note': 'sticky_notes',
  image: 'images',
  'code-snippet': 'code_snippets',
  text: 'texts',
  link: 'links',
  markdown: 'markdown_items',
};

const CANVAS_ITEM_TYPE_BY_TABLE: Record<string, string> = Object.fromEntries(
  Object.entries(CANVAS_ITEM_TABLE_BY_TYPE).map(([type, table]) => [
    table,
    type,
  ]),
);

@Injectable()
export class CanvasService {
  private readonly logger = new Logger(CanvasService.name);
  private readonly port: number;
  constructor(
    private configService: ConfigService,
    private readonly supabaseService: SupabaseService,
  ) {
    this.port = this.configService.get('PORT')!;
  }

  async saveCanvasItem(body: CanvasItemPayload) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Canvas item payload is required');
    }

    const { type, projectId } = body;
    const table = CANVAS_ITEM_TABLE_BY_TYPE[type];

    if (!table) {
      throw new BadRequestException(`Unsupported canvas item type: ${type}`);
    }

    if (!projectId) {
      throw new BadRequestException('Canvas item must include an projectId');
    }

    // Group membership is assigned only by the project-scoped group transaction.
    const record = Object.fromEntries(
      Object.entries(body).filter(
        ([key]) => key !== 'type' && key !== 'groupId' && key !== 'group_id',
      ),
    );
    const snakeCaseRecord = this.toSnakeCaseRecord(record);

    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from(table)
        .upsert(snakeCaseRecord, { onConflict: 'id' })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return { message: 'Canvas item saved', data };
    } catch (err: any) {
      console.error('Failed to save canvas item:', err?.message || err);
      throw new InternalServerErrorException({
        message: 'Failed to save canvas item',
        detail: err?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  async getCanvasItem(projectId?: string) {
    try {
      const tables = Object.entries(CANVAS_ITEM_TYPE_BY_TABLE);

      const resultsByTable = await Promise.all(
        tables.map(async ([table, type]) => {
          let query = this.supabaseService.getClient().from(table).select('*');

          if (projectId) {
            query = query.eq('project_id', projectId);
          }

          const { data, error } = await query;

          if (error) {
            throw error;
          }

          return (data ?? []).map((row) => ({
            ...this.toCamelCaseRecord(row as Record<string, unknown>),
            type,
          }));
        }),
      );

      return { data: resultsByTable.flat() };
    } catch (err: any) {
      console.error('Failed to retrieve canvas items:', err?.message || err);
      throw new InternalServerErrorException({
        message: 'Failed to retrieve canvas items',
        detail: err?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  async getGroups(projectId: string) {
    if (!projectId) {
      throw new BadRequestException('projectId is required');
    }
    const { data, error } = await this.supabaseService
      .getClient()
      .from('canvas_groups')
      .select('id, name, project_id, color')
      .eq('project_id', projectId)
      .returns<CanvasGroupRecord[]>();
    if (error) this.throwSelectionError(error);
    return { data };
  }

  async createGroup(body: CreateCanvasGroupDto) {
    const { data, error } = await this.supabaseService
      .getClient()
      .rpc('create_canvas_group', {
        p_project_id: body.projectId,
        p_items: body.items,
        p_name: body.name?.trim() || null,
      })
      .returns<CanvasGroupRecord>();
    if (error) this.throwSelectionError(error);
    return { data };
  }

  async moveGroup(body: MoveCanvasGroupDto) {
    const { error } = await this.supabaseService
      .getClient()
      .rpc('move_canvas_group', {
        p_project_id: body.projectId,
        p_group_id: body.groupId,
        p_dx: body.dx,
        p_dy: body.dy,
      })
      .returns<null>();
    if (error) this.throwSelectionError(error);
    return { message: 'Canvas group moved' };
  }

  async updateGroup(body: UpdateCanvasGroupDto) {
    // Both identifiers scope the update; never trust a client-supplied group ID alone.
    const { data, error } = await this.supabaseService
      .getClient()
      .from('canvas_groups')
      .update({
        name: body.name.trim() || `Group-${body.groupId}`,
        color: body.color.toLowerCase(),
      })
      .eq('project_id', body.projectId)
      .eq('id', body.groupId)
      .select('id, name, project_id, color')
      .single<CanvasGroupRecord>();
    if (error) this.throwSelectionError(error);
    if (!data) throw new ConflictException('Canvas group no longer exists');
    return { data };
  }

  async ungroup(body: CanvasGroupDto) {
    // ON DELETE SET NULL detaches all item types atomically without deleting items.
    const { data, error } = await this.supabaseService
      .getClient()
      .from('canvas_groups')
      .delete()
      .eq('project_id', body.projectId)
      .eq('id', body.groupId)
      .select('id')
      .single<{ id: number }>();
    if (error) this.throwSelectionError(error);
    if (!data) throw new ConflictException('Canvas group no longer exists');
    return { groupId: data.id };
  }

  async deleteCanvasItems(body: CanvasSelectionDto) {
    const { data, error } = await this.supabaseService
      .getClient()
      .rpc('mutate_canvas_selection', {
        p_project_id: body.projectId,
        p_items: body.items,
        p_delete: true,
        p_group_id: null,
      })
      .returns<number>();
    if (error) this.throwSelectionError(error);
    return { deletedCount: data };
  }

  private throwSelectionError(error: PostgrestError): never {
    if (error.code === 'P0002' || error.code === 'PGRST116') {
      throw new ConflictException(
        'Canvas items changed. Reload the board and try again.',
      );
    }
    this.logger.error(`Canvas selection operation failed (${error.code})`);
    throw new InternalServerErrorException('Failed to update canvas selection');
  }

  async deleteCanvasItem(body: { id: string; type: string }) {
    const { id, type } = body;
    if (!id || !type) {
      throw new BadRequestException('Canvas item id and type are required');
    }

    const table = CANVAS_ITEM_TABLE_BY_TYPE[type];

    if (!table) {
      throw new BadRequestException(`Unsupported canvas item type: ${type}`);
    }

    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from(table)
        .delete()
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return { message: 'Canvas item deleted', data };
    } catch (err: any) {
      console.error('Failed to delete canvas item:', err?.message || err);
      throw new InternalServerErrorException({
        message: 'Failed to delete canvas item',
        detail: err?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  private toSnakeCaseRecord(
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.entries(input).reduce(
      (acc, [key, value]) => {
        acc[this.toSnakeCase(key)] = value;
        return acc;
      },
      {} as Record<string, unknown>,
    );
  }

  private toSnakeCase(key: string): string {
    return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  private toCamelCaseRecord(
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    return Object.entries(input).reduce(
      (acc, [key, value]) => {
        acc[this.toCamelCase(key)] = value;
        return acc;
      },
      {} as Record<string, unknown>,
    );
  }

  private toCamelCase(key: string): string {
    return key.replace(/_([a-z0-9])/g, (_match, letter: string) =>
      letter.toUpperCase(),
    );
  }
  create(createCanvaDto: CreateCanvaDto) {
    return 'This action adds a new canva';
  }

  findAll() {
    return `This action returns all canvas`;
  }

  findOne(id: number) {
    return `This action returns a #${id} canva`;
  }

  update(id: number, updateCanvaDto: UpdateCanvaDto) {
    return `This action updates a #${id} canva`;
  }

  remove(id: number) {
    return `This action removes a #${id} canva`;
  }
}
