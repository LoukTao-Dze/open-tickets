import { Module } from '@nestjs/common';
import { AuthModule } from '../../auth/auth.module';
import { SupabaseModule } from '../../supabase/supabase.module';
import { RolesModule } from '../roles/roles.module';
import { ScenesController } from './scenes.controller';
import { ScenesService } from './scenes.service';
import { TestSuitesController } from './test-suites.controller';

@Module({
  imports: [AuthModule, SupabaseModule, RolesModule],
  controllers: [ScenesController, TestSuitesController],
  providers: [ScenesService],
})
export class ScenesModule {}
