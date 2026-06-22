import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createLlmClient, LlmClient } from './llm-client';
import { prefilterTranscript } from './prefilter';
import { ANALYSIS_VERSION } from './prompt';

const QA_SAMPLE_PCT = parseInt(process.env.QA_SAMPLE_PCT ?? '3', 10);
const DAILY_BUDGET = parseInt(process.env.DAILY_LLM_BUDGET ?? '1000', 10);

@Injectable()
export class DialogAnalysisService {
  private readonly logger = new Logger(DialogAnalysisService.name);
  private llm: LlmClient;

  constructor(private readonly prisma: PrismaService) {
    this.llm = createLlmClient();
  }

  // Возвращает true если дневной бюджет не исчерпан.
  private async checkBudget(): Promise<boolean> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const log = await this.prisma.llmBudgetLog.upsert({
      where: { date: today },
      create: { date: today, calls: 0, budget: DAILY_BUDGET, stopped: false },
      update: {},
    });
    if (log.stopped || log.calls >= DAILY_BUDGET) {
      this.logger.warn(`Daily LLM budget exhausted (${log.calls}/${DAILY_BUDGET})`);
      return false;
    }
    return true;
  }

  private async incrementBudget(): Promise<void> {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await this.prisma.llmBudgetLog.upsert({
      where: { date: today },
      create: { date: today, calls: 1, budget: DAILY_BUDGET, stopped: false },
      update: { calls: { increment: 1 } },
    });
  }

  // Размечает один диалог. Идемпотентен по (conversationId, analysisVersion).
  async analyzeConversation(conversationId: string): Promise<void> {
    const existing = await this.prisma.dialogAnalysis.findUnique({
      where: { conversationId_analysisVersion: { conversationId, analysisVersion: ANALYSIS_VERSION } },
    });
    if (existing) return;

    const conv = await this.prisma.vkConversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' } }, client: { include: { orders: { orderBy: { createdAt: 'desc' }, take: 1 } } } },
    });
    if (!conv) return;

    const clientMessages = conv.messages.filter((m) => m.direction === 'IN').map((m) => m.text);
    const managerMessages = conv.messages.filter((m) => m.direction === 'OUT').map((m) => m.text);

    // Связанный заказ и менеджер (если есть)
    const latestOrder = conv.client?.orders?.[0] ?? null;
    const managerId = latestOrder?.managerId ?? null;

    // Prefilter
    const prefilteredResult = prefilterTranscript(conversationId, clientMessages, managerMessages, QA_SAMPLE_PCT);

    let result = prefilteredResult;

    if (!result) {
      const ok = await this.checkBudget();
      if (!ok) {
        this.logger.warn(`Skipping ${conversationId}: budget exhausted`);
        return;
      }
      const transcript = conv.messages
        .map((m) => `[${m.direction === 'IN' ? 'Клиент' : 'Менеджер'}]: ${m.text}`)
        .join('\n');
      try {
        result = await this.llm.analyzeDialog(conversationId, transcript);
        await this.incrementBudget();
      } catch (err: any) {
        this.logger.error(`LLM failed for ${conversationId}: ${err.message}`);
        result = {
          reachedStage: 'CONTACT', deathStage: 'CONTACT', objectionType: 'NONE',
          dayInDay: false, hadCTA: false, confidence: 0, needsReview: true, model: 'error',
        };
      }
    }

    await this.prisma.dialogAnalysis.upsert({
      where: { conversationId_analysisVersion: { conversationId, analysisVersion: ANALYSIS_VERSION } },
      create: {
        conversationId,
        orderId: latestOrder?.id ?? undefined,
        managerId: managerId ?? undefined,
        reachedStage: result.reachedStage,
        deathStage: result.deathStage ?? undefined,
        objectionType: result.objectionType,
        dayInDay: result.dayInDay,
        hadCTA: result.hadCTA,
        confidence: result.confidence,
        analysisVersion: ANALYSIS_VERSION,
        model: result.model,
        needsReview: result.needsReview,
      },
      update: {
        reachedStage: result.reachedStage,
        deathStage: result.deathStage ?? undefined,
        objectionType: result.objectionType,
        dayInDay: result.dayInDay,
        hadCTA: result.hadCTA,
        confidence: result.confidence,
        model: result.model,
        needsReview: result.needsReview,
        orderId: latestOrder?.id ?? undefined,
        managerId: managerId ?? undefined,
      },
    });
  }

  // Размечает пачку диалогов без DialogAnalysis.
  async processBatch(limit = 50): Promise<number> {
    const existing = await this.prisma.dialogAnalysis.findMany({
      where: { analysisVersion: ANALYSIS_VERSION },
      select: { conversationId: true },
    });
    const existingIds = new Set(existing.map((e) => e.conversationId));

    const conversations = await this.prisma.vkConversation.findMany({
      where: { id: { notIn: [...existingIds] } },
      orderBy: { lastMessageAt: 'desc' },
      take: limit,
      select: { id: true },
    });

    let processed = 0;
    const concurrency = parseInt(process.env.LLM_CONCURRENCY ?? '3', 10);
    for (let i = 0; i < conversations.length; i += concurrency) {
      const batch = conversations.slice(i, i + concurrency);
      await Promise.all(batch.map((c) => this.analyzeConversation(c.id)));
      processed += batch.length;
    }
    return processed;
  }

  async getStats() {
    const total = await this.prisma.dialogAnalysis.count();
    const byStage = await this.prisma.dialogAnalysis.groupBy({ by: ['reachedStage'], _count: true });
    return { total, byStage };
  }
}
