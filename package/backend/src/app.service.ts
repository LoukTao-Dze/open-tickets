import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import FormData from 'form-data';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { SupabaseService } from './supabase/supabase.service';
import axios from 'axios';
import * as fs from 'fs';

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
  async uploadImageToDiscord(
    imageBuffer: Buffer,
    filename: string,
  ): Promise<string> {
    const discordWebhookUrl =
      'https://discord.com/api/webhooks/1529309193478082580/OvGXkFXXhzupxO76RDDLMaiB3xX0_YS2CvvMkxya0SJ0fT1rn7UrOdBoN9HAROiCSrkV';
    // this.configService.get<string>('DISCORD_WEBHOOK_URL',);
    if (!discordWebhookUrl) {
      throw new InternalServerErrorException(
        'Discord webhook URL is not configured.',
      );
    }

    const formData = new FormData();
    formData.append(
      'payload_json',
      JSON.stringify({
        content: `
          📷 New Image Upload
          Image ID: ${Date.now()}
          File Name: ${filename}
        `.trim(),
      }),
    );

    formData.append('file', imageBuffer, filename);

    try {
      const response = await firstValueFrom(
        this.httpService.post(discordWebhookUrl, formData, {
          headers: {
            ...formData.getHeaders(),
          },
        }),
      );

      if (response.status !== 200) {
        throw new BadRequestException(
          `Failed to upload image to Discord. Status code: ${response.status}`,
        );
      }

      return response.data;
    } catch (error: any) {
      console.error(
        'Failed to upload image to Discord:',
        error.response?.data || error.message,
      );
      throw new InternalServerErrorException({
        message: 'Failed to upload image to Discord',
        detail: error?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
