import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './supabase/supabase.module';
import { HttpModule } from '@nestjs/axios';
// import { DiscordModule } from './modules/discord/discord.module';
// import { MessageModule } from './modules/message/message.module';
// import { GatewayModule } from './modules/gateway/gateway.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // DiscordModule,
    // MessageModule,
    // GatewayModule,
    HttpModule,
    SupabaseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
