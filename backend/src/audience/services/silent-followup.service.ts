/**
 * Авто-дожим «молчунов»:
 * AdContact со stage=DIALOG_ALLOWED, без FIRST_MESSAGE, старше SILENT_FOLLOWUP_MINUTES,
 * и без флага silentFollowupSent → ровно ОДНО исходящее сообщение через VkMessengerClient.
 *
 * TODO(vk-docs): проверить, что VK Callback API сообщества действительно отдаёт
 * message_allow на рекламном CTA «написать сообщество»; если нет — фича работает
 * только для тех, кто явно разрешил переписку ранее.
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VkMessengerClient } from '../../assistant/vk-messenger.client';

const DEFAULT_MINUTES = 30;
const DEFAULT_MESSAGE = process.env.SILENT_FOLLOWUP_TEXT ??
  'Привет! Видели, что вы интересовались нашими книгами 📖 Если остались вопросы — с удовольствием ответим!';

@Injectable()
export class SilentFollowupService {
  private readonly logger = new Logger(SilentFollowupService.name);
  private readonly followupMinutes: number;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly vk: VkMessengerClient | null,
  ) {
    this.followupMinutes = parseInt(process.env.SILENT_FOLLOWUP_MINUTES ?? String(DEFAULT_MINUTES), 10);
  }

  async processBatch(limit = 50): Promise<number> {
    const threshold = new Date(Date.now() - this.followupMinutes * 60_000);

    const silentContacts = await this.prisma.adContact.findMany({
      where: {
        lastStage: 'DIALOG_ALLOWED',
        silentFollowupSent: false,
        lastStageAt: { lt: threshold },
      },
      take: limit,
    });

    if (!silentContacts.length) return 0;

    let sent = 0;
    for (const contact of silentContacts) {
      try {
        const peerId = parseInt(contact.vkUserId, 10);
        if (isNaN(peerId)) { this.logger.warn(`Invalid vkUserId=${contact.vkUserId}`); continue; }

        if (this.vk && this.vk.token) {
          await this.vk.sendMessage(peerId, DEFAULT_MESSAGE);
          this.logger.log(`Silent followup sent to vkUserId=${contact.vkUserId}`);
        } else {
          this.logger.debug(`DRY_RUN silent followup for vkUserId=${contact.vkUserId} (no VK token)`);
        }

        // Mark sent regardless of dry-run, so we don't retry
        await this.prisma.adContact.update({
          where: { id: contact.id },
          data: { silentFollowupSent: true },
        });
        sent++;
      } catch (err: any) {
        this.logger.error(`Silent followup failed for ${contact.vkUserId}: ${err.message}`);
      }
    }
    return sent;
  }
}
