import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { createAiFinanceClient } from '../claude.client';
import { buildInsightSystemPrompt, buildForecastUserMessage } from '../prompts/insight.prompt';

const HORIZON = parseInt(process.env.FORECAST_HORIZON_DAYS ?? '60', 10);

@Injectable()
export class ForecastService {
  private readonly claude = createAiFinanceClient();

  constructor(private readonly prisma: PrismaService) {}

  async cashflowForecast(horizonDays = HORIZON) {
    const historyFrom = new Date();
    historyFrom.setDate(historyFrom.getDate() - 90);

    const ops = await this.prisma.finOperation.findMany({
      where: { date: { gte: historyFrom }, effect: { not: 'NEUTRAL' } },
      include: { category: true },
    });

    // Среднее в неделю по типу (доход/расход)
    const incomePerWeek = ops
      .filter(o => o.type === 'INCOME')
      .reduce((s, o) => s + o.amountKopecks, 0) / 13 / 100;

    const expensePerWeek = ops
      .filter(o => o.type === 'EXPENSE')
      .reduce((s, o) => s + Math.abs(o.amountKopecks), 0) / 13 / 100;

    const weeks = Math.ceil(horizonDays / 7);
    const weeklyForecast = Array.from({ length: weeks }, (_, i) => {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() + i * 7);
      return {
        weekStart: weekStart.toISOString().slice(0, 10),
        expectedIncomeRub: +incomePerWeek.toFixed(2),
        expectedExpenseRub: +expensePerWeek.toFixed(2),
        netRub: +(incomePerWeek - expensePerWeek).toFixed(2),
        optimisticNetRub: +((incomePerWeek * 1.2) - expensePerWeek).toFixed(2),
        pessimisticNetRub: +((incomePerWeek * 0.7) - expensePerWeek * 1.1).toFixed(2),
      };
    });

    const assumptions = [
      'Базируется на средних за последние 90 дней',
      'Не учитывает сезонность и разовые платежи',
      'Не учитывает открытый пайплайн заказов в статусе PREPAY',
    ];

    const payload = {
      estimate: true,
      horizonDays,
      generatedAt: new Date().toISOString(),
      weeklyForecast,
      assumptions,
    };

    let commentary = '';
    try {
      commentary = await this.claude.text(buildInsightSystemPrompt(), buildForecastUserMessage(payload));
    } catch {
      commentary = 'AI-комментарий недоступен.';
    }

    await this.prisma.aiFinInsight.create({
      data: {
        kind: 'cashflow_forecast',
        periodFrom: new Date(),
        periodTo: new Date(Date.now() + horizonDays * 86400_000),
        payload: { ...payload, commentary } as any,
        model: 'forecast',
      },
    });

    return { ...payload, commentary };
  }

  async pnlForecast(horizonDays = HORIZON) {
    // Прогноз ПНЛ по заказам в пайплайне (PREPAY / PAID_50).
    const pipeline = await this.prisma.finOrder.findMany({
      where: { status: { in: ['PREPAY', 'PAID_50'] }, archived: false },
    });

    const totalPipelineRub = pipeline.reduce((s, o) => s + o.totalAmountKopecks, 0) / 100;

    // История: средний срок от создания до SHIPPED (~30 дней, как эвристика)
    const avgDaysToShip = 30;
    const expectedRevenueRub = totalPipelineRub;

    // Исторические расходы за последние 90 дней → прогноз
    const histFrom = new Date();
    histFrom.setDate(histFrom.getDate() - 90);
    const accruals = await this.prisma.accrualEntry.findMany({
      where: { period: { gte: histFrom }, type: 'OPEX' },
    });
    const opexPerDay = accruals.reduce((s, a) => s + Math.abs(a.amountKopecks), 0) / 90 / 100;
    const expectedOpexRub = +(opexPerDay * horizonDays).toFixed(2);
    const expectedProfitRub = +(expectedRevenueRub - expectedOpexRub).toFixed(2);

    const assumptions = [
      `Пайплайн: ${pipeline.length} заказов на сумму ${totalPipelineRub.toFixed(2)} руб.`,
      `Ожидаемый срок выдачи ~${avgDaysToShip} дней (эвристика)`,
      'Расходы — экстраполяция средних из последних 90 дней',
      'Не учитывает новые заказы, которые поступят в горизонте прогноза',
    ];

    const payload = {
      estimate: true,
      horizonDays,
      generatedAt: new Date().toISOString(),
      pipelineOrdersCount: pipeline.length,
      expectedRevenueRub,
      expectedOpexRub,
      expectedProfitRub,
      assumptions,
    };

    let commentary = '';
    try {
      commentary = await this.claude.text(buildInsightSystemPrompt(), buildForecastUserMessage(payload));
    } catch {
      commentary = 'AI-комментарий недоступен.';
    }

    await this.prisma.aiFinInsight.create({
      data: {
        kind: 'pnl_forecast',
        periodFrom: new Date(),
        periodTo: new Date(Date.now() + horizonDays * 86400_000),
        payload: { ...payload, commentary } as any,
        model: 'pnl_forecast',
      },
    });

    return { ...payload, commentary };
  }
}
