import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AssistantModule } from '../assistant/assistant.module';

import { FunnelIngestService } from './services/funnel-ingest.service';
import { AudienceService } from './services/audience.service';
import { VkCallbackService } from './services/vk-callback.service';
import { SilentFollowupService } from './services/silent-followup.service';
import { LalService } from './services/lal.service';
import { createVkAdsClient, VkAdsClientInterface } from './services/vk-ads.client';
import { PrismaService } from '../prisma/prisma.service';

import { FunnelEventsController } from './controllers/funnel-events.controller';
import { AudiencesController } from './controllers/audiences.controller';
import { FunnelController } from './controllers/funnel.controller';

import { AudienceSyncCron } from './cron/audience-sync.cron';

const VK_ADS_CLIENT = 'VK_ADS_CLIENT';

@Module({
  imports: [PrismaModule, AssistantModule],
  providers: [
    FunnelIngestService,
    VkCallbackService,
    SilentFollowupService,
    LalService,
    AudienceSyncCron,
    {
      provide: VK_ADS_CLIENT,
      useFactory: (prisma: PrismaService): VkAdsClientInterface => createVkAdsClient(prisma),
      inject: [PrismaService],
    },
    {
      provide: AudienceService,
      useFactory: (prisma: PrismaService, vkAds: VkAdsClientInterface) =>
        new AudienceService(prisma, vkAds),
      inject: [PrismaService, VK_ADS_CLIENT],
    },
  ],
  controllers: [FunnelEventsController, AudiencesController, FunnelController],
  exports: [FunnelIngestService, VkCallbackService, AudienceService],
})
export class AudienceModule {}
