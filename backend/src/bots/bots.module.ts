import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AssistantModule } from '../assistant/assistant.module';
import { BotsService } from './bots.service';
import { BotsController } from './bots.controller';
import { BotEngineService } from './bot-engine.service';
import { VkBotLongPollService } from './vk-bot-longpoll.service';

@Module({
  imports: [PrismaModule, AssistantModule],
  providers: [BotsService, BotEngineService, VkBotLongPollService],
  controllers: [BotsController],
})
export class BotsModule {}
