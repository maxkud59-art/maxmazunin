import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { twoProportionsZTest } from './stats.util';

export type SignificanceStatus = 'INSUFFICIENT' | 'SIGNIFICANT';

export interface VariantResult {
  variantId: string;
  name: string;
  isControl: boolean;
  nAssigned: number;
  nMatured: number;
  nInFlight: number;
  nPaid: number;
  convToPaid: number;
  zVsControl: number | null;
  pValue: number | null;
  significance: SignificanceStatus;
}

export interface ExperimentResults {
  experimentId: string;
  name: string;
  status: string;
  maturationDays: number;
  minSamplePerVariant: number;
  pThreshold: number;
  variants: VariantResult[];
  overallSignificance: SignificanceStatus;
  stableSignCount: number;
}

@Injectable()
export class ResultsService {
  private readonly logger = new Logger(ResultsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async computeResults(experimentId: string): Promise<ExperimentResults> {
    const exp = await this.prisma.experiment.findUniqueOrThrow({
      where: { id: experimentId },
      include: { variants: true },
    });

    const now = new Date();
    const maturationMs = exp.maturationDays * 24 * 60 * 60 * 1000;

    // Все назначения с деталями заказа
    const assignments = await this.prisma.experimentAssignment.findMany({
      where: { experimentId },
      include: { order: { select: { paymentStatus: true, paidAt: true, createdAt: true } } },
    });

    const controlVariant = exp.variants.find((v) => v.isControl) ?? exp.variants[0];

    const buildVariantResult = (variantId: string): Omit<VariantResult, 'zVsControl' | 'pValue' | 'significance'> => {
      const vAssigns = assignments.filter((a) => a.variantId === variantId);
      const nAssigned = vAssigns.length;
      const matured = vAssigns.filter((a) => now.getTime() - new Date(a.order.createdAt).getTime() >= maturationMs);
      const inFlight = nAssigned - matured.length;
      // LLM не считает числа — только DB data
      const paid = matured.filter((a) => a.order.paymentStatus === 'PAID_FULL');
      const variant = exp.variants.find((v) => v.id === variantId)!;
      return {
        variantId,
        name: variant.name,
        isControl: variant.isControl,
        nAssigned,
        nMatured: matured.length,
        nInFlight: inFlight,
        nPaid: paid.length,
        convToPaid: matured.length > 0 ? paid.length / matured.length : 0,
      };
    };

    const baseResults = exp.variants.map((v) => buildVariantResult(v.id));
    const controlResult = baseResults.find((r) => r.variantId === controlVariant.id)!;

    // Проверка стабильности знака через снапшоты (≥3 дней с одинаковым знаком)
    const stableSignCount = await this.countStableSnapshots(experimentId);

    const variantResults: VariantResult[] = baseResults.map((r) => {
      if (r.isControl) return { ...r, zVsControl: null, pValue: null, significance: 'INSUFFICIENT' };

      const { zA, pValueA } = twoProportionsZTest(
        r.nMatured, r.nPaid,
        controlResult.nMatured, controlResult.nPaid,
      );

      const isSig =
        r.nMatured >= exp.minSamplePerVariant &&
        controlResult.nMatured >= exp.minSamplePerVariant &&
        pValueA !== null && pValueA < exp.pThreshold &&
        stableSignCount >= 3;

      return { ...r, zVsControl: zA, pValue: pValueA, significance: isSig ? 'SIGNIFICANT' : 'INSUFFICIENT' };
    });

    const overallSignificance: SignificanceStatus =
      variantResults.some((r) => r.significance === 'SIGNIFICANT') ? 'SIGNIFICANT' : 'INSUFFICIENT';

    return {
      experimentId,
      name: exp.name,
      status: exp.status,
      maturationDays: exp.maturationDays,
      minSamplePerVariant: exp.minSamplePerVariant,
      pThreshold: exp.pThreshold,
      variants: variantResults,
      overallSignificance,
      stableSignCount,
    };
  }

  private async countStableSnapshots(experimentId: string): Promise<number> {
    // Берём последние 10 снапшотов — считаем дни со стабильным знаком эффекта.
    const snapshots = await this.prisma.experimentResultSnapshot.findMany({
      where: { experimentId },
      orderBy: { snapshotDate: 'desc' },
      take: 10,
    });

    const byDate = new Map<string, { zSum: number; count: number }>();
    for (const s of snapshots) {
      const d = s.snapshotDate.toISOString().slice(0, 10);
      if (!byDate.has(d)) byDate.set(d, { zSum: 0, count: 0 });
      const entry = byDate.get(d)!;
      if (s.zVsControl !== null) { entry.zSum += s.zVsControl; entry.count++; }
    }

    const signs = [...byDate.values()].map((e) => (e.count > 0 ? Math.sign(e.zSum) : 0));
    if (signs.length < 3) return signs.length;

    const lastSign = signs[0];
    let stable = 0;
    for (const s of signs) {
      if (s === lastSign && s !== 0) stable++;
      else break;
    }
    return stable;
  }
}
