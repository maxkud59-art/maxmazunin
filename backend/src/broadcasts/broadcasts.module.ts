import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BroadcastsService } from './broadcasts.service';
import { BroadcastsController } from './broadcasts.controller';
import { VkMessengerClient } from '../assistant/vk-messenger.client';

@Module({
  imports: [PrismaModule],
  providers: [BroadcastsService, VkMessengerClient],
  controllers: [BroadcastsController],
})
export class BroadcastsModule {}
