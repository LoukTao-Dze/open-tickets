import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { SupabaseModule } from '../supabase/supabase.module';
import { SupabaseService } from '../supabase/supabase.service';
import { AdminGuard } from './admin.guard';
import { SessionGuard } from './session.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DatabaseSessionService } from './database-session.service';
import { RedisService } from './redis.service';
import { SessionStore } from './session-store';

// Redis stays the default; only an explicit USE_REDIS=false switches to the database.
const sessionStoreProvider = {
  provide: SessionStore,
  inject: [ConfigService, SupabaseService],
  useFactory: (
    config: ConfigService,
    supabase: SupabaseService,
  ): SessionStore =>
    config.get<string>('USE_REDIS') === 'false'
      ? new DatabaseSessionService(supabase)
      : new RedisService(config),
};

@Module({
  imports: [JwtModule.register({}), SupabaseModule],
  controllers: [AuthController],
  providers: [AuthService, AdminGuard, SessionGuard, sessionStoreProvider],
  exports: [AuthService, AdminGuard, SessionGuard],
})
export class AuthModule {}
