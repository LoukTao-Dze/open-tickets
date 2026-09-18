import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { SupabaseModule } from './supabase/supabase.module';
import { CanvasModule } from './modules/canvas/canvas.module';
import { KanbanModule } from './modules/kanban/kanban.module';
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
    CanvasModule,
    KanbanModule,
    //TODO: Uncomment these modules when ready to use Discord functionality
    // DiscordModule,
    // MessageModule,
    // GatewayModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
