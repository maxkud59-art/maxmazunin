import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { VkAdsService } from './vk-ads.service';

@Injectable()
export class VkAdsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VkAdsScheduler.name);
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly vkAdsService: VkAdsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    const intervalMin = Math.max(1, Number(this.config.get('POLL_INTERVAL_MINUTES', '5')));
    this.logger.log(`VK Ads polling started: every ${intervalMin} min`);
    // Запустить первый поллинг через 10 секунд после старта, затем по расписанию
    setTimeout(() => void this.handlePoll(), 10_000);
    this.pollTimer = setInterval(() => void this.handlePoll(), intervalMin * 60_000);
  }

  onModuleDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  // Роллап HourlyStat каждый час в :02 (UTC)
  @Cron('2 * * * *')
  async handleRollup() {
    this.logger.debug('Rollup triggered');
    try {
      await this.vkAdsService.computeRollupForLastHours(2);
    } catch (err: any) {
      this.logger.error(`Rollup error: ${err.message}`);
    }
  }

  async handlePoll() {
    this.logger.debug('Poll triggered');
    try {
      const results = await this.vkAdsService.pollSnapshots();
      const total = results.reduce((s, r) => s + r.snapshots, 0);
      this.logger.log(`Poll done: ${total} snapshots across ${results.length} cabinets`);
      await this.vkAdsService.computeRollupForLastHours(2);
    } catch (err: any) {
      this.logger.error(`Poll error: ${err.message}`);
    }
  }
}
