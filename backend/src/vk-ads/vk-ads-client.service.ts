/**
 * Адаптер к VK Ads API. Вся специфика VK — только здесь.
 *
 * Новый кабинет (ads.vk.com/api/v2):
 *   - Auth: Authorization: Bearer {token}, account_id в запросах НЕ нужен
 *   - Поле показов: base.shows (не impressions!)
 *   - Расход: base.spent — строка, нужен parseFloat
 *   - Сообщения: base.vk.result (VK-native цель — диалоги/сообщения)
 *   - Трюк с датой: date_from=вчера, date_to=сегодня (иначе WRONG_DATE)
 *
 * Кеш кампаний: список кампаний запрашивается раз в 6 часов, не каждый poll.
 * Это критично — при 7000+ кампаний список занимает ~30 запросов к API.
 *
 * Старый кабинет (vk.com):
 *   - ads.getStatistics, поле message_sends / message_enters
 *   - Требует VK_ACCOUNT_ID
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface StatRecord {
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
}

const CHUNK_SIZE = 100;
const PAGE_SIZE = 250;
const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const CAMPAIGN_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 часов

@Injectable()
export class VkAdsClientService {
  private readonly logger = new Logger(VkAdsClientService.name);
  private readonly http: AxiosInstance;
  private readonly platform: string;
  private readonly token: string;
  private readonly accountId: string;

  // Кеш кампаний: {id → name}, обновляется раз в 6 ч
  private campaignCache: Record<string, string> = {};
  private campaignCacheUpdatedAt = 0;

  constructor(private readonly config: ConfigService) {
    this.token = config.get<string>('VK_ACCESS_TOKEN', '');
    this.platform = config.get<string>('VK_API_PLATFORM', 'new');
    this.accountId = config.get<string>('VK_ACCOUNT_ID', '');

    if (this.platform === 'old') {
      this.http = axios.create({ baseURL: 'https://api.vk.com/method', timeout: 30_000 });
    } else {
      this.http = axios.create({
        baseURL: 'https://ads.vk.com/api/v2',
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 30_000,
      });
    }
  }

  async getStatistics(forDate: Date): Promise<StatRecord[]> {
    if (!this.token) {
      this.logger.warn('VK_ACCESS_TOKEN not set — skipping poll');
      return [];
    }
    return this.platform === 'old'
      ? this.getStatisticsOld(forDate)
      : this.getStatisticsNew(forDate);
  }

  // ─── Новый кабинет (ads.vk.com) ──────────────────────────────────────────

  private async getStatisticsNew(forDate: Date): Promise<StatRecord[]> {
    const mskDate = new Date(forDate.getTime() + MSK_OFFSET_MS);
    const dateStr = mskDate.toISOString().slice(0, 10);
    const prevDate = new Date(mskDate.getTime() - 86_400_000).toISOString().slice(0, 10);

    const names = await this.getCampaignsCached();
    const ids = Object.keys(names);
    if (ids.length === 0) {
      this.logger.warn('No campaigns in cache');
      return [];
    }

    this.logger.log('Fetching stats for %d campaigns (%d chunks)', ids.length, Math.ceil(ids.length / CHUNK_SIZE));
    const records: StatRecord[] = [];

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      try {
        const params: Record<string, string | string[]> = {
          date_from: prevDate,
          date_to: dateStr,
          'id[]': chunk,
        };

        const data = await this.retry(() =>
          this.http.get('/statistics/campaigns/day.json', { params }).then((r) => r.data),
        );

        if (data.error) {
          this.logger.error('VK API error: %j', data.error);
          continue;
        }

        for (const item of data.items ?? []) {
          const oid = String(item.id ?? '');
          for (const row of item.rows ?? []) {
            if (row.date !== dateStr) continue;
            const base = row.base ?? {};
            const spend = parseFloat(String(base.spent ?? '0')) || 0;
            if (spend === 0 && !base.shows) continue; // пропускаем нулевые записи
            records.push({
              campaignId: oid,
              campaignName: names[oid] ?? oid,
              impressions: Number(base.shows ?? 0),
              clicks: Number(base.clicks ?? 0),
              spend,
              leads: Number((base.vk ?? {}).result ?? 0),
            });
          }
        }

        if (i + CHUNK_SIZE < ids.length) await this.sleep(1000);
      } catch (err: any) {
        this.logger.error('Stats fetch failed for chunk %d: %s', i / CHUNK_SIZE + 1, err.message);
      }
    }

    this.logger.log('Stats fetched: %d active campaigns out of %d', records.length, ids.length);
    return records;
  }

  // Кешированный список кампаний: обновляется раз в 6 часов
  private async getCampaignsCached(): Promise<Record<string, string>> {
    const age = Date.now() - this.campaignCacheUpdatedAt;
    if (age < CAMPAIGN_CACHE_TTL_MS && Object.keys(this.campaignCache).length > 0) {
      this.logger.debug('Using campaign cache (%d campaigns, age %dm)', Object.keys(this.campaignCache).length, Math.round(age / 60_000));
      return this.campaignCache;
    }
    this.campaignCache = await this.listCampaignsNew();
    this.campaignCacheUpdatedAt = Date.now();
    return this.campaignCache;
  }

  private async listCampaignsNew(): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    let offset = 0;

    while (true) {
      const data = await this.retry(() =>
        this.http.get('/campaigns.json', { params: { limit: PAGE_SIZE, offset } }).then((r) => r.data),
      );

      for (const item of data.items ?? []) {
        if (!item.is_deleted) result[String(item.id)] = item.name ?? String(item.id);
      }

      const total = Number(data.count ?? 0);
      offset += PAGE_SIZE;
      if (offset >= total) break;
      await this.sleep(300);
    }

    this.logger.log('Campaigns listed: %d total', Object.keys(result).length);
    return result;
  }

  // ─── Старый кабинет (vk.com) ─────────────────────────────────────────────

  private async getStatisticsOld(forDate: Date): Promise<StatRecord[]> {
    const mskDate = new Date(forDate.getTime() + MSK_OFFSET_MS);
    const d = mskDate.toISOString().slice(0, 10);
    const dateStr = d.split('-').reverse().join('.'); // DD.MM.YYYY

    const campaigns = await this.retry(() =>
      this.http
        .get('/ads.getCampaigns', {
          params: { access_token: this.token, v: '5.131', account_id: this.accountId },
        })
        .then((r) => r.data.response ?? []),
    );

    const idMap: Record<string, string> = {};
    for (const c of campaigns) {
      if (!c.is_deleted) idMap[String(c.id)] = c.name ?? String(c.id);
    }

    const ids = Object.keys(idMap);
    const records: StatRecord[] = [];

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      await this.sleep(400);

      const raw = await this.retry(() =>
        this.http
          .get('/ads.getStatistics', {
            params: {
              access_token: this.token,
              v: '5.131',
              account_id: this.accountId,
              ids_type: 'campaign',
              ids: chunk.join(','),
              period: 'day',
              date_from: dateStr,
              date_to: dateStr,
            },
          })
          .then((r) => r.data.response ?? []),
      );

      for (const item of raw) {
        const oid = String(item.id);
        for (const s of item.stats ?? []) {
          records.push({
            campaignId: oid,
            campaignName: idMap[oid] ?? oid,
            impressions: Number(s.impressions ?? 0),
            clicks: Number(s.clicks ?? 0),
            spend: parseFloat(String(s.spent ?? '0')) || 0,
            leads: Number(s.message_sends ?? s.message_enters ?? 0),
          });
        }
      }
    }

    return records;
  }

  // ─── Утилиты ─────────────────────────────────────────────────────────────

  private async retry<T>(fn: () => Promise<T>, retries = 4, baseDelay = 3000): Promise<T> {
    let delay = baseDelay;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        if (attempt === retries) throw err;
        // 429 — VK rate limit: ждём дольше чем обычно
        const is429 = err?.response?.status === 429;
        const waitMs = is429 ? 15_000 : delay;
        this.logger.warn('Retry %d/%d after %dms: %s', attempt + 1, retries, waitMs, err.message);
        await this.sleep(waitMs);
        delay *= 2;
      }
    }
    throw new Error('retry exhausted');
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
