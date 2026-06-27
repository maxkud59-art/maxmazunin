import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ClassifyService } from './classify.service';
import { FinProject } from '@prisma/client';

@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classify: ClassifyService,
  ) {}

  async confirmSuggestion(suggestionId: string, decidedById: string) {
    const suggestion = await this.prisma.aiFinSuggestion.findUnique({
      where: { id: suggestionId },
      include: { operation: true },
    });
    if (!suggestion) throw new NotFoundException('Предложение не найдено');
    if (suggestion.status !== 'PROPOSED') {
      throw new BadRequestException(`Предложение уже в статусе ${suggestion.status}`);
    }
    if (!suggestion.categoryId) {
      throw new BadRequestException('Нельзя подтвердить предложение без статьи (categoryId=null)');
    }

    // AI не может менять подтверждённые операции — только человек через этот flow.
    await this.classify.applyConfirmedSuggestion(
      suggestion.operationId,
      suggestion.categoryId,
      suggestion.projectId as FinProject | null,
      suggestion.effect ?? 'DDS_ONLY',
    );

    await this.prisma.aiFinSuggestion.update({
      where: { id: suggestionId },
      data: { status: 'CONFIRMED', decidedAt: new Date(), decidedById },
    });

    // Запомнить решение — создать/усилить правило (только если есть контрагент).
    const counterparty = suggestion.operation.counterparty;
    if (counterparty) {
      await this._upsertRule({
        pattern: counterparty,
        categoryId: suggestion.categoryId,
        projectId: suggestion.projectId,
        effect: suggestion.effect ?? 'DDS_ONLY',
        decidedById,
      });
    }

    return { ok: true };
  }

  async rejectSuggestion(suggestionId: string, decidedById: string) {
    const suggestion = await this.prisma.aiFinSuggestion.findUnique({ where: { id: suggestionId } });
    if (!suggestion) throw new NotFoundException('Предложение не найдено');
    if (suggestion.status !== 'PROPOSED') {
      throw new BadRequestException(`Предложение уже в статусе ${suggestion.status}`);
    }

    await this.prisma.aiFinSuggestion.update({
      where: { id: suggestionId },
      data: { status: 'REJECTED', decidedAt: new Date(), decidedById },
    });

    return { ok: true };
  }

  private async _upsertRule(data: {
    pattern: string;
    categoryId: string;
    projectId?: string | null;
    effect: any;
    decidedById: string;
  }) {
    const existing = await this.prisma.categorizationRule.findFirst({
      where: { matchType: 'counterparty', pattern: data.pattern, isActive: true },
    });

    if (existing) {
      await this.prisma.categorizationRule.update({
        where: { id: existing.id },
        data: {
          categoryId: data.categoryId,
          projectId: data.projectId,
          effect: data.effect,
          hitCount: { increment: 1 },
          confidence: Math.min(1.0, existing.confidence + 0.05),
          source: 'ai_confirmed',
        },
      });
    } else {
      await this.prisma.categorizationRule.create({
        data: {
          matchType: 'counterparty',
          pattern: data.pattern,
          categoryId: data.categoryId,
          projectId: data.projectId ?? null,
          effect: data.effect,
          source: 'ai_confirmed',
          confidence: 0.9,
          hitCount: 1,
          createdById: data.decidedById,
        },
      });
    }
  }
}
