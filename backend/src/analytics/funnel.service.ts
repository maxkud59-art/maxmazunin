import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DialogStage, ObjectionType } from '@prisma/client';

const STAGE_ORDER: DialogStage[] = [
  'CONTACT', 'REPLIED', 'PRICE_SHOWN', 'OBJECTION',
  'REBUTTAL', 'ORDERED', 'PREPAID', 'PAID_FULL',
];

export interface FunnelStage {
  stage: DialogStage;
  count: number;
  convFromPrev: number | null;
  convFromTop: number | null;
  dropCount: number;
  dropPct: number | null;
}

export interface FunnelBreakdown {
  key: string;
  label: string;
  stageCounts: Record<string, number>;
  convToPaid: number | null;
}

export interface FunnelReport {
  stages: FunnelStage[];
  objections: { type: ObjectionType; count: number }[];
  ctaImpact: { withCTA: number; withoutCTA: number; convWithCTA: number; convWithoutCTA: number };
  dayInDay: { yes: number; no: number; convYes: number; convNo: number };
  byManager: FunnelBreakdown[];
  total: number;
}

@Injectable()
export class FunnelService {
  constructor(private readonly prisma: PrismaService) {}

  async report(params: { from?: string; to?: string; managerId?: string }): Promise<FunnelReport> {
    const where: any = {};
    if (params.managerId) where.managerId = params.managerId;
    if (params.from || params.to) {
      where.createdAt = {};
      if (params.from) where.createdAt.gte = new Date(params.from);
      if (params.to) where.createdAt.lte = new Date(params.to);
    }

    const analyses = await this.prisma.dialogAnalysis.findMany({ where });
    const total = analyses.length;

    // Воронка по reachedStage
    const stageCounts: Record<string, number> = {};
    for (const s of STAGE_ORDER) stageCounts[s] = 0;
    for (const a of analyses) stageCounts[a.reachedStage]++;

    const stages: FunnelStage[] = STAGE_ORDER.map((stage, i) => {
      const count = stageCounts[stage] ?? 0;
      const topCount = stageCounts[STAGE_ORDER[0]];
      const prevCount = i > 0 ? (stageCounts[STAGE_ORDER[i - 1]] ?? 0) : null;
      const nextCount = i < STAGE_ORDER.length - 1 ? (stageCounts[STAGE_ORDER[i + 1]] ?? 0) : 0;

      const dropCount = count - nextCount;
      const dropPct = count > 0 ? (dropCount / count) * 100 : null;
      const convFromPrev = prevCount !== null && prevCount > 0 ? (count / prevCount) * 100 : null;
      const convFromTop = topCount > 0 ? (count / topCount) * 100 : null;

      return { stage, count, convFromPrev, convFromTop, dropCount, dropPct };
    });

    // Возражения
    const objectionCounts = new Map<ObjectionType, number>();
    for (const a of analyses) {
      if (a.objectionType !== 'NONE') {
        objectionCounts.set(a.objectionType, (objectionCounts.get(a.objectionType) ?? 0) + 1);
      }
    }
    const objections = [...objectionCounts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);

    // CTA-влияние
    const withCTA = analyses.filter((a) => a.hadCTA);
    const withoutCTA = analyses.filter((a) => !a.hadCTA);
    const ctaImpact = {
      withCTA: withCTA.length,
      withoutCTA: withoutCTA.length,
      convWithCTA: withCTA.length > 0 ? (withCTA.filter((a) => a.reachedStage === 'PAID_FULL').length / withCTA.length) * 100 : 0,
      convWithoutCTA: withoutCTA.length > 0 ? (withoutCTA.filter((a) => a.reachedStage === 'PAID_FULL').length / withoutCTA.length) * 100 : 0,
    };

    // День в день
    const yesGroup = analyses.filter((a) => a.dayInDay);
    const noGroup = analyses.filter((a) => !a.dayInDay);
    const dayInDay = {
      yes: yesGroup.length,
      no: noGroup.length,
      convYes: yesGroup.length > 0 ? (yesGroup.filter((a) => a.reachedStage === 'PAID_FULL').length / yesGroup.length) * 100 : 0,
      convNo: noGroup.length > 0 ? (noGroup.filter((a) => a.reachedStage === 'PAID_FULL').length / noGroup.length) * 100 : 0,
    };

    // По менеджерам
    const managerMap = new Map<string, typeof analyses>();
    for (const a of analyses) {
      const mgr = a.managerId ?? 'unknown';
      if (!managerMap.has(mgr)) managerMap.set(mgr, []);
      managerMap.get(mgr)!.push(a);
    }
    const byManager: FunnelBreakdown[] = [...managerMap.entries()].map(([key, items]) => {
      const sc: Record<string, number> = {};
      for (const s of STAGE_ORDER) sc[s] = 0;
      for (const a of items) sc[a.reachedStage]++;
      const paid = sc['PAID_FULL'] ?? 0;
      const contact = sc['CONTACT'] ?? 0;
      return {
        key, label: key,
        stageCounts: sc,
        convToPaid: contact > 0 ? (paid / contact) * 100 : null,
      };
    });

    return { stages, objections, ctaImpact, dayInDay, byManager, total };
  }
}
