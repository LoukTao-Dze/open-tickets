import { Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule],
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class SupabaseModule {}
