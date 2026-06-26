/**
 * Обрабатывает VK Callback события message_allow и message_new.
 * Вызывается из BotEngineService после хука в handleEvent().
 */
import { Injectable, Logger } from '@nestjs/common';
import { FunnelIngestService } from './funnel-ingest.service';

@Injectable()
export class VkCallbackService {
  private readonly logger = new Logger(VkCallbackService.name);

  constructor(private readonly ingest: FunnelIngestService) {}

  async onMessageAllow(vkUserId: number): Promise<void> {
    const uid = String(vkUserId);
    this.logger.debug(`message_allow peerId=${uid}`);
    await this.ingest.ingest({
      stage: 'DIALOG_ALLOWED',
      source: 'VK_CALLBACK',
      vkUserId: uid,
      dedupeKey: `allow:${uid}:${new Date().toISOString().slice(0, 13)}`, // hourly dedupe
    });
  }

  async onMessageNew(vkUserId: number): Promise<void> {
    const uid = String(vkUserId);
    this.logger.debug(`message_new peerId=${uid}`);
    await this.ingest.ingest({
      stage: 'FIRST_MESSAGE',
      source: 'VK_CALLBACK',
      vkUserId: uid,
      dedupeKey: `msg:${uid}:first`,
    });
    // Update isWriter flag via upsertContact
    await this.ingest.upsertContact(uid, 'FIRST_MESSAGE');
  }
}
