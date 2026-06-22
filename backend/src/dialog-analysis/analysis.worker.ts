import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DialogAnalysisService } from './dialog-analysis.service';

@Injectable()
export class AnalysisWorker {
  private readonly logger = new Logger(AnalysisWorker.name);

  constructor(private readonly svc: DialogAnalysisService) {}

  // Запускаем каждые 10 минут.
  @Cron(CronExpression.EVERY_10_MINUTES)
  async runBatch() {
    this.logger.debug('Dialog analysis batch started');
    try {
      const count = await this.svc.processBatch(50);
      if (count > 0) this.logger.log(`Analyzed ${count} dialogs`);
    } catch (err: any) {
      this.logger.error(`Analysis batch failed: ${err.message}`);
    }
  }
}
