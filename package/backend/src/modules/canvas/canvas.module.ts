import { Module } from '@nestjs/common';
import { CanvasService } from './canvas.service';
import { CanvasController } from './canvas.controller';
import { HttpModule } from '@nestjs/axios';
import { SupabaseModule } from '../../supabase/supabase.module';

@Module({
  imports: [HttpModule, SupabaseModule],
  controllers: [CanvasController],
  providers: [CanvasService],
})
export class CanvasModule {}
