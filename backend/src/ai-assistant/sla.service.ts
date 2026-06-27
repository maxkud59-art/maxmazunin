import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { LifecycleStage } from '@prisma/client';

const BUSINESS_HOURS_START = 9;
const BUSINESS_HOURS_END = 21;
const WORK_DAYS = [1, 2, 3, 4, 5]; // Пн–Пт

@Injectable()
export class SlaService {
  private readonly logger = new Logger(SlaService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Рассчитывает дедлайн в рабочих часах от now.
  computeDeadline(fromDate: Date, businessHours: number): Date {
    const d = new Date(fromDate);
    let remaining = businessHours;

    while (remaining > 0) {
      d.setHours(d.getHours() + 1);
      const hour = d.getHours();
      const day = d.getDay();
      if (WORK_DAYS.includes(day) && hour >= BUSINESS_HOURS_START && hour < BUSINESS_HOURS_END) {
        remaining--;
      }
    }

    return d;
  }

  // Открывает трекер SLA при смене стадии.
  async openTracker(conversationId: string, fromStage: LifecycleStage, toStage: LifecycleStage) {
    const policy = await this.prisma.slaPolicy.findUnique({
      where: { fromStage_toStage: { fromStage, toStage } },
    });

    if (!policy) return;

    const deadlineAt = this.computeDeadline(new Date(), policy.businessHours);

    await this.prisma.slaTracker.create({
      data: {
        conversationId,
        policyId: policy.id,
        deadlineAt,
      },
    });
  }

  // Закрывает открытые трекеры для диалога при достижении целевой стадии.
  async closeTrackers(conversationId: string, reachedStage: LifecycleStage) {
    const open = await this.prisma.slaTracker.findMany({
      where: { conversationId, closedAt: null },
      include: { policy: true },
    });

    const toClose = open.filter(t => t.policy.toStage === reachedStage);

    await Promise.all(
      toClose.map(t =>
        this.prisma.slaTracker.update({
          where: { id: t.id },
          data: { closedAt: new Date(), isBreached: new Date() > t.deadlineAt },
        }),
      ),
    );
  }

  // Каждые 15 минут — помечаем просроченные SLA.
  @Cron('*/15 * * * *')
  async markBreached() {
    const result = await this.prisma.slaTracker.updateMany({
      where: { closedAt: null, isBreached: false, deadlineAt: { lt: new Date() } },
      data: { isBreached: true },
    });
    if (result.count > 0) {
      this.logger.log(`SLA: помечено ${result.count} просроченных трекеров`);
    }
  }

  async getConversationSla(conversationId: string) {
    return this.prisma.slaTracker.findMany({
      where: { conversationId },
      include: { policy: true },
      orderBy: { openedAt: 'desc' },
    });
  }
}
