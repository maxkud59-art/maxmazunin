import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Детерминированный баланс ВНУТРИ менеджера: перекос вариантов ≤ 1.
  // Назначает вариант с минимальным счётчиком у данного менеджера (тай → control).
  async assignOrder(experimentId: string, orderId: string, managerId: string): Promise<string> {
    // Идемпотентность — уже назначен?
    const existing = await this.prisma.experimentAssignment.findUnique({
      where: { experimentId_orderId: { experimentId, orderId } },
    });
    if (existing) return existing.variantId;

    const experiment = await this.prisma.experiment.findUnique({
      where: { id: experimentId },
      include: { variants: true },
    });
    if (!experiment) throw new NotFoundException(`Experiment ${experimentId} not found`);
    if (experiment.status !== 'RUNNING') throw new Error(`Experiment ${experimentId} is not RUNNING`);

    const variants = experiment.variants;
    if (!variants.length) throw new Error('Experiment has no variants');

    // Счётчики вариантов у данного менеджера
    const counts = await this.prisma.experimentAssignment.groupBy({
      by: ['variantId'],
      where: { experimentId, managerId },
      _count: true,
    });
    const countMap = new Map<string, number>(counts.map((c) => [c.variantId, c._count]));

    // Выбираем вариант с минимальным счётчиком; тай → control
    let chosen = variants.find((v) => v.isControl) ?? variants[0];
    let minCount = countMap.get(chosen.id) ?? 0;

    for (const v of variants) {
      const cnt = countMap.get(v.id) ?? 0;
      if (cnt < minCount) {
        minCount = cnt;
        chosen = v;
      }
    }

    await this.prisma.experimentAssignment.create({
      data: { experimentId, variantId: chosen.id, orderId, managerId },
    });

    return chosen.id;
  }

  // Проверяет что перекос ≤ 1 внутри каждого менеджера для unit-теста.
  async checkManagerBias(experimentId: string): Promise<{ managerId: string; maxSkew: number }[]> {
    const assignments = await this.prisma.experimentAssignment.findMany({
      where: { experimentId },
      select: { managerId: true, variantId: true },
    });

    const byManager = new Map<string, Map<string, number>>();
    for (const a of assignments) {
      if (!byManager.has(a.managerId)) byManager.set(a.managerId, new Map());
      const m = byManager.get(a.managerId)!;
      m.set(a.variantId, (m.get(a.variantId) ?? 0) + 1);
    }

    return [...byManager.entries()].map(([managerId, counts]) => {
      const vals = [...counts.values()];
      const max = Math.max(...vals);
      const min = Math.min(...vals);
      return { managerId, maxSkew: max - min };
    });
  }
}
