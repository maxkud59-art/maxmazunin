import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { createAiFinanceClient } from '../claude.client';
import { buildInsightSystemPrompt, buildSummaryUserMessage } from '../prompts/insight.prompt';
import { FinProject } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  private readonly claude = createAiFinanceClient();

  constructor(private readonly prisma: PrismaService) {}

  async summary(from: Date, to: Date, project?: FinProject) {
    const where: any = { date: { gte: from, lte: to } };
    if (project) where.project = project;

    const ops = await this.prisma.finOperation.findMany({
      where,
      include: { category: true },
    });

    // ─── ДДС (кассовый метод) ────────────────────────────────────────────────
    let totalIncome = 0;
    let totalExpense = 0;
    const byCategory: Record<string, { name: string; total: number }> = {};

    for (const op of ops) {
      const amount = op.amountKopecks;
      if (['INCOME'].includes(op.type) && op.effect !== 'NEUTRAL') {
        totalIncome += amount;
      }
      if (['EXPENSE'].includes(op.type) && op.effect !== 'NEUTRAL') {
        totalExpense += Math.abs(amount);
      }
      if (op.category && op.effect !== 'NEUTRAL') {
        const k = op.category.id;
        byCategory[k] = byCategory[k] ?? { name: op.category.name, total: 0 };
        byCategory[k].total += Math.abs(amount);
      }
    }

    // ─── ПНЛ (начисление — по выдаче заказа) ────────────────────────────────
    const accrualWhere: any = { period: { gte: from, lte: to } };
    if (project) accrualWhere.project = project;

    const accruals = await this.prisma.accrualEntry.findMany({ where: accrualWhere });

    const pnlRevenue = accruals.filter(a => a.type === 'REVENUE').reduce((s, a) => s + a.amountKopecks, 0);
    const pnlRefund = accruals.filter(a => a.type === 'REFUND').reduce((s, a) => s + a.amountKopecks, 0);
    const pnlOpex = accruals.filter(a => a.type === 'OPEX').reduce((s, a) => s + Math.abs(a.amountKopecks), 0);

    const netRevenue = pnlRevenue - pnlRefund;
    const grossProfit = netRevenue - pnlOpex;
    const margin = netRevenue > 0 ? ((grossProfit / netRevenue) * 100).toFixed(1) : '0.0';

    const topCategories = Object.values(byCategory)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map(c => ({ name: c.name, totalRub: c.total / 100 }));

    const summary = {
      periodFrom: from.toISOString().slice(0, 10),
      periodTo: to.toISOString().slice(0, 10),
      project: project ?? 'ALL',
      dds: {
        totalIncomeRub: totalIncome / 100,
        totalExpenseRub: totalExpense / 100,
        netCashFlowRub: (totalIncome - totalExpense) / 100,
      },
      pnl: {
        netRevenueRub: netRevenue / 100,
        pnlOpexRub: pnlOpex / 100,
        grossProfitRub: grossProfit / 100,
        marginPercent: parseFloat(margin),
      },
      topCategories,
      totalOperations: ops.length,
    };

    let commentary = '';
    try {
      commentary = await this.claude.text(buildInsightSystemPrompt(), buildSummaryUserMessage(summary));
    } catch {
      commentary = 'AI-комментарий недоступен.';
    }

    await this.prisma.aiFinInsight.create({
      data: {
        kind: 'summary',
        periodFrom: from,
        periodTo: to,
        projectId: project ?? null,
        payload: { ...summary, commentary } as any,
        model: 'analytics',
      },
    });

    return { ...summary, commentary };
  }
}
