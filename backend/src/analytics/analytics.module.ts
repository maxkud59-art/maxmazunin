import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FunnelService } from './funnel.service';
import { AnalyticsController } from './analytics.controller';

@Module({
  imports: [PrismaModule],
  providers: [FunnelService],
  controllers: [AnalyticsController],
  exports: [FunnelService],
})
export class AnalyticsModule {}
