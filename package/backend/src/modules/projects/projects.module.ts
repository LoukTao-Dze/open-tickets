import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { SupabaseModule } from 'src/supabase/supabase.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule, SupabaseModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
