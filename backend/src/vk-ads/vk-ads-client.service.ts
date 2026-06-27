/**
 * Адаптер к VK Ads API. Вся специфика VK — только здесь.
 *
 * Новый кабинет (ads.vk.com/api/v2):
 *   - Auth: Authorization: Bearer {token}, нужен токен с правом ads (VK_ADS_TOKEN)
 *   - Поле показов: base.shows (не impressions!)
 *   - Расход: base.spent — строка, нужен parseFloat
 *   - Сообщения: base.vk.result (VK-native цель — диалоги/сообщения)
 *   - Трюк с датой: date_from=вчера, date_to=сегодня (иначе WRONG_DATE)
 *
 * ВАЖНО: для VK Ads нужен ОТДЕЛЬНЫЙ токен с правом ads.
 * VK_ADS_TOKEN — токен рекламного кабинета (ads.vk.com).
 * VK_GROUP_TOKEN — токен сообщества с правом messages (для мессенджера/рассылок).
 * Это разные токены, нельзя их перепутать!
 *
 * Кеш кампаний: список кампаний запрашивается раз в 6 часов, не каждый poll.
 * Это критично — при 7000+ кампаний список занимает ~30 запросов к API.
 *
 * Старый кабинет (vk.com):
 *   - ads.getStatistics, поле message_sends / message_enters
 *   - Требует VK_ACCOUNT_ID или cabinet.externalAccountId
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

// Thrown when VK returns an auth error (expired/invalid token) — not retried.
export class VkAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VkAuthError';
  }
}

// VK new-platform error codes that mean "token is bad"
const VK_AUTH_CODES = new Set(['UNAUTHORIZED', 'ACCESS_DENIED', 'FORBIDDEN', 'AUTHENTICATION_FAILED']);
// VK old-platform error codes: 5 = invalid token, 15 = access denied
const VK_OLD_AUTH_CODES = new Set([5, 15]);

export interface StatRecord {
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  spend: number;
  leads: number;
}

export interface VkAdAccount {
  id: string;
  name: string;
  type?: string; // 'agency' | 'advertiser' etc
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
  readonly token: string;
  private readonly accountId: string;

  // Кеш кампаний per account: {accountId → {campaignId → name}}, обновляется раз в 6 ч
  private campaignCacheByAccount: Map<string, { data: Record<string, string>; updatedAt: number }> = new Map();

  constructor(private readonly config: ConfigService) {
    // VK_ADS_TOKEN — новая переменная для токена рекламного кабинета.
    // Для обратной совместимости читаем VK_ACCESS_TOKEN если VK_ADS_TOKEN не задан.
    this.token = config.get<string>('VK_ADS_TOKEN', '') || config.get<string>('VK_ACCESS_TOKEN', '');
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

  /** Загружает список доступных рекламных аккаунтов для текущего токена. */
  async listAccounts(): Promise<VkAdAccount[]> {
    if (!this.token) return [];
    try {
      if (this.platform === 'old') {
        return await this.listAccountsOld();
      } else {
        return await this.listAccountsNew();
      }
    } catch (err: any) {
      if (err instanceof VkAuthError) throw err;
      this.logger.error('listAccounts failed: %s', err.message);
      throw err;
    }
  }

  private async listAccountsNew(): Promise<VkAdAccount[]> {
    const data = await this.retry(() =>
      this.http.get('/accounts.json').then((r) => r.data),
    );

    const errors: any[] = data?.errors ?? (data?.error ? [data.error] : []);
    if (errors.length) {
      const authErr = errors.find((e: any) => VK_AUTH_CODES.has(String(e.code ?? '').toUpperCase()));
      if (authErr) throw new VkAuthError(`VK-токен недействителен или не имеет права ads (${authErr.code}): ${authErr.title ?? ''}`);
      throw new Error(`VK API ошибка: ${JSON.stringify(errors[0])}`);
    }

    const items: any[] = data?.items ?? [];
    return items.map((a: any) => ({
      id: String(a.id),
      name: a.name ?? String(a.id),
      type: a.type,
    }));
  }

  private async listAccountsOld(): Promise<VkAdAccount[]> {
    const data = await this.retry(() =>
      this.http.get('/ads.getAccounts', {
        params: { access_token: this.token, v: '5.131' },
      }).then((r) => r.data),
    );

    if (data?.error) {
      const code = Number(data.error.error_code);
      if (VK_OLD_AUTH_CODES.has(code)) throw new VkAuthError(`VK-токен недействителен (код ${code}): ${data.error.error_msg ?? ''}`);
      throw new Error(`VK API ошибка: ${data.error.error_msg ?? JSON.stringify(data.error)}`);
    }

    const accounts: any[] = data?.response ?? [];
    return accounts.map((a: any) => ({
      id: String(a.account_id),
      name: a.account_name ?? String(a.account_id),
      type: a.account_type,
    }));
  }

  async getStatistics(forDate: Date, accountId?: string): Promise<StatRecord[]> {
    if (!this.token) {
      this.logger.warn('VK_ADS_TOKEN not set — skipping poll');
      return [];
    }
    return this.platform === 'old'
      ? this.getStatisticsOld(forDate, accountId)
      : this.getStatisticsNew(forDate, accountId);
  }

  // ─── Новый кабинет (ads.vk.com) ──────────────────────────────────────────

  private async getStatisticsNew(forDate: Date, accountId?: string): Promise<StatRecord[]> {
    const mskDate = new Date(forDate.getTime() + MSK_OFFSET_MS);
    const dateStr = mskDate.toISOString().slice(0, 10);
    const prevDate = new Date(mskDate.getTime() - 86_400_000).toISOString().slice(0, 10);

    const names = await this.getCampaignsCached(accountId);
    const ids = Object.keys(names);
    if (ids.length === 0) {
      this.logger.warn('No campaigns in cache (accountId=%s)', accountId ?? 'all');
      return [];
    }

    this.logger.log('Fetching stats for %d campaigns (%d chunks, account=%s)', ids.length, Math.ceil(ids.length / CHUNK_SIZE), accountId ?? 'all');
    const records: StatRecord[] = [];

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      try {
        const params: Record<string, string | string[]> = {
          date_from: prevDate,
          date_to: dateStr,
          'id[]': chunk,
        };
        if (accountId) params.account_id = accountId;

        const data = await this.retry(() =>
          this.http.get('/statistics/campaigns/day.json', { params }).then((r) => r.data),
        );

        if (data.error) {
          const errCode = String(data.error?.code ?? '').toUpperCase();
          if (VK_AUTH_CODES.has(errCode)) {
            throw new VkAuthError(`Токен VK недействителен или истёк (${data.error.code})`);
          }
          const errors: any[] = data.errors ?? (data.error ? [data.error] : []);
          const authErr = errors.find((e: any) => VK_AUTH_CODES.has(String(e.code ?? '').toUpperCase()));
          if (authErr) throw new VkAuthError(`Токен VK недействителен или истёк (${authErr.code})`);
          this.logger.error('VK API error: %j', data.error);
          continue;
        }
        const topErrors: any[] = data.errors ?? [];
        if (topErrors.length) {
          const authErr = topErrors.find((e: any) => VK_AUTH_CODES.has(String(e.code ?? '').toUpperCase()));
          if (authErr) throw new VkAuthError(`Токен VK недействителен или истёк (${authErr.code})`);
          this.logger.error('VK API errors: %j', topErrors);
          continue;
        }

        for (const item of data.items ?? []) {
          const oid = String(item.id ?? '');
          for (const row of item.rows ?? []) {
            if (row.date !== dateStr) continue;
            const base = row.base ?? {};
            const spend = parseFloat(String(base.spent ?? '0')) || 0;
            if (spend === 0 && !base.shows) continue;
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
        if (err instanceof VkAuthError) throw err;
        this.logger.error('Stats fetch failed for chunk %d: %s', i / CHUNK_SIZE + 1, err.message);
      }
    }

    this.logger.log('Stats fetched: %d active campaigns out of %d', records.length, ids.length);
    return records;
  }

  private async getCampaignsCached(accountId?: string): Promise<Record<string, string>> {
    const key = accountId ?? '__all__';
    const entry = this.campaignCacheByAccount.get(key);
    const age = entry ? Date.now() - entry.updatedAt : Infinity;

    if (age < CAMPAIGN_CACHE_TTL_MS && entry && Object.keys(entry.data).length > 0) {
      this.logger.debug('Using campaign cache for account=%s (%d campaigns, age %dm)', key, Object.keys(entry.data).length, Math.round(age / 60_000));
      return entry.data;
    }

    const data = await this.listCampaignsNew(accountId);
    this.campaignCacheByAccount.set(key, { data, updatedAt: Date.now() });
    return data;
  }

  private async listCampaignsNew(accountId?: string): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    let offset = 0;

    while (true) {
      const params: Record<string, any> = { limit: PAGE_SIZE, offset };
      if (accountId) params.account_id = accountId;

      const data = await this.retry(() =>
        this.http.get('/campaigns.json', { params }).then((r) => r.data),
      );

      for (const item of data.items ?? []) {
        if (!item.is_deleted) result[String(item.id)] = item.name ?? String(item.id);
      }

      const total = Number(data.count ?? 0);
      offset += PAGE_SIZE;
      if (offset >= total) break;
      await this.sleep(300);
    }

    this.logger.log('Campaigns listed: %d total (account=%s)', Object.keys(result).length, accountId ?? 'all');
    return result;
  }

  // ─── Старый кабинет (vk.com) ─────────────────────────────────────────────

  private async getStatisticsOld(forDate: Date, accountId?: string): Promise<StatRecord[]> {
    const effectiveAccountId = accountId ?? this.accountId;
    if (!effectiveAccountId) {
      this.logger.warn('No account_id for old platform — skipping poll');
      return [];
    }

    const mskDate = new Date(forDate.getTime() + MSK_OFFSET_MS);
    const d = mskDate.toISOString().slice(0, 10);
    const dateStr = d.split('-').reverse().join('.'); // DD.MM.YYYY

    const campaigns = await this.retry(() =>
      this.http
        .get('/ads.getCampaigns', {
          params: { access_token: this.token, v: '5.131', account_id: effectiveAccountId },
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
              account_id: effectiveAccountId,
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
        if (err instanceof VkAuthError) throw err;
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          throw new VkAuthError(`VK вернул HTTP ${err.response.status} — токен недействителен или истёк`);
        }
        if (attempt === retries) throw err;
        const is429 = err?.response?.status === 429;
        const waitMs = is429 ? 15_000 : delay;
        this.logger.warn('Retry %d/%d after %dms: %s', attempt + 1, retries, waitMs, err.message);
        await this.sleep(waitMs);
        delay *= 2;
      }
    }
    throw new Error('retry exhausted');
  }

  /** Проверить токен: вызывает listAccounts() и анализирует ответ. */
  async checkTokenHealth(): Promise<{ ok: boolean; message: string }> {
    if (!this.token) {
      return { ok: false, message: 'VK_ADS_TOKEN не задан в .env — рекламная статистика недоступна' };
    }
    try {
      const accounts = await this.listAccounts();
      if (accounts.length === 0) {
        return {
          ok: false,
          message: 'Токен действителен, но доступных рекламных аккаунтов не найдено. Убедитесь, что токен имеет право ads и аккаунт активен.',
        };
      }
      return { ok: true, message: `Токен действителен. Доступно аккаунтов: ${accounts.length}` };
    } catch (err: any) {
      if (err instanceof VkAuthError) return { ok: false, message: err.message };
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        return { ok: false, message: `Токен VK недействителен или истёк (HTTP ${err.response.status}). Для VK Ads нужен токен с правом ads.` };
      }
      return { ok: false, message: `Ошибка подключения к VK: ${err.message}` };
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
