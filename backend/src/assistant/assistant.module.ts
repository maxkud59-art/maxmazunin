import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { VkMessengerClient } from './vk-messenger.client';
import { VkRealtimeGateway } from './vk-realtime.gateway';
import { AssistantService } from './assistant.service';
import { AssistantController } from './assistant.controller';
import { AssistantScheduler } from './assistant.scheduler';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
    }),
  ],
  providers: [VkMessengerClient, VkRealtimeGateway, AssistantService, AssistantScheduler],
  controllers: [AssistantController],
  exports: [AssistantService, VkMessengerClient, VkRealtimeGateway],
})
export class AssistantModule {}
