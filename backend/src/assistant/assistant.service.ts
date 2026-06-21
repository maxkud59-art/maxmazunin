import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VkMessengerClient, VkGroupAuthError } from './vk-messenger.client';
import { parseVkMarkers } from './vk-attachments.util';
import { ConversationListDto } from './dto/conversation.dto';
import { MessageListDto } from './dto/message.dto';
import { ClientDto } from './dto/client.dto';

const PAGE_SIZE = 40;
const HISTORY_COUNT = 50;
const SYNC_BATCH = 200; // max per getConversations call

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private syncing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vk: VkMessengerClient,
  ) {}

  // ─── Sync ─────────────────────────────────────────────────────────────────

  async syncAll(): Promise<void> {
    if (!this.vk.configured) {
      this.logger.warn('VK_GROUP_TOKEN/VK_GROUP_ID not set — skipping sync');
      return;
    }
    if (this.syncing) {
      this.logger.debug('Sync already running — skipped');
      return;
    }
    this.syncing = true;
    try {
      await this.doSync();
    } catch (err: any) {
      if (err instanceof VkGroupAuthError) {
        this.logger.error('VK GROUP TOKEN INVALID: %s', err.message);
      } else {
        this.logger.error('Sync failed: %s', err.message);
      }
    } finally {
      this.syncing = false;
    }
  }

  private async doSync() {
    let offset = 0;
    let total = 1;
    let convCount = 0;

    while (offset < total && offset < 1000) {
      const { total: t, items, profiles } = await this.vk.getConversations(offset, SYNC_BATCH);
      total = t;

      for (const item of items) {
        const lastMsgAt = item.lastMessageDate
          ? new Date(item.lastMessageDate * 1000)
          : new Date();

        const conv = await this.prisma.vkConversation.upsert({
          where: { peerId: item.peerId },
          create: {
            peerId: item.peerId,
            peerType: item.peerType,
            clientName: item.clientName,
            clientAvatar: item.clientAvatar || null,
            lastMessageText: item.lastMessageText,
            lastMessageAt: lastMsgAt,
            unreadCount: item.unreadCount,
          },
          update: {
            clientName: item.clientName,
            clientAvatar: item.clientAvatar || null,
            lastMessageText: item.lastMessageText,
            lastMessageAt: lastMsgAt,
            unreadCount: item.unreadCount,
          },
        });

        // Upsert VkClient with VK profile data
        const profile = profiles[item.peerId];
        await this.prisma.vkClient.upsert({
          where: { peerId: item.peerId },
          create: {
            peerId: item.peerId,
            city: profile?.city ?? null,
          },
          update: {
            city: profile?.city ?? undefined,
          },
        });

        // Sync history (last HISTORY_COUNT msgs)
        await this.syncHistory(conv.id, item.peerId);
        await this.vk.sleep(300);
        convCount++;
      }

      offset += items.length;
      if (items.length < SYNC_BATCH) break;
    }

    this.logger.log('Sync done: %d conversations', convCount);
  }

  private async syncHistory(conversationId: string, peerId: number) {
    try {
      const msgs = await this.vk.getHistory(peerId, HISTORY_COUNT);
      const groupName = 'EasyBook';

      for (const m of msgs) {
        await this.prisma.vkMessage.upsert({
          where: { conversationId_vkMessageId: { conversationId, vkMessageId: m.id } },
          create: {
            conversationId,
            vkMessageId: m.id,
            direction: m.isOut ? 'OUT' : 'IN',
            text: m.text,
            attachments: this.normalizeAttachments(m.attachments),
            senderName: m.isOut ? groupName : '',
            createdAt: new Date(m.date * 1000),
          },
          update: {
            text: m.text,
            attachments: this.normalizeAttachments(m.attachments),
          },
        });
      }
    } catch (err: any) {
      if (err instanceof VkGroupAuthError) throw err;
      this.logger.warn('History sync failed for peerId %d: %s', peerId, err.message);
    }
  }

  private normalizeAttachments(raw: any[]): any[] {
    return raw.map((a) => {
      const type = a.type ?? 'unknown';
      const obj = a[type] ?? {};
      return {
        type,
        url:
          obj.url ??
          (obj.sizes ? obj.sizes[obj.sizes.length - 1]?.url : null) ??
          null,
        title: obj.title ?? obj.name ?? null,
        thumb:
          obj.thumb?.url ??
          (obj.sizes ? obj.sizes[0]?.url : null) ??
          null,
      };
    });
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  async listConversations(params: {
    filter?: 'all' | 'unread' | 'unanswered';
    search?: string;
    page?: number;
  }): Promise<ConversationListDto> {
    const page = params.page ?? 0;
    const where: any = {};

    if (params.filter === 'unread') where.unreadCount = { gt: 0 };
    if (params.search) {
      where.OR = [
        { clientName: { contains: params.search, mode: 'insensitive' } },
        { lastMessageText: { contains: params.search, mode: 'insensitive' } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.vkConversation.count({ where }),
      this.prisma.vkConversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    return {
      total,
      items: rows.map((r) => ({
        id: r.id,
        peerId: r.peerId,
        peerType: r.peerType,
        clientName: r.clientName,
        clientAvatar: r.clientAvatar,
        lastMessageText: r.lastMessageText,
        lastMessageAt: r.lastMessageAt,
        unreadCount: r.unreadCount,
        crmStatus: r.crmStatus,
      })),
    };
  }

  async getMessages(conversationId: string, cursor?: string): Promise<MessageListDto> {
    const conv = await this.prisma.vkConversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('Диалог не найден');

    const where: any = { conversationId };
    if (cursor) where.createdAt = { lt: new Date(cursor) };

    const msgs = await this.prisma.vkMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE + 1,
    });

    const hasMore = msgs.length > PAGE_SIZE;
    const items = (hasMore ? msgs.slice(0, PAGE_SIZE) : msgs).reverse();

    return {
      items: items.map((m) => ({
        id: m.id,
        vkMessageId: m.vkMessageId,
        direction: m.direction,
        text: m.text,
        senderName: m.senderName,
        createdAt: m.createdAt,
        attachments: (m.attachments as any[]) ?? [],
      })),
      nextCursor: hasMore ? items[0].createdAt.toISOString() : null,
    };
  }

  async getClient(peerId: number): Promise<ClientDto> {
    const conv = await this.prisma.vkConversation.findUnique({
      where: { peerId },
      include: { client: true },
    });
    if (!conv) throw new NotFoundException('Клиент не найден');

    const c = conv.client;
    return {
      id: c?.id ?? '',
      peerId,
      fio: c?.fio ?? null,
      phone: c?.phone ?? null,
      city: c?.city ?? null,
      source: c?.source ?? null,
      note: c?.note ?? null,
      tags: (c?.tags as string[]) ?? [],
      clientName: conv.clientName,
      clientAvatar: conv.clientAvatar,
    };
  }

  // ─── Write ─────────────────────────────────────────────────────────────────

  async sendMessage(conversationId: string, text: string): Promise<MessageDto> {
    const conv = await this.prisma.vkConversation.findUnique({
      where: { id: conversationId },
      include: { client: true },
    });
    if (!conv) throw new NotFoundException('Диалог не найден');

    const clientName = conv.client?.firstName
      ? `${conv.client.firstName} ${conv.client.lastName ?? ''}`.trim()
      : conv.clientName;

    const { cleanText, attachment } = parseVkMarkers(text, clientName);

    const vkId = await this.vk.sendMessage(conv.peerId, cleanText, attachment || undefined);

    const msg = await this.prisma.vkMessage.create({
      data: {
        conversationId,
        vkMessageId: vkId || Date.now(),
        direction: 'OUT',
        text: cleanText,
        attachments: [],
        senderName: 'EasyBook',
        createdAt: new Date(),
      },
    });

    await this.prisma.vkConversation.update({
      where: { id: conversationId },
      data: { lastMessageText: cleanText, lastMessageAt: msg.createdAt },
    });

    return {
      id: msg.id,
      vkMessageId: msg.vkMessageId,
      direction: 'OUT',
      text: msg.text,
      senderName: msg.senderName,
      createdAt: msg.createdAt,
      attachments: [],
    };
  }

  checkTokenHealth() {
    return this.vk.checkTokenHealth();
  }
}

// Re-export for controller
export interface MessageDto {
  id: string;
  vkMessageId: number;
  direction: 'IN' | 'OUT';
  text: string;
  senderName: string;
  createdAt: Date;
  attachments: any[];
}
