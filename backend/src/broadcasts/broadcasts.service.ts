import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VkMessengerClient } from '../assistant/vk-messenger.client';
import { parseVkMarkers } from '../assistant/vk-attachments.util';
import { CreateCampaignDto, UpdateCampaignDto, SegmentFilterDto, AudiencePreviewDto, AudienceType } from './dto';
import { CampaignStatus } from '@prisma/client';

@Injectable()
export class BroadcastsService {
  private readonly logger = new Logger(BroadcastsService.name);
  private sendingCampaigns = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly vk: VkMessengerClient,
  ) {}

  get sendDelayMs(): number {
    const rate = Number(process.env.BROADCAST_RATE_PER_SEC ?? 2);
    return rate > 0 ? Math.max(100, Math.round(1000 / rate)) : 500;
  }

  async listCampaigns() {
    return this.prisma.campaign.findMany({
      where: { archived: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getCampaign(id: string) {
    const c = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        recipients: { orderBy: { sentAt: 'desc' }, take: 200 },
      },
    });
    if (!c) throw new NotFoundException('Кампания не найдена');
    return c;
  }

  async create(dto: CreateCampaignDto) {
    const audienceType: AudienceType = dto.audienceType ?? 'filter';
    const audienceConfig = dto.audienceConfig ?? {};
    const segmentFilter = dto.segmentFilter ?? {};

    return this.prisma.campaign.create({
      data: {
        name: dto.name,
        messageText: dto.messageText,
        attachments: (dto.attachments ?? []) as any,
        audienceType,
        audienceConfig: audienceConfig as any,
        segmentFilter: segmentFilter as any,
        channel: dto.channel ?? 'VK',
        description: dto.description ?? '',
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      },
    });
  }

  async update(id: string, dto: UpdateCampaignDto) {
    const c = await this.prisma.campaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Кампания не найдена');
    if (c.status === CampaignStatus.SENDING) {
      throw new BadRequestException('Нельзя редактировать запущенную рассылку');
    }

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.messageText !== undefined) data.messageText = dto.messageText;
    if (dto.attachments !== undefined) data.attachments = dto.attachments;
    if (dto.audienceType !== undefined) data.audienceType = dto.audienceType;
    if (dto.audienceConfig !== undefined) data.audienceConfig = dto.audienceConfig;
    if (dto.segmentFilter !== undefined) data.segmentFilter = dto.segmentFilter;
    if (dto.channel !== undefined) data.channel = dto.channel;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.scheduledAt !== undefined) data.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;

    return this.prisma.campaign.update({ where: { id }, data });
  }

  async archiveCampaign(id: string) {
    const c = await this.prisma.campaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Кампания не найдена');
    if (c.status === CampaignStatus.SENDING) {
      throw new BadRequestException('Нельзя архивировать запущенную рассылку. Сначала поставьте на паузу.');
    }
    await this.prisma.campaign.update({ where: { id }, data: { archived: true } });
    return { archived: true };
  }

  async getDailyLimit() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const sentToday = await this.prisma.campaignRecipient.count({
      where: { status: 'SENT', sentAt: { gte: todayStart } },
    });

    const vkConfigured = this.vk.configured;
    const ratePerSec = Number(process.env.BROADCAST_RATE_PER_SEC ?? 2);

    return {
      sentToday,
      ratePerSec,
      delayMs: this.sendDelayMs,
      vkConfigured,
      groupId: vkConfigured ? this.vk.groupId : null,
    };
  }

  async audiencePreview(dto: AudiencePreviewDto) {
    const audienceType: AudienceType = dto.audienceType ?? 'filter';

    if (audienceType === 'vkIds') {
      const ids: number[] = (dto.audienceConfig as any)?.vkPeerIds ?? [];
      const valid = ids.filter((id) => Number.isFinite(id) && id !== 0);
      // Try to match against known clients
      const known = await this.prisma.vkClient.count({
        where: { peerId: { in: valid } },
      });
      return {
        count: valid.length,
        knownClients: known,
        sample: valid.slice(0, 5).map((id) => ({ name: `VK ID ${id}` })),
      };
    }

    if (audienceType === 'clientIds') {
      const ids: string[] = (dto.audienceConfig as any)?.clientIds ?? [];
      const clients = await this.prisma.vkClient.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true, fio: true, conversation: { select: { clientName: true } } },
        take: 5,
      });
      const count = await this.prisma.vkClient.count({ where: { id: { in: ids } } });
      return {
        count,
        sample: clients.map((c) => ({
          id: c.id,
          name: c.firstName ? `${c.firstName} ${c.lastName ?? ''}`.trim() : c.fio ?? c.conversation?.clientName ?? '—',
        })),
      };
    }

    // filter type — use segmentFilter
    const filter = (dto.segmentFilter ?? (dto.audienceConfig as any)?.filter ?? {}) as SegmentFilterDto;
    const where = this.buildClientWhere(filter);
    const count = await this.prisma.vkClient.count({ where });
    const sample = await this.prisma.vkClient.findMany({
      where,
      take: 5,
      select: {
        id: true, firstName: true, lastName: true, fio: true,
        conversation: { select: { clientName: true } },
      },
    });
    return {
      count,
      sample: sample.map((c) => ({
        id: c.id,
        name: c.firstName ? `${c.firstName} ${c.lastName ?? ''}`.trim() : c.fio ?? c.conversation?.clientName ?? '—',
      })),
    };
  }

  /** @deprecated Use audiencePreview instead */
  async previewSegment(filter: SegmentFilterDto) {
    return this.audiencePreview({ audienceType: 'filter', segmentFilter: filter });
  }

  async startCampaign(id: string) {
    const c = await this.prisma.campaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Кампания не найдена');
    if (c.status === CampaignStatus.SENDING) {
      throw new BadRequestException('Рассылка уже запущена');
    }
    if (!this.vk.configured) {
      throw new BadRequestException('VK_GROUP_TOKEN не настроен');
    }

    const audienceType = (c.audienceType ?? 'filter') as AudienceType;
    const audienceConfig = (c.audienceConfig ?? {}) as Record<string, any>;
    const segmentFilter = (c.segmentFilter ?? {}) as SegmentFilterDto;

    type RecipientData = { peerId: number; clientName: string; clientId?: string };
    let recipients: RecipientData[] = [];

    if (audienceType === 'vkIds') {
      const ids: number[] = audienceConfig.vkPeerIds ?? [];
      if (!ids.length) throw new BadRequestException('Список VK ID пуст');
      recipients = ids.map((peerId) => ({ peerId, clientName: `VK ID ${peerId}` }));

      // Try to enrich names from known clients
      const known = await this.prisma.vkClient.findMany({
        where: { peerId: { in: ids } },
        select: {
          peerId: true, firstName: true, lastName: true, fio: true,
          conversation: { select: { clientName: true } },
        },
      });
      const nameMap = new Map(known.map((k) => [
        k.peerId,
        k.firstName ? `${k.firstName} ${k.lastName ?? ''}`.trim() : k.fio ?? k.conversation?.clientName ?? '',
      ]));
      recipients = ids.map((peerId) => ({
        peerId,
        clientName: nameMap.get(peerId) || `VK ID ${peerId}`,
      }));
    } else if (audienceType === 'clientIds') {
      const ids: string[] = audienceConfig.clientIds ?? [];
      if (!ids.length) throw new BadRequestException('Список ID клиентов пуст');
      const clients = await this.prisma.vkClient.findMany({
        where: { id: { in: ids } },
        select: {
          id: true, peerId: true, firstName: true, lastName: true, fio: true,
          conversation: { select: { clientName: true } },
        },
      });
      recipients = clients.map((cl) => ({
        peerId: cl.peerId,
        clientName: cl.firstName
          ? `${cl.firstName} ${cl.lastName ?? ''}`.trim()
          : cl.fio ?? cl.conversation?.clientName ?? '—',
        clientId: cl.id,
      }));
    } else {
      // filter type
      const where = this.buildClientWhere(segmentFilter);
      const clients = await this.prisma.vkClient.findMany({
        where,
        select: {
          peerId: true, firstName: true, lastName: true, fio: true,
          conversation: { select: { clientName: true } },
        },
      });
      recipients = clients.map((cl) => ({
        peerId: cl.peerId,
        clientName: cl.firstName
          ? `${cl.firstName} ${cl.lastName ?? ''}`.trim()
          : cl.fio ?? cl.conversation?.clientName ?? '—',
      }));
    }

    if (!recipients.length) {
      throw new BadRequestException('Нет получателей по выбранной аудитории');
    }

    // Clear old recipients and create new
    await this.prisma.campaignRecipient.deleteMany({ where: { campaignId: id } });
    await this.prisma.campaignRecipient.createMany({
      data: recipients.map((r) => ({
        campaignId: id,
        peerId: r.peerId,
        clientName: r.clientName,
      })),
    });

    await this.prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.SENDING, totalCount: recipients.length, sentCount: 0, errorCount: 0 },
    });

    // Run async — don't await
    this.runSend(id).catch((e) => this.logger.error('Campaign send error: %s', e.message));

    return { started: true, totalCount: recipients.length };
  }

  async pauseCampaign(id: string) {
    const c = await this.prisma.campaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Кампания не найдена');
    if (c.status !== CampaignStatus.SENDING) {
      throw new BadRequestException('Рассылка не запущена');
    }
    await this.prisma.campaign.update({ where: { id }, data: { status: CampaignStatus.PAUSED } });
    return { paused: true };
  }

  async cancelCampaign(id: string) {
    await this.prisma.campaign.update({ where: { id }, data: { status: CampaignStatus.FAILED } });
    return { cancelled: true };
  }

  private async runSend(campaignId: string) {
    if (this.sendingCampaigns.has(campaignId)) return;
    this.sendingCampaigns.add(campaignId);

    let currentDelayMs = this.sendDelayMs;

    try {
      while (true) {
        const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
        if (!campaign || campaign.status !== CampaignStatus.SENDING) {
          this.logger.log('Campaign %s stopped (status=%s)', campaignId, campaign?.status);
          break;
        }

        const recipient = await this.prisma.campaignRecipient.findFirst({
          where: { campaignId, status: 'PENDING' },
          orderBy: { id: 'asc' },
        });

        if (!recipient) {
          await this.prisma.campaign.update({ where: { id: campaignId }, data: { status: CampaignStatus.DONE } });
          this.logger.log('Campaign %s done', campaignId);
          break;
        }

        let retries = 0;
        let handled = false;

        while (!handled) {
          try {
            const { cleanText, attachment } = parseVkMarkers(campaign.messageText, recipient.clientName);
            await this.vk.sendMessage(recipient.peerId, cleanText, attachment || undefined);
            await this.prisma.campaignRecipient.update({
              where: { id: recipient.id },
              data: { status: 'SENT', sentAt: new Date() },
            });
            await this.prisma.campaign.update({
              where: { id: campaignId },
              data: { sentCount: { increment: 1 } },
            });
            currentDelayMs = this.sendDelayMs; // reset after success
            handled = true;
          } catch (err: any) {
            if (this.isFloodError(err) && retries < 2) {
              // VK error 6: too many requests — adaptive backoff then retry
              currentDelayMs = Math.min(currentDelayMs * 2, 10000);
              retries++;
              this.logger.warn('VK flood (err 6) for peerId=%d, retry %d/2 after %dms', recipient.peerId, retries, currentDelayMs);
              await this.sleep(currentDelayMs);
              const refreshed = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
              if (!refreshed || refreshed.status !== CampaignStatus.SENDING) return;
            } else if (this.isAccessDeniedError(err)) {
              // VK error 901/900/902: user blocked messages — skip, not an error
              this.logger.warn('VK access denied (err 901) for peerId=%d', recipient.peerId);
              await this.prisma.campaignRecipient.update({
                where: { id: recipient.id },
                data: { status: 'SKIPPED', error: 'Пользователь не разрешил сообщения от сообщества' },
              });
              await this.prisma.campaign.update({
                where: { id: campaignId },
                data: { errorCount: { increment: 1 } },
              });
              handled = true;
            } else {
              // Other error or exhausted flood retries
              this.logger.warn('Send failed for peerId=%d: %s', recipient.peerId, err.message);
              await this.prisma.campaignRecipient.update({
                where: { id: recipient.id },
                data: { status: 'ERROR', error: err.message?.slice(0, 200) },
              });
              await this.prisma.campaign.update({
                where: { id: campaignId },
                data: { errorCount: { increment: 1 } },
              });
              handled = true;
            }
          }
        }

        await this.sleep(currentDelayMs);
      }
    } finally {
      this.sendingCampaigns.delete(campaignId);
    }
  }

  private isFloodError(err: any): boolean {
    const msg = (err?.message ?? '') + JSON.stringify(err?.response ?? {});
    return msg.includes('"error_code":6') || msg.includes('error_code: 6') || msg.toLowerCase().includes('too many requests');
  }

  private isAccessDeniedError(err: any): boolean {
    const msg = (err?.message ?? '') + JSON.stringify(err?.response ?? {});
    return ['900', '901', '902'].some((code) => msg.includes(`"error_code":${code}`) || msg.includes(`error_code: ${code}`));
  }

  private buildClientWhere(filter: SegmentFilterDto) {
    const andConditions: any[] = [];

    if (filter.search) {
      andConditions.push({
        OR: [
          { firstName: { contains: filter.search, mode: 'insensitive' } },
          { lastName: { contains: filter.search, mode: 'insensitive' } },
          { fio: { contains: filter.search, mode: 'insensitive' } },
          { conversation: { clientName: { contains: filter.search, mode: 'insensitive' } } },
        ],
      });
    }

    if (filter.crmStatusId) {
      andConditions.push({ crmStatusId: filter.crmStatusId });
    } else if (filter.crmStatusIds) {
      const ids = filter.crmStatusIds.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length) andConditions.push({ crmStatusId: { in: ids } });
    }

    if (filter.tagId) {
      andConditions.push({ tagLinks: { some: { tagId: filter.tagId } } });
    } else if (filter.tagIds) {
      const ids = filter.tagIds.split(',').map((s) => s.trim()).filter(Boolean);
      if (ids.length) andConditions.push({ tagLinks: { some: { tagId: { in: ids } } } });
    }

    if (filter.dateFrom || filter.dateTo) {
      const range: any = {};
      if (filter.dateFrom) range.gte = new Date(filter.dateFrom);
      if (filter.dateTo) range.lte = new Date(filter.dateTo);
      andConditions.push({ firstContactAt: range });
    }

    if (filter.source) andConditions.push({ source: { contains: filter.source, mode: 'insensitive' } });
    if (filter.city) andConditions.push({ city: { contains: filter.city, mode: 'insensitive' } });
    if (filter.country) andConditions.push({ country: { contains: filter.country, mode: 'insensitive' } });

    if (filter.hasOrders === 'true') {
      andConditions.push({ orders: { some: {} } });
    } else if (filter.hasOrders === 'false') {
      andConditions.push({ orders: { none: {} } });
    }

    if (filter.orderStatusId) {
      andConditions.push({ orders: { some: { orderStatusId: filter.orderStatusId } } });
    }

    // Only clients who have actually written (have a VK conversation)
    andConditions.push({ conversation: { isNot: null } });

    return andConditions.length > 0 ? { AND: andConditions } : {};
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
