import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { SupabaseModule } from './supabase/supabase.module';
//TODO: Uncomment these modules when ready to use Discord functionality
// import { DiscordModule } from './modules/discord/discord.module';
// import { MessageModule } from './modules/message/message.module';
// import { GatewayModule } from './modules/gateway/gateway.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    SupabaseModule,
    HttpModule,
    //TODO: Uncomment these modules when ready to use Discord functionality
    // DiscordModule,
    // MessageModule,
    // GatewayModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
