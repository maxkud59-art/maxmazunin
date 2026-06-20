import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { VkAdsModule } from './vk-ads/vk-ads.module';
import { MessengerModule } from './messenger/messenger.module';
import { BookLayoutModule } from './book-layout/book-layout.module';
import { AssistantModule } from './assistant/assistant.module';
import { DirectoriesModule } from './directories/directories.module';
import { ClientsModule } from './clients/clients.module';
import { OrdersModule } from './orders/orders.module';
import { PhrasesModule } from './phrases/phrases.module';
import { BroadcastsModule } from './broadcasts/broadcasts.module';
import { AiSettingsModule } from './ai-settings/ai-settings.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    HealthModule,
    VkAdsModule,
    MessengerModule,
    BookLayoutModule,
    AssistantModule,
    DirectoriesModule,
    ClientsModule,
    OrdersModule,
    PhrasesModule,
    BroadcastsModule,
    AiSettingsModule,
  ],
})
export class AppModule {}
