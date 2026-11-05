import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { SupabaseModule } from '../../supabase/supabase.module';
import { ProjectAccessService } from './project-access.service';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';

@Module({
  imports: [AuthModule, SupabaseModule],
  controllers: [RolesController],
  providers: [RolesService, ProjectAccessService],
  exports: [ProjectAccessService],
})
export class RolesModule {}
