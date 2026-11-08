import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { SupabaseModule } from '../../supabase/supabase.module';
import { DocsController } from './docs.controller';
import { DocsService } from './docs.service';

@Module({
  imports: [AuthModule, SupabaseModule],
  controllers: [DocsController],
  providers: [DocsService],
})
export class DocsModule {}
