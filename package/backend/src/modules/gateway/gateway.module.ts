import { Module } from '@nestjs/common';
import { GatewayService } from './gateway.service';
import { AppGateway } from './gateway';

@Module({
  providers: [AppGateway, GatewayService],
  exports: [AppGateway],
})
export class GatewayModule {}
