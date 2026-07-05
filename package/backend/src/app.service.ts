import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class AppService {
  private readonly port: number;
  constructor(
    private configService: ConfigService,
    private readonly httpService: HttpService,
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
}
