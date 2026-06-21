import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VkMessengerClient, VkGroupAuthError } from './vk-messenger.client';
import { VkRealtimeGateway } from './vk-realtime.gateway';
import { parseVkMarkers } from './vk-attachments.util';
import { ConversationListDto } from './dto/conversation.dto';
import { MessageListDto } from './dto/message.dto';
import { ClientDto } from './dto/client.dto';
import { ReminderDto } from './dto/reminder.dto';

const PAGE_SIZE = 40;
const HISTORY_COUNT = 50;
const SYNC_BATCH = 200;

export interface IncomingMsgPayload {
  peerId: number;
  vkMessageId: number;
  text: string;
  attachments?: any[];
  date?: number;
  fromId?: number;
}

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);
  private syncing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly vk: VkMessengerClient,
    private readonly gateway: VkRealtimeGateway,
  ) {}

  // ─── Realtime: incoming message from Long Poll ─────────────────────────────

  async handleIncomingMessage(payload: IncomingMsgPayload): Promise<void> {
    const { peerId, vkMessageId, text, attachments = [], date, fromId } = payload;

    // Skip messages sent by the group itself (negative from_id)
    if (fromId !== undefined && fromId < 0) return;

    const createdAt = date ? new Date(date * 1000) : new Date();

    // Upsert VkConversation
    const conv = await this.prisma.vkConversation.upsert({
      where: { peerId },
      create: {
        peerId,
        peerType: 'user',
        clientName: `Пользователь ${peerId}`,
        lastMessageText: text.slice(0, 200),
        lastMessageAt: createdAt,
        unreadCount: 1,
      },
      update: {},
    });

    // Ensure VkClient exists (FK to VkConversation.peerId)
    await this.prisma.vkClient.upsert({
      where: { peerId },
      create: { peerId },
      update: {},
    });

    // Skip if already processed this vkMessageId
    const existing = await this.prisma.vkMessage.findUnique({
      where: { conversationId_vkMessageId: { conversationId: conv.id, vkMessageId } },
    });
    if (existing) return;

    const msg = await this.prisma.vkMessage.create({
      data: {
        conversationId: conv.id,
        vkMessageId,
        direction: 'IN',
        text,
        attachments: this.normalizeAttachments(attachments),
        senderName: conv.clientName,
        createdAt,
      },
    });

    const updatedConv = await this.prisma.vkConversation.update({
      where: { id: conv.id },
      data: {
        lastMessageText: text.slice(0, 200),
        lastMessageAt: createdAt,
        unreadCount: { increment: 1 },
      },
    });

    // Push realtime events to all connected browsers
    this.gateway.broadcast('vk:msg:new', {
      conversationId: conv.id,
      message: {
        id: msg.id,
        vkMessageId: msg.vkMessageId,
        direction: 'IN',
        text: msg.text,
        senderName: msg.senderName,
        createdAt: msg.createdAt,
        attachments: (msg.attachments as any[]) ?? [],
      },
    });

    this.gateway.broadcast('vk:conv:update', {
      id: updatedConv.id,
      peerId: updatedConv.peerId,
      peerType: updatedConv.peerType,
      clientName: updatedConv.clientName,
      clientAvatar: updatedConv.clientAvatar,
      lastMessageText: updatedConv.lastMessageText,
      lastMessageAt: updatedConv.lastMessageAt,
      unreadCount: updatedConv.unreadCount,
      crmStatus: updatedConv.crmStatus,
      assignedBotId: (updatedConv as any).assignedBotId ?? null,
      botPaused: (updatedConv as any).botPaused ?? false,
    });
  }

  // ─── Bot assignment ────────────────────────────────────────────────────────

  async getConversationBotInfo(conversationId: string) {
    const conv = await this.prisma.vkConversation.findUnique({
      where: { id: conversationId },
    });
    if (!conv) throw new NotFoundException('Диалог не найден');

    const assignedBotId = (conv as any).assignedBotId as string | null;
    const botPaused = (conv as any).botPaused as boolean;

    let botName: string | null = null;
    if (assignedBotId) {
      const bot = await this.prisma.bot.findUnique({ where: { id: assignedBotId } });
      botName = bot?.name ?? null;
    }

    return { botId: assignedBotId, botName, paused: botPaused };
  }

  async setConversationBot(
    conversationId: string,
    botId: string | null | undefined,
    paused?: boolean,
  ) {
    const conv = await this.prisma.vkConversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('Диалог не найден');

    const data: any = {};
    if (botId !== undefined) data.assignedBotId = botId ?? null;
    if (paused !== undefined) data.botPaused = paused;

    await this.prisma.vkConversation.update({ where: { id: conversationId }, data });
    return this.getConversationBotInfo(conversationId);
  }

  // ─── Reminders ────────────────────────────────────────────────────────────

  async getReminders(): Promise<ReminderDto[]> {
    const horizon = new Date();
    horizon.setDate(horizon.getDate() + 7);

    const clients = await this.prisma.vkClient.findMany({
      where: {
        nextContactDate: { lte: horizon },
      } as any,
      include: {
        conversation: { select: { id: true, clientName: true, clientAvatar: true } },
      },
      orderBy: { nextContactDate: 'asc' } as any,
      take: 50,
    });

    const now = new Date();
    return clients.map((c: any) => ({
      clientId: c.id,
      peerId: c.peerId,
      clientName: c.conversation?.clientName ?? c.fio ?? `Пользователь ${c.peerId}`,
      clientAvatar: c.conversation?.clientAvatar ?? null,
      nextContactDate: c.nextContactDate,
      isOverdue: c.nextContactDate < now,
      conversationId: c.conversation?.id ?? null,
    }));
  }

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

    // Fetch assigned bot names separately
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.vkConversation.count({ where }),
      this.prisma.vkConversation.findMany({
        where,
        orderBy: { lastMessageAt: 'desc' },
        skip: page * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    // Gather unique assignedBotIds to fetch names in bulk
    const botIds = [...new Set(
      rows.map((r: any) => r.assignedBotId).filter(Boolean) as string[],
    )];
    const botMap = new Map<string, string>();
    if (botIds.length) {
      const bots = await this.prisma.bot.findMany({
        where: { id: { in: botIds } },
        select: { id: true, name: true },
      });
      bots.forEach((b) => botMap.set(b.id, b.name));
    }

    return {
      total,
      items: rows.map((r: any) => ({
        id: r.id,
        peerId: r.peerId,
        peerType: r.peerType,
        clientName: r.clientName,
        clientAvatar: r.clientAvatar,
        lastMessageText: r.lastMessageText,
        lastMessageAt: r.lastMessageAt,
        unreadCount: r.unreadCount,
        crmStatus: r.crmStatus,
        assignedBotId: r.assignedBotId ?? null,
        assignedBotName: r.assignedBotId ? (botMap.get(r.assignedBotId) ?? null) : null,
        botPaused: r.botPaused ?? false,
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
      include: {
        client: {
          include: {
            crmStatus: { select: { id: true, name: true, color: true } },
            tagLinks: { include: { tag: { select: { id: true, name: true, color: true } } } },
          },
        },
      },
    });
    if (!conv) throw new NotFoundException('Клиент не найден');

    const c = conv.client;
    return {
      id: c?.id ?? '',
      peerId,
      fio: c?.fio ?? null,
      firstName: c?.firstName ?? null,
      lastName: c?.lastName ?? null,
      phone: c?.phone ?? null,
      email: (c as any)?.email ?? null,
      birthDate: (c as any)?.birthDate ?? null,
      country: (c as any)?.country ?? null,
      city: c?.city ?? null,
      source: c?.source ?? null,
      note: c?.note ?? null,
      tags: ((c as any)?.tagLinks ?? []).map((tl: any) => tl.tag),
      nextContactDate: (c as any)?.nextContactDate ?? null,
      lastContactAt: (c as any)?.lastContactAt ?? null,
      crmStatusId: c?.crmStatusId ?? null,
      crmStatus: (c as any)?.crmStatus ?? null,
      clientName: conv.clientName,
      clientAvatar: conv.clientAvatar,
    };
  }

  // ─── Write ─────────────────────────────────────────────────────────────────

  async sendMessage(conversationId: string, text: string): Promise<MessageDto> {
    if (!this.vk.configured) {
      throw new BadRequestException('VK_GROUP_TOKEN не настроен. Добавьте токен сообщества с правом messages в .env и перезапустите сервер.');
    }

    const conv = await this.prisma.vkConversation.findUnique({
      where: { id: conversationId },
      include: { client: true },
    });
    if (!conv) throw new NotFoundException('Диалог не найден');

    const clientName = conv.client?.firstName
      ? `${conv.client.firstName} ${conv.client.lastName ?? ''}`.trim()
      : conv.clientName;

    const { cleanText, attachment } = parseVkMarkers(text, clientName);

    let vkId: number;
    try {
      vkId = await this.vk.sendMessage(conv.peerId, cleanText, attachment || undefined);
    } catch (err: any) {
      this.logger.error('VK messages.send failed for peerId=%d: %s', conv.peerId, err.message);
      if (err instanceof VkGroupAuthError) {
        throw new BadRequestException(`Ошибка авторизации VK: ${err.message}`);
      }
      const vkMsg = err.message?.startsWith('VK send error:') ? err.message : `Ошибка VK: ${err.message}`;
      throw new BadRequestException(vkMsg);
    }

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

    const msgDto: MessageDto = {
      id: msg.id,
      vkMessageId: msg.vkMessageId,
      direction: 'OUT',
      text: msg.text,
      senderName: msg.senderName,
      createdAt: msg.createdAt,
      attachments: [],
    };

    // Push to realtime so other operators see outgoing messages immediately
    this.gateway.broadcast('vk:msg:new', {
      conversationId: conv.id,
      message: msgDto,
    });

    return msgDto;
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
