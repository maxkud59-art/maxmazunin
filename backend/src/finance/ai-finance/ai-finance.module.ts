import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiFinanceController } from './ai-finance.controller';
import { ClassifyService } from './classify/classify.service';
import { LearningService } from './classify/learning.service';
import { AnalyticsService } from './insights/analytics.service';
import { ForecastService } from './insights/forecast.service';
import { AnomalyService } from './insights/anomaly.service';

@Module({
  imports: [PrismaModule],
  providers: [ClassifyService, LearningService, AnalyticsService, ForecastService, AnomalyService],
  controllers: [AiFinanceController],
  exports: [ClassifyService, AnalyticsService],
})
export class AiFinanceModule {}
