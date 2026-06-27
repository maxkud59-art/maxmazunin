import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { createAiFinanceClient, AiFinanceClaudeClient } from '../claude.client';
import { matchRules } from './rule-engine';
import { buildClassifySystemPrompt, buildClassifyUserMessage } from '../prompts/classify.prompt';
import { FinProject, AccountingEffect } from '@prisma/client';

const RULE_MIN_CONFIDENCE = parseFloat(process.env.AI_FINANCE_RULE_MIN_CONFIDENCE ?? '0.8');

@Injectable()
export class ClassifyService {
  private readonly logger = new Logger(ClassifyService.name);
  private readonly claude: AiFinanceClaudeClient;

  constructor(private readonly prisma: PrismaService) {
    this.claude = createAiFinanceClient();
  }

  async classifyOperation(operationId: string) {
    const op = await this.prisma.finOperation.findUnique({ where: { id: operationId } });
    if (!op) throw new NotFoundException('Операция не найдена');

    // AI не трогает уже категоризированные операции (требование безопасности).
    if (op.categoryId && op.aiCategorized) {
      throw new BadRequestException('Операция уже категоризирована AI');
    }

    const rules = await this.prisma.categorizationRule.findMany({ where: { isActive: true } });
    const match = matchRules(op, rules);

    if (match && match.rule.confidence * match.score >= RULE_MIN_CONFIDENCE) {
      // Детерминированный матч — авто-применяем
      const suggestion = await this.prisma.aiFinSuggestion.create({
        data: {
          operationId,
          categoryId: match.rule.categoryId,
          projectId: match.rule.projectId,
          effect: match.rule.effect,
          status: 'CONFIRMED',
          confidence: match.rule.confidence * match.score,
          rationale: `Правило: ${match.rule.matchType}="${match.rule.pattern}"`,
          ruleId: match.rule.id,
          model: 'rule',
          decidedAt: new Date(),
        },
      });

      await this._applyToOperation(operationId, {
        categoryId: match.rule.categoryId,
        project: match.rule.projectId as FinProject | null,
        effect: match.rule.effect,
      });

      await this.prisma.categorizationRule.update({
        where: { id: match.rule.id },
        data: { hitCount: { increment: 1 } },
      });

      return { ...suggestion, autoApplied: true };
    }

    // Нет правила — спрашиваем AI
    const categories = await this.prisma.finCategory.findMany({
      where: { archived: false },
      select: { id: true, name: true, type: true, isPnl: true },
    });

    const system = buildClassifySystemPrompt(categories);
    const userMsg = buildClassifyUserMessage(op);

    let aiResult;
    try {
      aiResult = await this.claude.classify(system, userMsg);
    } catch (err: any) {
      this.logger.error('Claude classify error', err?.message);
      aiResult = { categoryId: null, project: null, effect: 'DDS_ONLY' as AccountingEffect, confidence: 0, rationale: 'AI ошибка', model: 'error' };
    }

    const suggestion = await this.prisma.aiFinSuggestion.create({
      data: {
        operationId,
        categoryId: aiResult.categoryId,
        projectId: aiResult.project,
        effect: aiResult.effect,
        status: 'PROPOSED',
        confidence: aiResult.confidence,
        rationale: aiResult.rationale,
        model: aiResult.model,
      },
    });

    return { ...suggestion, autoApplied: false };
  }

  async classifyBatch(limit = 50) {
    const ops = await this.prisma.finOperation.findMany({
      where: { categoryId: null },
      take: limit,
      orderBy: { date: 'desc' },
    });

    let processed = 0;
    let autoApplied = 0;
    let proposed = 0;

    for (const op of ops) {
      try {
        const result = await this.classifyOperation(op.id);
        processed++;
        if ((result as any).autoApplied) autoApplied++;
        else proposed++;
      } catch {
        // Skip errors in batch — individual logs
      }
    }

    return { processed, autoApplied, proposed };
  }

  async getUncategorized(limit = 50) {
    return this.prisma.finOperation.findMany({
      where: { categoryId: null },
      orderBy: { date: 'desc' },
      take: limit,
      include: { account: true },
    });
  }

  private async _applyToOperation(
    operationId: string,
    data: { categoryId: string; project: FinProject | null; effect: AccountingEffect },
  ) {
    await this.prisma.finOperation.update({
      where: { id: operationId },
      data: {
        categoryId: data.categoryId,
        project: data.project ?? undefined,
        effect: data.effect,
        aiCategorized: true,
        isPnl: data.effect === 'DDS_AND_PNL',
      },
    });
  }

  async getRules() {
    return this.prisma.categorizationRule.findMany({
      where: { isActive: true },
      orderBy: [{ hitCount: 'desc' }, { createdAt: 'desc' }],
    });
  }

  // Вызывается из LearningService после confirm — применяет к операции.
  async applyConfirmedSuggestion(
    operationId: string,
    categoryId: string,
    project: FinProject | null,
    effect: AccountingEffect,
  ) {
    await this._applyToOperation(operationId, { categoryId, project, effect });
  }
}
