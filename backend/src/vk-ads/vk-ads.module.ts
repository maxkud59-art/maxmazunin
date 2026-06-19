import { Module } from '@nestjs/common';
import { VkAdsController } from './vk-ads.controller';
import { VkAdsService } from './vk-ads.service';
import { VkAdsScheduler } from './vk-ads.scheduler';
import { VkAdsClientService } from './vk-ads-client.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VkAdsController],
  providers: [VkAdsService, VkAdsScheduler, VkAdsClientService],
})
export class VkAdsModule {}
