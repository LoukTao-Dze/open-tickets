import { Module } from '@nestjs/common';
import { CanvasService } from './canvas.service';
import { CanvasController } from './canvas.controller';
import { AuthModule } from '../../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { HttpModule } from '@nestjs/axios';
import { SupabaseModule } from '../../supabase/supabase.module';

@Module({
  imports: [HttpModule, SupabaseModule, AuthModule, RolesModule],
  controllers: [CanvasController],
  providers: [CanvasService],
})
export class CanvasModule {}
