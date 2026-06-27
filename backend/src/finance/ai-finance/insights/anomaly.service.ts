import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface AnomalyView {
  kind: 'duplicate' | 'outlier' | 'uncategorized_backlog' | 'counterparty_drift';
  severity: 'high' | 'medium' | 'low';
  description: string;
  operationIds: string[];
}

@Injectable()
export class AnomalyService {
  constructor(private readonly prisma: PrismaService) {}

  async detectAnomalies(): Promise<AnomalyView[]> {
    const anomalies: AnomalyView[] = [];

    await Promise.all([
      this._detectDuplicates(anomalies),
      this._detectOutliers(anomalies),
      this._detectUncategorizedBacklog(anomalies),
    ]);

    return anomalies;
  }

  private async _detectDuplicates(anomalies: AnomalyView[]) {
    const windowDays = 3;
    const since = new Date();
    since.setDate(since.getDate() - 90);

    const ops = await this.prisma.finOperation.findMany({
      where: { date: { gte: since }, counterparty: { not: null } },
      orderBy: { date: 'asc' },
    });

    const seen = new Map<string, typeof ops>();
    for (const op of ops) {
      const key = `${op.counterparty}|${op.amountKopecks}`;
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key)!.push(op);
    }

    for (const [, group] of seen) {
      if (group.length < 2) continue;
      // Check for operations within windowDays of each other
      for (let i = 0; i < group.length - 1; i++) {
        const a = group[i];
        const b = group[i + 1];
        const diffMs = Math.abs(b.date.getTime() - a.date.getTime());
        const diffDays = diffMs / 86400_000;
        if (diffDays <= windowDays) {
          const amount = (Math.abs(a.amountKopecks) / 100).toFixed(2);
          anomalies.push({
            kind: 'duplicate',
            severity: 'high',
            description: `Возможный дубль: ${a.counterparty} ${amount} руб., разница ${diffDays.toFixed(1)} дн.`,
            operationIds: [a.id, b.id],
          });
        }
      }
    }
  }

  private async _detectOutliers(anomalies: AnomalyView[]) {
    const since = new Date();
    since.setDate(since.getDate() - 90);

    const ops = await this.prisma.finOperation.findMany({
      where: { date: { gte: since }, categoryId: { not: null } },
    });

    // Группируем по categoryId, считаем среднее и стдотклонение
    const byCat: Record<string, number[]> = {};
    for (const op of ops) {
      const k = op.categoryId!;
      byCat[k] = byCat[k] ?? [];
      byCat[k].push(Math.abs(op.amountKopecks));
    }

    for (const [catId, amounts] of Object.entries(byCat)) {
      if (amounts.length < 5) continue;
      const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const std = Math.sqrt(amounts.map(a => (a - mean) ** 2).reduce((a, b) => a + b, 0) / amounts.length);
      const threshold = mean + 3 * std;

      const outliers = ops
        .filter(o => o.categoryId === catId && Math.abs(o.amountKopecks) > threshold)
        .map(o => o.id);

      if (outliers.length > 0) {
        anomalies.push({
          kind: 'outlier',
          severity: 'medium',
          description: `Выброс по статье: операция(и) более чем на 3σ от среднего (${(mean / 100).toFixed(0)} руб.)`,
          operationIds: outliers,
        });
      }
    }
  }

  private async _detectUncategorizedBacklog(anomalies: AnomalyView[]) {
    const count = await this.prisma.finOperation.count({ where: { categoryId: null } });
    if (count >= 10) {
      anomalies.push({
        kind: 'uncategorized_backlog',
        severity: count >= 50 ? 'high' : 'medium',
        description: `Бэклог незакатегоризированных операций: ${count} шт.`,
        operationIds: [],
      });
    }
  }
}
