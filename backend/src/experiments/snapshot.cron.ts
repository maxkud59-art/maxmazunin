import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ResultsService } from './results.service';

@Injectable()
export class SnapshotCron {
  private readonly logger = new Logger(SnapshotCron.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly results: ResultsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async takeSnapshots() {
    const running = await this.prisma.experiment.findMany({
      where: { status: 'RUNNING' },
      select: { id: true, variants: { select: { id: true } } },
    });

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    for (const exp of running) {
      try {
        const res = await this.results.computeResults(exp.id);
        for (const v of res.variants) {
          await this.prisma.experimentResultSnapshot.upsert({
            where: { experimentId_variantId_snapshotDate: { experimentId: exp.id, variantId: v.variantId, snapshotDate: today } },
            create: {
              experimentId: exp.id,
              variantId: v.variantId,
              snapshotDate: today,
              nAssigned: v.nAssigned,
              nMatured: v.nMatured,
              nPaid: v.nPaid,
              revenuePaid: 0,
              convToPaid: v.convToPaid,
              zVsControl: v.zVsControl,
              pValue: v.pValue,
            },
            update: {
              nAssigned: v.nAssigned,
              nMatured: v.nMatured,
              nPaid: v.nPaid,
              convToPaid: v.convToPaid,
              zVsControl: v.zVsControl,
              pValue: v.pValue,
            },
          });
        }
        this.logger.log(`Snapshot saved for experiment ${exp.id}`);
      } catch (err: any) {
        this.logger.error(`Snapshot failed for ${exp.id}: ${err.message}`);
      }
    }
  }
}
