import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VkMessengerClient } from '../assistant/vk-messenger.client';
import { BotsService } from './bots.service';
import { BotsController } from './bots.controller';
import { BotEngineService } from './bot-engine.service';
import { VkBotLongPollService } from './vk-bot-longpoll.service';

@Module({
  imports: [PrismaModule],
  providers: [VkMessengerClient, BotsService, BotEngineService, VkBotLongPollService],
  controllers: [BotsController],
})
export class BotsModule {}
