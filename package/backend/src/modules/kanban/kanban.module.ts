import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { HttpModule } from '@nestjs/axios';
import { KanbanService } from './kanban.service';
import { KanbanController } from './kanban.controller';
import { SupabaseModule } from '../../supabase/supabase.module';

@Module({
  imports: [HttpModule, SupabaseModule, AuthModule, RolesModule],
  controllers: [KanbanController],
  providers: [KanbanService],
})
export class KanbanModule {}
