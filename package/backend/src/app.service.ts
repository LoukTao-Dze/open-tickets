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
import { AxiosResponse } from 'axios';
// import axios from 'axios';
// import * as fs from 'fs';

export interface UploadedImage {
  buffer: Buffer;
  originalname: string;
}

export interface DiscordMessageResponse {
  type: number;
  content: string;
  mentions: any[];
  mention_roles: any[];
  attachments: Attachment[];
  embeds: any[];
  timestamp: string;
  edited_timestamp: any;
  flags: number;
  components: any[];
  id: string;
  channel_id: string;
  author: Author;
  pinned: boolean;
  mention_everyone: boolean;
  tts: boolean;
  webhook_id: string;
}

export interface Attachment {
  id: string;
  filename: string;
  size: number;
  url: string;
  proxy_url: string;
  width: number;
  height: number;
  content_type: string;
  content_scan_version: number;
  placeholder: string;
  placeholder_version: number;
}

export interface Author {
  id: string;
  username: string;
  avatar: any;
  discriminator: string;
  public_flags: number;
  flags: number;
  bot: boolean;
  global_name: any;
  clan: any;
  primary_guild: any;
}

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

  async updateImageUrl(imageId: string, imageUrl: string) {
    try {
      const { data, error } = await this.supabaseService
        .getClient()
        .from('images')
        .update({ image_url: imageUrl })
        .eq('id', +imageId);

      if (error) {
        throw error;
      }
      return { data };
    } catch (err: any) {
      throw new InternalServerErrorException({
        message: 'Failed to update image URL',
        detail: err?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }

  async uploadImageToDiscord(
    imageBuffer: Buffer,
    filename: string,
    id: string,
  ): Promise<DiscordMessageResponse> {
    const discordWebhookUrlNew = process.env.DISCORD_WEBHOOK_URL;
    // this.configService.get<string>('DISCORD_WEBHOOK_URL');
    if (!discordWebhookUrlNew) {
      throw new InternalServerErrorException(
        'Discord webhook URL is not configured.',
      );
    }

    const formData = new FormData();

    formData.append(
      'payload_json',
      JSON.stringify({
        content:
          `======================================\n📷 New Image Upload:\nImage ID: ${id}\nDate: ${new Date().toISOString()}\nFile Name: ${filename}\n======================================`.trim(),
      }),
    );

    formData.append('file', imageBuffer, filename);

    try {
      const response: AxiosResponse<DiscordMessageResponse> =
        await firstValueFrom(
          this.httpService.post(discordWebhookUrlNew, formData, {
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
      await this.updateImageUrl(id, response.data.attachments[0].url);
      return response.data as DiscordMessageResponse;
    } catch (error: any) {
      throw new InternalServerErrorException({
        message: 'Failed to upload image to Discord',
        detail: error?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }
}
