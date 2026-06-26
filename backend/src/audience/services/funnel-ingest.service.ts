import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IngestEventDto } from '../dto/ingest-event.dto';
import { AdFunnelStage } from '@prisma/client';

const PAYER_STAGES = new Set<AdFunnelStage>(['PAYMENT']);
const LEAD_STAGES = new Set<AdFunnelStage>(['LEAD', 'PAYMENT']);
const WRITER_STAGES = new Set<AdFunnelStage>(['FIRST_MESSAGE', 'LEAD', 'PAYMENT']);

@Injectable()
export class FunnelIngestService {
  private readonly logger = new Logger(FunnelIngestService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ingest(dto: IngestEventDto): Promise<{ created: boolean; eventId: string }> {
    // Idempotent: check dedupeKey first
    const existing = await this.prisma.adFunnelEvent.findUnique({
      where: { dedupeKey: dto.dedupeKey },
      select: { id: true },
    });
    if (existing) {
      this.logger.debug(`Duplicate event dedupeKey=${dto.dedupeKey} — skipping`);
      return { created: false, eventId: existing.id };
    }

    const event = await this.prisma.adFunnelEvent.create({
      data: {
        stage: dto.stage,
        source: dto.source,
        vkUserId: dto.vkUserId ?? null,
        campaignId: dto.campaignId ?? null,
        adId: dto.adId ?? null,
        dedupeKey: dto.dedupeKey,
        raw: (dto.raw as any) ?? {},
      },
    });

    // Upsert AdContact if we have identity
    if (dto.vkUserId) {
      await this.upsertContact(dto.vkUserId, dto.stage);
    }

    return { created: true, eventId: event.id };
  }

  async upsertContact(vkUserId: string, stage: AdFunnelStage): Promise<void> {
    await this.prisma.adContact.upsert({
      where: { vkUserId },
      create: {
        vkUserId,
        lastStage: stage,
        lastStageAt: new Date(),
        isWriter: WRITER_STAGES.has(stage),
        isLead: LEAD_STAGES.has(stage),
        isPayer: PAYER_STAGES.has(stage),
      },
      update: {
        lastStage: stage,
        lastStageAt: new Date(),
        isWriter: WRITER_STAGES.has(stage) ? true : undefined,
        isLead: LEAD_STAGES.has(stage) ? true : undefined,
        isPayer: PAYER_STAGES.has(stage) ? true : undefined,
      },
    });
  }

  async getFunnelCounts(from?: string, to?: string) {
    const where: any = {};
    if (from || to) {
      where.ts = {};
      if (from) where.ts.gte = new Date(from);
      if (to) where.ts.lte = new Date(to + 'T23:59:59Z');
    }

    const rows = await this.prisma.adFunnelEvent.groupBy({
      by: ['stage'],
      where,
      _count: { id: true },
    });

    const stageOrder: AdFunnelStage[] = [
      'VIDEO_25', 'VIDEO_50', 'VIDEO_75', 'VIDEO_100',
      'AD_CLICK', 'DIALOG_ALLOWED', 'FIRST_MESSAGE', 'LEAD', 'PAYMENT',
    ];
    const countMap = new Map(rows.map((r) => [r.stage, r._count.id]));

    const stages = stageOrder.map((stage, i) => {
      const count = countMap.get(stage) ?? 0;
      const topCount = countMap.get(stageOrder[0]) ?? 0;
      const prevCount = i > 0 ? (countMap.get(stageOrder[i - 1]) ?? 0) : null;

      return {
        stage,
        count,
        convFromPrev: prevCount !== null && prevCount > 0 ? (count / prevCount) * 100 : null,
        convFromTop: topCount > 0 ? (count / topCount) * 100 : null,
      };
    });

    // Highlight biggest drop
    let biggestDropIdx = -1;
    let biggestDrop = 0;
    for (let i = 1; i < stages.length; i++) {
      const prev = stages[i - 1].count;
      const curr = stages[i].count;
      if (prev > 0 && prev - curr > biggestDrop) {
        biggestDrop = prev - curr;
        biggestDropIdx = i;
      }
    }

    return {
      stages: stages.map((s, i) => ({ ...s, isBiggestDrop: i === biggestDropIdx })),
      total: countMap.get(stageOrder[0]) ?? 0,
    };
  }
}
