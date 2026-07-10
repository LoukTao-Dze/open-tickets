import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { SupabaseService } from './supabase/supabase.service';

export interface CanvasItemPayload {
  id: string;
  projectId: string;
  type: string;
  x: number;
  y: number;
  zIndex: number;
  [key: string]: unknown;
}

const CANVAS_ITEM_TABLE_BY_TYPE: Record<string, string> = {
  'sticky-note': 'sticky_notes',
  image: 'images',
  'code-snippet': 'code_snippets',
  text: 'texts',
  link: 'links',
};

const CANVAS_ITEM_TYPE_BY_TABLE: Record<string, string> = Object.fromEntries(
  Object.entries(CANVAS_ITEM_TABLE_BY_TYPE).map(([type, table]) => [
    table,
    type,
  ]),
);

@Injectable()
export class AppService {
  private readonly port: number;
  constructor(
    private configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly supabaseService: SupabaseService,
  ) {
    this.port = this.configService.get('PORT')!;
  }

  getHello(): string {
    console.log(this.port);
    return `Hello World! Port: ${this.port}`;
  }

  async getHealth(): Promise<{
    backend_healthy: {
      status: string;
      message: string;
      timestamp: string;
    };
    supabase_healthy: {
      status: string;
      message: string;
      timestamp: string;
    };
  }> {
    try {
      const res = await this.checkSupabaseHealth();

      const supabaseHealthy =
        res?.status === 'healthy' || res?.name === 'GoTrue';

      return {
        backend_healthy: {
          status: 'healthy',
          message: 'Backend is healthy',
          timestamp: new Date().toISOString(),
        },

        supabase_healthy: {
          status: supabaseHealthy ? 'healthy' : 'unhealthy',
          message: supabaseHealthy
            ? 'Supabase is healthy'
            : 'Supabase is unhealthy',
          timestamp: new Date().toISOString(),
        },
      };
    } catch (err: any) {
      throw new InternalServerErrorException({
        message: 'Supabase health check failed',
        detail: err?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  async checkSupabaseHealth() {
    const url = `${process.env.SUPABASE_URL}/auth/v1/health`;
    const headers = {
      apikey: `${process.env.SUPABASE_KEY}`,
      Authorization: `Bearer ${process.env.SUPABASE_KEY}`,
    };
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, {
          headers,
        }),
      );
      return response.data;
    } catch (error: any) {
      console.error(error.response?.data || error.message);
      throw error;
    }
  }

  async getAllProjects() {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('projects')
        .select('*');

      if (error) {
        throw error;
      }

      return { data };
    } catch (err: any) {
      console.error('Failed to retrieve projects:', err?.message || err);
      throw new InternalServerErrorException({
        message: 'Failed to retrieve projects',
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

  async saveCanvasItem(body: CanvasItemPayload) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Canvas item payload is required');
    }

    const { type, id, projectId } = body;
    const table = CANVAS_ITEM_TABLE_BY_TYPE[type];

    if (!table) {
      throw new BadRequestException(`Unsupported canvas item type: ${type}`);
    }

    if (!id || !projectId) {
      throw new BadRequestException(
        'Canvas item must include an id and projectId',
      );
    }

    const { type: _type, ...record } = body;
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

  async deleteCanvasItem(id: string, type: string) {
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
}
