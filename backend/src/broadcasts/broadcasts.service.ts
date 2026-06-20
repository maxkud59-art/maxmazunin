import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VkMessengerClient } from '../assistant/vk-messenger.client';
import { CreateCampaignDto, UpdateCampaignDto, SegmentFilterDto } from './dto';
import { CampaignStatus } from '@prisma/client';

// VK allows ~20 messages/second to community subscribers; we use 1/sec to be safe
const SEND_DELAY_MS = 1100;
// Max sends per day per VK community (conservative)
const DAILY_LIMIT = 10000;

@Injectable()
export class BroadcastsService {
  private readonly logger = new Logger(BroadcastsService.name);
  private sendingCampaigns = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly vk: VkMessengerClient,
  ) {}

  async listCampaigns() {
    return this.prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { recipients: true } } },
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
    return this.prisma.campaign.create({
      data: {
        name: dto.name,
        messageText: dto.messageText,
        segmentFilter: (dto.segmentFilter ?? {}) as any,
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
    return this.prisma.campaign.update({
      where: { id },
      data: {
        name: dto.name,
        messageText: dto.messageText,
        ...(dto.segmentFilter !== undefined && { segmentFilter: dto.segmentFilter as any }),
        ...(dto.scheduledAt !== undefined && { scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null }),
      },
    });
  }

  async previewSegment(filter: SegmentFilterDto) {
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

  async startCampaign(id: string) {
    const c = await this.prisma.campaign.findUnique({ where: { id } });
    if (!c) throw new NotFoundException('Кампания не найдена');
    if (c.status === CampaignStatus.SENDING) {
      throw new BadRequestException('Рассылка уже запущена');
    }
    if (!this.vk.configured) {
      throw new BadRequestException('VK_GROUP_TOKEN не настроен');
    }

    // Build recipients from segment
    const filter = (c.segmentFilter ?? {}) as SegmentFilterDto;
    const where = this.buildClientWhere(filter);
    const clients = await this.prisma.vkClient.findMany({
      where,
      select: { peerId: true, firstName: true, lastName: true, fio: true, conversation: { select: { clientName: true } } },
    });

    if (!clients.length) {
      throw new BadRequestException('Нет получателей по выбранному сегменту');
    }

    // Clear old recipients and create new
    await this.prisma.campaignRecipient.deleteMany({ where: { campaignId: id } });
    await this.prisma.campaignRecipient.createMany({
      data: clients.map((cl) => ({
        campaignId: id,
        peerId: cl.peerId,
        clientName: cl.firstName
          ? `${cl.firstName} ${cl.lastName ?? ''}`.trim()
          : cl.fio ?? cl.conversation?.clientName ?? '—',
      })),
    });

    await this.prisma.campaign.update({
      where: { id },
      data: { status: CampaignStatus.SENDING, totalCount: clients.length, sentCount: 0, errorCount: 0 },
    });

    // Run async — don't await
    this.runSend(id).catch((e) => this.logger.error('Campaign send error: %s', e.message));

    return { started: true, totalCount: clients.length };
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

    try {
      let sentToday = 0;

      while (true) {
        const campaign = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
        if (!campaign || campaign.status !== CampaignStatus.SENDING) {
          this.logger.log('Campaign %s stopped (status=%s)', campaignId, campaign?.status);
          break;
        }

        if (sentToday >= DAILY_LIMIT) {
          this.logger.warn('Campaign %s hit daily limit %d', campaignId, DAILY_LIMIT);
          await this.prisma.campaign.update({ where: { id: campaignId }, data: { status: CampaignStatus.PAUSED } });
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

        try {
          await this.vk.sendMessage(recipient.peerId, campaign.messageText);
          await this.prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: { status: 'SENT', sentAt: new Date() },
          });
          await this.prisma.campaign.update({
            where: { id: campaignId },
            data: { sentCount: { increment: 1 } },
          });
          sentToday++;
        } catch (err: any) {
          this.logger.warn('Send failed for peerId=%d: %s', recipient.peerId, err.message);
          await this.prisma.campaignRecipient.update({
            where: { id: recipient.id },
            data: { status: 'ERROR', error: err.message?.slice(0, 200) },
          });
          await this.prisma.campaign.update({
            where: { id: campaignId },
            data: { errorCount: { increment: 1 } },
          });
        }

        await this.sleep(SEND_DELAY_MS);
      }
    } finally {
      this.sendingCampaigns.delete(campaignId);
    }
  }

  private buildClientWhere(filter: SegmentFilterDto) {
    const where: any = {};
    if (filter.crmStatusId) where.crmStatusId = filter.crmStatusId;
    if (filter.tagId) where.tagLinks = { some: { tagId: filter.tagId } };
    if (filter.dateFrom || filter.dateTo) {
      where.firstContactAt = {};
      if (filter.dateFrom) where.firstContactAt.gte = new Date(filter.dateFrom);
      if (filter.dateTo) where.firstContactAt.lte = new Date(filter.dateTo);
    }
    // Only clients who have actually written (have a VK conversation)
    where.conversation = { isNot: null };
    return where;
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
