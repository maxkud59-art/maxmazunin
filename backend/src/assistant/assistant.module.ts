import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VkMessengerClient } from './vk-messenger.client';
import { AssistantService } from './assistant.service';
import { AssistantController } from './assistant.controller';
import { AssistantScheduler } from './assistant.scheduler';

@Module({
  imports: [PrismaModule],
  providers: [VkMessengerClient, AssistantService, AssistantScheduler],
  controllers: [AssistantController],
})
export class AssistantModule {}
