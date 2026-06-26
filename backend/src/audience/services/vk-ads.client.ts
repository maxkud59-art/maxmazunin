/**
 * VK Ads API client — спрятан за интерфейсом.
 * VK_SYNC_ENABLED=false (дефолт) → DryRunVkAdsClient: нет сетевых вызовов, пишет DRY_RUN в VkSyncLog.
 * VK_SYNC_ENABLED=true → RealVkAdsClient: TODO(vk-docs) — нужны живые ключи + сверка с актуальной документацией.
 *
 * Методы: upsertRetargetSegment, uploadCustomAudience, createLookalike, pushExclusions.
 */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface VkAdsClientInterface {
  upsertRetargetSegment(key: string, title: string): Promise<{ segmentId: string }>;
  uploadCustomAudience(segmentId: string, vkUserIds: string[]): Promise<{ uploaded: number }>;
  createLookalike(sourceSegmentId: string, title: string): Promise<{ lalSegmentId: string }>;
  pushExclusions(segmentId: string, vkUserIds: string[]): Promise<{ excluded: number }>;
}

// Заглушка — пишет DRY_RUN в VkSyncLog, не делает сетевых запросов.
@Injectable()
export class DryRunVkAdsClient implements VkAdsClientInterface {
  private readonly logger = new Logger(DryRunVkAdsClient.name);

  constructor(private readonly prisma: PrismaService) {}

  private async log(action: 'CREATE' | 'UPDATE' | 'UPLOAD' | 'LAL', audienceId: string | null, req: any) {
    await this.prisma.vkSyncLog.create({
      data: {
        audienceId: audienceId ?? undefined,
        action,
        request: req,
        response: { note: 'DRY_RUN — VK_SYNC_ENABLED=false' },
        status: 'DRY_RUN',
      },
    });
  }

  async upsertRetargetSegment(key: string, title: string) {
    this.logger.debug(`DRY_RUN upsertRetargetSegment key=${key}`);
    await this.log('CREATE', null, { key, title });
    return { segmentId: `dry_${key}` };
  }

  async uploadCustomAudience(segmentId: string, vkUserIds: string[]) {
    this.logger.debug(`DRY_RUN uploadCustomAudience segmentId=${segmentId} count=${vkUserIds.length}`);
    await this.log('UPLOAD', null, { segmentId, count: vkUserIds.length });
    return { uploaded: vkUserIds.length };
  }

  async createLookalike(sourceSegmentId: string, title: string) {
    this.logger.debug(`DRY_RUN createLookalike from=${sourceSegmentId}`);
    await this.log('LAL', null, { sourceSegmentId, title });
    return { lalSegmentId: `dry_lal_${sourceSegmentId}` };
  }

  async pushExclusions(segmentId: string, vkUserIds: string[]) {
    this.logger.debug(`DRY_RUN pushExclusions segmentId=${segmentId} count=${vkUserIds.length}`);
    await this.log('UPDATE', null, { segmentId, count: vkUserIds.length });
    return { excluded: vkUserIds.length };
  }
}

// TODO(vk-docs): реализовать после получения ключей VK Ads API.
// Нужно сверить актуальные эндпоинты и формат хешей для uploadCustomAudience.
@Injectable()
export class RealVkAdsClient implements VkAdsClientInterface {
  private readonly logger = new Logger(RealVkAdsClient.name);

  constructor(private readonly prisma: PrismaService) {
    this.logger.warn('RealVkAdsClient instantiated — requires VK_ADS_TOKEN and verified API endpoints');
  }

  async upsertRetargetSegment(_key: string, _title: string): Promise<{ segmentId: string }> {
    // TODO(vk-docs): POST https://api.vk.com/method/ads.createTargetGroup or ads.updateTargetGroup
    throw new Error('Not implemented — set VK_SYNC_ENABLED=false or implement with live VK Ads API docs');
  }

  async uploadCustomAudience(_segmentId: string, _vkUserIds: string[]): Promise<{ uploaded: number }> {
    // TODO(vk-docs): ads.importTargetContacts — нужно уточнить хэширование и лимиты batch
    throw new Error('Not implemented');
  }

  async createLookalike(_sourceSegmentId: string, _title: string): Promise<{ lalSegmentId: string }> {
    // TODO(vk-docs): ads.createLookalikeRequest
    throw new Error('Not implemented');
  }

  async pushExclusions(_segmentId: string, _vkUserIds: string[]): Promise<{ excluded: number }> {
    // TODO(vk-docs): ads.importTargetContacts с флагом remove
    throw new Error('Not implemented');
  }
}

export function createVkAdsClient(prisma: PrismaService): VkAdsClientInterface {
  const enabled = process.env.VK_SYNC_ENABLED === 'true';
  if (enabled) {
    const logger = new Logger('VkAdsClientFactory');
    const token = process.env.VK_ADS_TOKEN;
    if (!token) {
      logger.warn('VK_SYNC_ENABLED=true but VK_ADS_TOKEN not set — falling back to DRY_RUN');
      return new DryRunVkAdsClient(prisma);
    }
    return new RealVkAdsClient(prisma);
  }
  return new DryRunVkAdsClient(prisma);
}
