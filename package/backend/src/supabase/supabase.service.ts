import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient | undefined;
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_KEY');

    this.isConfigured = Boolean(supabaseUrl && supabaseKey);
    this.client = this.isConfigured
      ? createClient(supabaseUrl!, supabaseKey!)
      : undefined;
  }

  getClient(): SupabaseClient {
    if (!this.client) {
      throw new InternalServerErrorException(
        'SUPABASE_URL and SUPABASE_KEY must be configured',
      );
    }

    return this.client;
  }

  hasConfiguration(): boolean {
    return this.isConfigured;
  }
}
