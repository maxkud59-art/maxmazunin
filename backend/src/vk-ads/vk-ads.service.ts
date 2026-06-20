import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VkAdsClientService, VkAuthError } from './vk-ads-client.service';
import { VkCabinetDto } from './dto/cabinet.dto';
import { HourlyStatDto } from './dto/hourly.dto';
import { HourProfileItemDto } from './dto/hour-profile.dto';
import { PollResultDto } from './dto/poll.dto';

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3, без DST

@Injectable()
export class VkAdsService {
  private readonly logger = new Logger(VkAdsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vkClient: VkAdsClientService,
  ) {}

  // ─── Кабинеты ─────────────────────────────────────────────────────────────

  async getCabinets(): Promise<VkCabinetDto[]> {
    const rows = await this.prisma.vkCabinet.findMany({ orderBy: { title: 'asc' } });
    return rows.map((c) => ({ id: c.id, title: c.title, externalAccountId: c.externalAccountId, isActive: c.isActive }));
  }

  // ─── Поллинг ──────────────────────────────────────────────────────────────

  async pollSnapshots(cabinetId?: string): Promise<PollResultDto[]> {
    const where = cabinetId ? { id: cabinetId, isActive: true } : { isActive: true };
    const cabinets = await this.prisma.vkCabinet.findMany({ where });

    const results: PollResultDto[] = [];

    for (const cabinet of cabinets) {
      const capturedAt = new Date();
      try {
        const records = await this.vkClient.getStatistics(capturedAt);

        // Batch insert
        await this.prisma.adSnapshot.createMany({
          data: records.map((r) => ({
            capturedAt,
            cabinetId: cabinet.id,
            campaignId: r.campaignId,
            campaignName: r.campaignName,
            impressions: r.impressions,
            clicks: r.clicks,
            spend: r.spend,
            leads: r.leads,
            isPreliminary: true,
          })),
        });

        this.logger.log(
          `Poll "${cabinet.title}": ${records.length} кампаний → ${capturedAt.toISOString()}`,
        );

        results.push({ cabinetId: cabinet.id, snapshots: records.length, campaigns: records.length, capturedAt: capturedAt.toISOString() });
      } catch (err: any) {
        if (err instanceof VkAuthError) {
          this.logger.error(`Poll "${cabinet.title}" ТОКЕН НЕДЕЙСТВИТЕЛЕН: ${err.message}`);
        } else {
          this.logger.error(`Poll "${cabinet.title}" failed: ${err.message}`);
        }
      }
    }

    return results;
  }

  async checkTokenHealth(): Promise<{ ok: boolean; message: string }> {
    return this.vkClient.checkTokenHealth();
  }

  // ─── Роллап HourlyStat ────────────────────────────────────────────────────

  /**
   * Пересчитать дельты за последние `hours` часов для всех активных кабинетов.
   * Вызывается кроном раз в час и при ручном poll.
   */
  async computeRollupForLastHours(hours = 2): Promise<void> {
    const now = new Date();
    const cabinets = await this.prisma.vkCabinet.findMany({ where: { isActive: true } });

    for (const cabinet of cabinets) {
      for (let h = hours; h >= 0; h--) {
        const hourStart = new Date(now);
        hourStart.setUTCMinutes(0, 0, 0);
        hourStart.setTime(hourStart.getTime() - h * 3_600_000);
        try {
          const n = await this.computeHourForCabinet(cabinet.id, hourStart);
          if (n > 0) this.logger.debug(`Rollup "${cabinet.title}" ${hourStart.toISOString()}: ${n} кампаний`);
        } catch (err: any) {
          this.logger.error(`Rollup "${cabinet.title}" ${hourStart.toISOString()}: ${err.message}`);
        }
      }
    }
  }

  private async computeHourForCabinet(cabinetId: string, hourStartUtc: Date): Promise<number> {
    const hourEndUtc = new Date(hourStartUtc.getTime() + 3_600_000);

    // Кампании, у которых есть снимки вблизи этого часа
    const campaigns = await this.prisma.adSnapshot.findMany({
      where: {
        cabinetId,
        capturedAt: {
          gte: new Date(hourStartUtc.getTime() - 3_600_000),
          lt: new Date(hourEndUtc.getTime() + 3_600_000),
        },
      },
      select: { campaignId: true, campaignName: true },
      distinct: ['campaignId'],
    });

    const now = new Date();
    // Данные за последние 2 часа помечаем предварительными
    const isPreliminary = hourEndUtc > new Date(now.getTime() - 2 * 3_600_000);

    let processed = 0;

    for (const { campaignId, campaignName } of campaigns) {
      // Базовый снимок: последний ДО начала часа (может быть из предыдущего часа/дня)
      const baseline = await this.prisma.adSnapshot.findFirst({
        where: { cabinetId, campaignId, capturedAt: { lt: hourStartUtc } },
        orderBy: { capturedAt: 'desc' },
      });

      // Конечный снимок: последний ВНУТРИ часа [hourStart, hourEnd)
      const end = await this.prisma.adSnapshot.findFirst({
        where: { cabinetId, campaignId, capturedAt: { gte: hourStartUtc, lt: hourEndUtc } },
        orderBy: { capturedAt: 'desc' },
      });

      if (!end) continue; // Нет данных за этот час

      const baseSpend = baseline?.spend ?? 0;
      const baseImpr = baseline?.impressions ?? 0;
      const baseClicks = baseline?.clicks ?? 0;
      const baseLeads = baseline?.leads ?? 0;

      // Если расход упал — это новый МСК-день (VK обнулил счётчики)
      const isMidnightReset = end.spend < baseSpend;

      const spendDelta = Math.max(0, isMidnightReset ? end.spend : end.spend - baseSpend);
      const impressionsDelta = Math.max(0, isMidnightReset ? end.impressions : end.impressions - baseImpr);
      const clicksDelta = Math.max(0, isMidnightReset ? end.clicks : end.clicks - baseClicks);
      const leadsDelta = Math.max(0, isMidnightReset ? end.leads : end.leads - baseLeads);

      const cpm = impressionsDelta > 0 ? (spendDelta / impressionsDelta) * 1000 : null;
      const cpc = clicksDelta > 0 ? spendDelta / clicksDelta : null;
      const cpl = leadsDelta > 0 ? spendDelta / leadsDelta : null;

      await this.prisma.hourlyStat.upsert({
        where: { cabinetId_campaignId_hourStartUtc: { cabinetId, campaignId, hourStartUtc } },
        create: { hourStartUtc, cabinetId, campaignId, campaignName, impressionsDelta, clicksDelta, spendDelta, leadsDelta, cpm, cpc, cpl, isPreliminary },
        update: { impressionsDelta, clicksDelta, spendDelta, leadsDelta, cpm, cpc, cpl, isPreliminary, campaignName },
      });

      processed++;
    }

    return processed;
  }

  // ─── Почасовые метрики за день ────────────────────────────────────────────

  async getHourly(cabinetId: string, dateMsk: string): Promise<HourlyStatDto[]> {
    // dateMsk = 'YYYY-MM-DD' (дата по МСК)
    // МСК-полночь = UTC-полночь минус 3 ч => UTC 21:00 предыдущего дня
    const [y, m, d] = dateMsk.split('-').map(Number);
    const mskMidnight = Date.UTC(y, m - 1, d, 0, 0, 0); // мс
    const dayStartUtc = new Date(mskMidnight - MSK_OFFSET_MS); // 21:00 UTC предыдущего дня
    const dayEndUtc = new Date(dayStartUtc.getTime() + 86_400_000);

    const rows = await this.prisma.hourlyStat.findMany({
      where: { cabinetId, hourStartUtc: { gte: dayStartUtc, lt: dayEndUtc } },
    });

    // Агрегируем кампании в один показатель за час
    type Agg = { impr: number; clicks: number; spend: number; leads: number; preliminary: boolean };
    const byHour = new Map<string, Agg>();

    for (const r of rows) {
      const key = r.hourStartUtc.toISOString();
      const prev = byHour.get(key) ?? { impr: 0, clicks: 0, spend: 0, leads: 0, preliminary: false };
      byHour.set(key, {
        impr: prev.impr + r.impressionsDelta,
        clicks: prev.clicks + r.clicksDelta,
        spend: prev.spend + r.spendDelta,
        leads: prev.leads + r.leadsDelta,
        preliminary: prev.preliminary || r.isPreliminary,
      });
    }

    const result: HourlyStatDto[] = [];

    for (let h = 0; h < 24; h++) {
      const hourStartUtc = new Date(dayStartUtc.getTime() + h * 3_600_000);
      const hourMsk = (hourStartUtc.getUTCHours() + 3) % 24;
      const agg = byHour.get(hourStartUtc.toISOString());

      if (!agg) {
        result.push({ hourMsk, hourStartUtc: hourStartUtc.toISOString(), impressionsDelta: 0, clicksDelta: 0, spendDelta: 0, leadsDelta: 0, cpm: null, cpc: null, cpl: null, isPreliminary: false, hasData: false });
        continue;
      }

      result.push({
        hourMsk,
        hourStartUtc: hourStartUtc.toISOString(),
        impressionsDelta: agg.impr,
        clicksDelta: agg.clicks,
        spendDelta: agg.spend,
        leadsDelta: agg.leads,
        cpm: agg.impr > 0 ? (agg.spend / agg.impr) * 1000 : null,
        cpc: agg.clicks > 0 ? agg.spend / agg.clicks : null,
        cpl: agg.leads > 0 ? agg.spend / agg.leads : null,
        isPreliminary: agg.preliminary,
        hasData: true,
      });
    }

    return result;
  }

  // ─── Профиль часа суток за период ─────────────────────────────────────────

  async getHourProfile(cabinetId: string, fromMsk: string, toMsk: string): Promise<HourProfileItemDto[]> {
    const parseMsk = (s: string, isEnd = false) => {
      const [y, m, d] = s.split('-').map(Number);
      const mskMidnight = Date.UTC(y, m - 1, d, 0, 0, 0);
      const utc = new Date(mskMidnight - MSK_OFFSET_MS);
      return isEnd ? new Date(utc.getTime() + 86_400_000) : utc;
    };

    const rows = await this.prisma.hourlyStat.findMany({
      where: {
        cabinetId,
        hourStartUtc: { gte: parseMsk(fromMsk), lt: parseMsk(toMsk, true) },
        isPreliminary: false,
      },
      select: { hourStartUtc: true, spendDelta: true, leadsDelta: true, impressionsDelta: true, clicksDelta: true },
    });

    // Группируем: mskHour → Map<dayStr, {spend,leads,impr,clicks}>
    type DayAgg = { spend: number; leads: number; impr: number; clicks: number };
    const hourDays: Map<string, DayAgg>[] = Array.from({ length: 24 }, () => new Map());

    for (const r of rows) {
      const mskHour = (r.hourStartUtc.getUTCHours() + 3) % 24;
      const dayStr = new Date(r.hourStartUtc.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);
      const prev = hourDays[mskHour].get(dayStr) ?? { spend: 0, leads: 0, impr: 0, clicks: 0 };
      hourDays[mskHour].set(dayStr, {
        spend: prev.spend + r.spendDelta,
        leads: prev.leads + r.leadsDelta,
        impr: prev.impr + r.impressionsDelta,
        clicks: prev.clicks + r.clicksDelta,
      });
    }

    return Array.from({ length: 24 }, (_, h) => {
      const days = hourDays[h];
      let totalSpend = 0, totalLeads = 0, totalImpressions = 0, totalClicks = 0;
      for (const agg of days.values()) {
        totalSpend += agg.spend;
        totalLeads += agg.leads;
        totalImpressions += agg.impr;
        totalClicks += agg.clicks;
      }
      return {
        hourMsk: h,
        totalSpend,
        totalLeads,
        totalImpressions,
        totalClicks,
        avgCpl: totalLeads > 0 ? totalSpend / totalLeads : null,
        avgCpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : null,
        avgCpc: totalClicks > 0 ? totalSpend / totalClicks : null,
        daysCount: days.size,
      };
    });
  }
}
