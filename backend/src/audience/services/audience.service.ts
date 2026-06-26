import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAudienceDto } from '../dto/create-audience.dto';
import { VkAdsClientInterface } from './vk-ads.client';

@Injectable()
export class AudienceService {
  private readonly logger = new Logger(AudienceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vkAds: VkAdsClientInterface,
  ) {}

  async create(dto: CreateAudienceDto) {
    return this.prisma.adAudience.create({
      data: {
        key: dto.key,
        title: dto.title,
        kind: dto.kind,
        rule: (dto.rule as any) ?? {},
      },
    });
  }

  async list() {
    const audiences = await this.prisma.adAudience.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { memberships: true } },
        syncLogs: {
          orderBy: { ts: 'desc' },
          take: 1,
          select: { status: true, ts: true, action: true, error: true },
        },
      },
    });
    return audiences.map((a) => ({
      ...a,
      memberCount: a._count.memberships,
      lastSync: a.syncLogs[0] ?? null,
    }));
  }

  async findOne(id: string) {
    const a = await this.prisma.adAudience.findUnique({
      where: { id },
      include: { syncLogs: { orderBy: { ts: 'desc' }, take: 20 } },
    });
    if (!a) throw new NotFoundException(`AdAudience ${id} not found`);
    return a;
  }

  async sync(id: string): Promise<void> {
    const audience = await this.prisma.adAudience.findUnique({
      where: { id },
      include: { memberships: { include: { adContact: { select: { vkUserId: true } } } } },
    });
    if (!audience) throw new NotFoundException(`AdAudience ${id} not found`);

    if (audience.kind === 'RETARGET_VK') {
      // Создаём/обновляем VK-сегмент
      const { segmentId } = await this.vkAds.upsertRetargetSegment(audience.key, audience.title);
      await this.prisma.adAudience.update({
        where: { id },
        data: { vkSegmentId: segmentId, lastSyncedAt: new Date() },
      });
      await this.prisma.vkSyncLog.create({
        data: {
          audienceId: id,
          action: 'CREATE',
          request: { key: audience.key, title: audience.title },
          status: process.env.VK_SYNC_ENABLED === 'true' ? 'OK' : 'DRY_RUN',
        },
      });
    }

    if (audience.kind === 'CUSTOM_UPLOAD') {
      const vkIds = audience.memberships.map((m) => m.adContact.vkUserId);
      if (!vkIds.length) { this.logger.warn(`No members for CUSTOM_UPLOAD audience ${id}`); return; }

      const segmentId = audience.vkSegmentId ?? (await this.vkAds.upsertRetargetSegment(audience.key, audience.title)).segmentId;
      const { uploaded } = await this.vkAds.uploadCustomAudience(segmentId, vkIds);

      await this.prisma.adAudience.update({ where: { id }, data: { vkSegmentId: segmentId, lastSyncedAt: new Date() } });
      // Mark memberships synced
      await this.prisma.audienceMembership.updateMany({
        where: { audienceId: id },
        data: { syncedAt: new Date() },
      });
      await this.prisma.vkSyncLog.create({
        data: {
          audienceId: id,
          action: 'UPLOAD',
          request: { segmentId, count: vkIds.length },
          response: { uploaded },
          status: process.env.VK_SYNC_ENABLED === 'true' ? 'OK' : 'DRY_RUN',
        },
      });
    }

    if (audience.kind === 'LAL') {
      const sourceId = audience.vkSegmentId ?? 'unknown';
      const { lalSegmentId } = await this.vkAds.createLookalike(sourceId, `LAL: ${audience.title}`);
      await this.prisma.adAudience.update({
        where: { id },
        data: { vkSegmentId: lalSegmentId, lastSyncedAt: new Date() },
      });
      await this.prisma.vkSyncLog.create({
        data: {
          audienceId: id,
          action: 'LAL',
          request: { sourceId, title: audience.title },
          response: { lalSegmentId },
          status: process.env.VK_SYNC_ENABLED === 'true' ? 'OK' : 'DRY_RUN',
        },
      });
    }

    this.logger.log(`Audience ${id} (${audience.kind}) synced`);
  }

  // Построить LaL-сид из плательщиков — добавить их в CUSTOM_UPLOAD-аудиторию ключом 'payers'.
  async buildPayersSeed(): Promise<number> {
    const payers = await this.prisma.adContact.findMany({
      where: { isPayer: true },
      select: { id: true, vkUserId: true },
    });
    if (!payers.length) return 0;

    let audience = await this.prisma.adAudience.findUnique({ where: { key: 'payers' } });
    if (!audience) {
      audience = await this.prisma.adAudience.create({
        data: { key: 'payers', title: 'Платящие (LaL seed)', kind: 'CUSTOM_UPLOAD', rule: { isPayer: true } },
      });
    }

    for (const p of payers) {
      await this.prisma.audienceMembership.upsert({
        where: { audienceId_adContactId: { audienceId: audience.id, adContactId: p.id } },
        create: { audienceId: audience.id, adContactId: p.id },
        update: {},
      });
    }
    return payers.length;
  }

  async getSyncLogs(audienceId: string, limit = 50) {
    return this.prisma.vkSyncLog.findMany({
      where: { audienceId },
      orderBy: { ts: 'desc' },
      take: limit,
    });
  }
}
