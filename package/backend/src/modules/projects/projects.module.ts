import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { SupabaseModule } from '../../supabase/supabase.module';
import { AuthModule } from '../../auth/auth.module';
import { RolesModule } from '../roles/roles.module';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [HttpModule, SupabaseModule, AuthModule, RolesModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
