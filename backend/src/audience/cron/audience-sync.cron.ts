import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AudienceService } from '../services/audience.service';
import { SilentFollowupService } from '../services/silent-followup.service';
import { LalService } from '../services/lal.service';

@Injectable()
export class AudienceSyncCron {
  private readonly logger = new Logger(AudienceSyncCron.name);

  constructor(
    private readonly audienceSvc: AudienceService,
    private readonly followup: SilentFollowupService,
    private readonly lal: LalService,
  ) {}

  // Авто-дожим молчунов — каждые 10 минут.
  @Cron(CronExpression.EVERY_10_MINUTES)
  async runSilentFollowup() {
    try {
      const sent = await this.followup.processBatch(50);
      if (sent > 0) this.logger.log(`Silent followup: sent ${sent}`);
    } catch (err: any) {
      this.logger.error(`SilentFollowup cron failed: ${err.message}`);
    }
  }

  // Sync всех активных CUSTOM_UPLOAD аудиторий — раз в 6 часов.
  @Cron('0 */6 * * *')
  async syncCustomAudiences() {
    try {
      const audiences = await (this.audienceSvc as any).prisma.adAudience.findMany({
        where: { kind: 'CUSTOM_UPLOAD', status: 'ACTIVE' },
        select: { id: true },
      });
      for (const a of audiences) {
        await this.audienceSvc.sync(a.id).catch((e: Error) => this.logger.error(`Sync ${a.id} failed: ${e.message}`));
      }
    } catch (err: any) {
      this.logger.error(`Custom audience sync cron failed: ${err.message}`);
    }
  }

  // LaL обновление — раз в сутки в 03:00.
  @Cron('0 3 * * *')
  async refreshLal() {
    try {
      await this.lal.buildAndSyncLal();
    } catch (err: any) {
      this.logger.error(`LaL refresh cron failed: ${err.message}`);
    }
  }
}
