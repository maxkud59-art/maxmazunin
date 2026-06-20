import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AssistantService } from './assistant.service';

@Injectable()
export class AssistantScheduler implements OnModuleInit {
  private readonly logger = new Logger(AssistantScheduler.name);

  constructor(private readonly svc: AssistantService) {}

  onModuleInit() {
    // Initial sync on startup (delayed to not block boot)
    setTimeout(() => {
      this.logger.log('Initial VK conversation sync on startup');
      void this.svc.syncAll();
    }, 10_000);
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async poll() {
    this.logger.debug('VK conversation sync triggered');
    await this.svc.syncAll();
  }
}
