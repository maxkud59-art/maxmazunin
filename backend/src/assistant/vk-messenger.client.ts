/**
 * Адаптер к VK Messages API (community token).
 * Вся специфика VK — только здесь.
 *
 * Токен — community access token с правом messages.
 * Группа обращается к API как: access_token=<group_token>&group_id=<id>
 * API version: v=5.199
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export class VkGroupAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VkGroupAuthError';
  }
}

export interface VkProfile {
  id: number;
  firstName: string;
  lastName: string;
  photo: string;
  city?: string;
}

export interface VkConvItem {
  peerId: number;
  peerType: string;
  lastMessageId: number;
  lastMessageText: string;
  lastMessageDate: number;
  lastMessageFromId: number;
  unreadCount: number;
  clientName: string;
  clientAvatar: string;
}

export interface VkMessageItem {
  id: number;
  fromId: number;
  text: string;
  date: number;
  attachments: any[];
  isOut: boolean;
}

const VK_API = 'https://api.vk.com/method';
const V = '5.199';

@Injectable()
export class VkMessengerClient {
  private readonly logger = new Logger(VkMessengerClient.name);
  private readonly http: AxiosInstance;
  readonly token: string;
  readonly groupId: number;

  constructor(private readonly config: ConfigService) {
    this.token = config.get<string>('VK_GROUP_TOKEN', '');
    this.groupId = Number(config.get<string>('VK_GROUP_ID', '0'));
    this.http = axios.create({ baseURL: VK_API, timeout: 30_000 });
  }

  get configured(): boolean {
    return !!this.token && !!this.groupId;
  }

  /** Проверить валидность токена */
  async checkTokenHealth(): Promise<{ ok: boolean; message: string }> {
    if (!this.configured) {
      return { ok: false, message: 'VK_GROUP_TOKEN или VK_GROUP_ID не заданы в .env' };
    }
    try {
      const data = await this.call('groups.getById', {});
      if (data.error) {
        return { ok: false, message: `VK: ${data.error.error_msg ?? JSON.stringify(data.error)}` };
      }
      const group = data.response?.groups?.[0];
      return { ok: true, message: `Токен действителен. Группа: ${group?.name ?? '?'}` };
    } catch (err: any) {
      if (err instanceof VkGroupAuthError) return { ok: false, message: err.message };
      return { ok: false, message: `Ошибка VK: ${err.message}` };
    }
  }

  /** Список диалогов сообщества (extended=1 → profiles в ответе) */
  async getConversations(offset = 0, count = 200): Promise<{
    total: number;
    items: VkConvItem[];
    profiles: Record<number, VkProfile>;
  }> {
    const data = await this.retry(() =>
      this.call('messages.getConversations', { group_id: this.groupId, offset, count, extended: 1 }),
    );

    const profiles: Record<number, VkProfile> = {};
    for (const p of data.response?.profiles ?? []) {
      profiles[p.id] = {
        id: p.id,
        firstName: p.first_name ?? '',
        lastName: p.last_name ?? '',
        photo: p.photo_100 ?? p.photo_50 ?? '',
        city: p.city?.title,
      };
    }

    const items: VkConvItem[] = [];
    for (const item of data.response?.items ?? []) {
      const conv = item.conversation ?? {};
      const peer = conv.peer ?? {};
      const msg = item.last_message ?? {};
      const peerId: number = peer.id;

      let clientName = `Пользователь ${peerId}`;
      let clientAvatar = '';
      if (peer.type === 'user' && profiles[peerId]) {
        const pr = profiles[peerId];
        clientName = `${pr.firstName} ${pr.lastName}`.trim();
        clientAvatar = pr.photo;
      }

      items.push({
        peerId,
        peerType: peer.type ?? 'user',
        lastMessageId: msg.id ?? 0,
        lastMessageText: msg.text ?? '',
        lastMessageDate: msg.date ?? 0,
        lastMessageFromId: msg.from_id ?? 0,
        unreadCount: conv.unread_count ?? 0,
        clientName,
        clientAvatar,
      });
    }

    return { total: data.response?.count ?? 0, items, profiles };
  }

  /** История сообщений диалога */
  async getHistory(peerId: number, count = 50, startMessageId?: number): Promise<VkMessageItem[]> {
    const params: Record<string, any> = {
      group_id: this.groupId,
      peer_id: peerId,
      count,
      rev: 0, // newest first from VK, we reverse in service
      extended: 0,
    };
    if (startMessageId) params.start_message_id = startMessageId;

    const data = await this.retry(() => this.call('messages.getHistory', params));
    const groupFromId = -this.groupId;

    return (data.response?.items ?? []).map((m: any) => ({
      id: m.id,
      fromId: m.from_id,
      text: m.text ?? '',
      date: m.date,
      attachments: m.attachments ?? [],
      isOut: m.from_id === groupFromId,
    }));
  }

  /** Отправить сообщение в диалог */
  async sendMessage(peerId: number, text: string): Promise<number> {
    const randomId = Math.floor(Math.random() * 2_000_000_000);
    const data = await this.retry(() =>
      this.call('messages.send', {
        group_id: this.groupId,
        peer_id: peerId,
        message: text,
        random_id: randomId,
      }),
    );
    if (data.error) throw new Error(`VK send error: ${data.error.error_msg ?? JSON.stringify(data.error)}`);
    return typeof data.response === 'number' ? data.response : 0;
  }

  /** Получить профили пользователей */
  async getProfiles(userIds: number[]): Promise<Record<number, VkProfile>> {
    if (!userIds.length) return {};
    const data = await this.retry(() =>
      this.call('users.get', { user_ids: userIds.join(','), fields: 'photo_100,city' }),
    );
    const result: Record<number, VkProfile> = {};
    for (const p of data.response ?? []) {
      result[p.id] = {
        id: p.id,
        firstName: p.first_name ?? '',
        lastName: p.last_name ?? '',
        photo: p.photo_100 ?? '',
        city: p.city?.title,
      };
    }
    return result;
  }

  // ─── Утилиты ─────────────────────────────────────────────────────────────────

  private async call(method: string, params: Record<string, any>): Promise<any> {
    const res = await this.http.get(`/${method}`, {
      params: { ...params, v: V, access_token: this.token },
    });
    const data = res.data;
    if (data?.error?.error_code === 5 || data?.error?.error_code === 15) {
      throw new VkGroupAuthError(`VK токен сообщества недействителен (код ${data.error.error_code}): ${data.error.error_msg ?? ''}`);
    }
    return data;
  }

  private async retry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
    let delay = 2000;
    for (let i = 0; i <= retries; i++) {
      try {
        return await fn();
      } catch (err: any) {
        if (err instanceof VkGroupAuthError) throw err;
        if (err?.response?.status === 401 || err?.response?.status === 403) {
          throw new VkGroupAuthError(`VK HTTP ${err.response.status} — токен сообщества недействителен`);
        }
        if (i === retries) throw err;
        const wait = err?.response?.status === 429 ? 15_000 : delay;
        this.logger.warn('VK retry %d/%d after %dms: %s', i + 1, retries, wait, err.message);
        await new Promise((r) => setTimeout(r, wait));
        delay *= 2;
      }
    }
    throw new Error('retry exhausted');
  }

  sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
