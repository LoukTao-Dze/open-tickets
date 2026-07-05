import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client, GatewayIntentBits, Message } from 'discord.js';
import { AppGateway } from '../gateway/gateway';
import { MessageService } from '../message/message.service';

export interface DiscordMessage {
  id: string;
  channel_id: string;
  content: string;
  author: string;
  created_at: Date;
}

@Injectable()
export class DiscordService implements OnModuleInit {
  client: Client = null as any;

  constructor(
    private gateway: AppGateway,
    private messageService: MessageService,
  ) {}

  async onModuleInit() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    await this.client.login(process.env.DISCORD_TOKEN);

    this.client.on('messageCreate', (msg: Message) => {
      void this.handleMessage(msg);
    });
  }

  private async handleMessage(msg: Message): Promise<void> {
    if (msg.author.bot) return;

    const data: DiscordMessage = {
      id: msg.id,
      channel_id: msg.channelId,
      content: msg.content,
      author: msg.author.username,
      created_at: msg.createdAt,
    };

    await this.messageService.save(data);
    this.gateway.emitMessage(msg.channelId, data);
  }
}
