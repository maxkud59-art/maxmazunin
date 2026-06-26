import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AudienceService } from './audience.service';

@Injectable()
export class LalService {
  private readonly logger = new Logger(LalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audienceSvc: AudienceService,
  ) {}

  // Собирает платящих → кладёт в CUSTOM_UPLOAD audience key='payers' → синкает как LAL.
  async buildAndSyncLal(): Promise<void> {
    const count = await this.audienceSvc.buildPayersSeed();
    this.logger.log(`LaL seed built: ${count} payers`);

    // Create or find LAL audience based on payers
    let lalAudience = await this.prisma.adAudience.findUnique({ where: { key: 'lal_payers' } });
    if (!lalAudience) {
      lalAudience = await this.prisma.adAudience.create({
        data: {
          key: 'lal_payers',
          title: 'LaL — похожие на платящих',
          kind: 'LAL',
          rule: { sourceKey: 'payers' },
        },
      });
    }

    // First sync the payers seed (CUSTOM_UPLOAD)
    const payersAud = await this.prisma.adAudience.findUnique({ where: { key: 'payers' } });
    if (payersAud) await this.audienceSvc.sync(payersAud.id);

    // Then sync the LAL audience
    await this.audienceSvc.sync(lalAudience.id);
    this.logger.log('LaL audience synced');
  }
}
