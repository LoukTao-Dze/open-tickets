import { Module } from '@nestjs/common';
import { DiscordService } from './discord.service';
import { MessageModule } from '../message/message.module';

@Module({
  imports: [MessageModule],
  providers: [DiscordService],
})
export class DiscordModule {}
