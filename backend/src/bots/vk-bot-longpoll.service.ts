/**
 * VK Groups Long Poll listener.
 * Docs: https://dev.vk.com/ru/api/bots-long-poll/getting-started
 * Events: message_new, message_event, message_allow, message_deny
 * API: groups.getLongPollServer → poll {server}?act=a_check&key={key}&ts={ts}&wait=25
 *
 * Throttle: VK allows max 20 requests/sec per token — we send 1 message at a time, so fine.
 * Safety: any error triggers exponential back-off; engine errors don't crash the loop.
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { BotEngineService, VkEvent } from './bot-engine.service';

const VK_API = 'https://api.vk.com/method';
const V = '5.199';
const WAIT = 25; // long-poll wait seconds

@Injectable()
export class VkBotLongPollService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VkBotLongPollService.name);
  private running = false;
  private token: string;
  private groupId: number;

  constructor(
    private readonly config: ConfigService,
    private readonly engine: BotEngineService,
  ) {
    this.token = config.get<string>('VK_GROUP_TOKEN', '');
    this.groupId = Number(config.get<string>('VK_GROUP_ID', '0'));
  }

  onModuleInit() {
    if (!this.token || !this.groupId) {
      this.logger.warn('VK_GROUP_TOKEN or VK_GROUP_ID not set — bot Long Poll disabled');
      return;
    }
    this.running = true;
    this._loop().catch((e) => this.logger.error('Long poll loop crashed: %s', e.message));
  }

  onModuleDestroy() {
    this.running = false;
  }

  private async _loop() {
    let backoff = 3000;
    while (this.running) {
      try {
        const { server, key, ts } = await this._getServer();
        let currentTs = ts;

        while (this.running) {
          const url = `${server}?act=a_check&key=${encodeURIComponent(key)}&ts=${currentTs}&wait=${WAIT}`;
          let resp: any;
          try {
            const res = await axios.get(url, { timeout: (WAIT + 5) * 1000 });
            resp = res.data;
          } catch (e: any) {
            this.logger.warn('Long poll HTTP error: %s', e.message);
            await this._sleep(2000);
            break; // re-fetch server
          }

          if (resp.failed) {
            if (resp.failed === 1) {
              currentTs = resp.ts; // just update ts, keep polling
            } else {
              this.logger.warn('Long poll failed=%d, re-fetching server', resp.failed);
              break; // re-fetch server key
            }
          } else {
            currentTs = resp.ts;
            for (const update of resp.updates ?? []) {
              this._dispatchUpdate(update);
            }
          }
          backoff = 3000; // reset on success
        }
      } catch (e: any) {
        this.logger.error('Long poll outer error: %s — retrying in %dms', e.message, backoff);
        await this._sleep(backoff);
        backoff = Math.min(backoff * 2, 60_000);
      }
    }
  }

  private async _getServer(): Promise<{ server: string; key: string; ts: string }> {
    const res = await axios.get(`${VK_API}/groups.getLongPollServer`, {
      params: { group_id: this.groupId, random_id: 0, v: V, access_token: this.token },
      timeout: 10_000,
    });
    if (res.data?.error) throw new Error(`VK getLongPollServer: ${res.data.error.error_msg}`);
    const r = res.data.response;
    return { server: r.server, key: r.key, ts: r.ts };
  }

  private _dispatchUpdate(update: any) {
    // v5.x group events have { type, object, group_id }
    const type = update.type as string;
    const obj = update.object ?? {};

    let ev: VkEvent | null = null;

    if (type === 'message_new') {
      const msg = obj.message ?? obj; // v5.199 has obj.message
      const peerId: number = msg.peer_id ?? msg.from_id;
      ev = {
        type: 'message_new',
        peerId,
        text: msg.text ?? '',
        payload: msg.payload ? this._parsePayload(msg.payload) : undefined,
        attachments: msg.attachments ?? [],
      };
    } else if (type === 'message_event') {
      ev = {
        type: 'message_event',
        peerId: obj.peer_id ?? obj.user_id,
        payload: obj.payload,
        eventId: obj.event_id,
      };
    } else if (type === 'message_allow') {
      ev = {
        type: 'message_allow',
        peerId: obj.user_id,
        refParam: obj.key,
      };
    } else if (type === 'message_deny') {
      ev = {
        type: 'message_deny',
        peerId: obj.user_id,
      };
    }

    if (ev) {
      this.engine.handleEvent(ev).catch((e) =>
        this.logger.error('Engine handleEvent error: %s', e.message),
      );
    }
  }

  private _parsePayload(raw: any): any {
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return raw; }
    }
    return raw;
  }

  private _sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
