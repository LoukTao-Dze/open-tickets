import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { KanbanService } from './kanban.service';
import { KanbanController } from './kanban.controller';
import { SupabaseModule } from '../../supabase/supabase.module';

@Module({
  imports: [HttpModule, SupabaseModule],
  controllers: [KanbanController],
  providers: [KanbanService],
})
export class KanbanModule {}
