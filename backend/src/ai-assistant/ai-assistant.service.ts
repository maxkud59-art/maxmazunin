import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SlaService } from './sla.service';
import { GuardrailsService } from './guardrails.service';
import { createClaudeClient, ClaudeClient } from './claude.client';
import { AiActionType, LifecycleStage } from '@prisma/client';

@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);
  private readonly claude: ClaudeClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sla: SlaService,
    private readonly guardrails: GuardrailsService,
  ) {
    this.claude = createClaudeClient();
  }

  async listConversations(limit = 100) {
    return this.prisma.vkConversation.findMany({
      orderBy: { lastMessageAt: 'desc' },
      take: limit,
      select: {
        id: true,
        peerId: true,
        clientName: true,
        lastMessageText: true,
        lastMessageAt: true,
        lifecycleStage: true,
        assignedManagerId: true,
        unreadCount: true,
      },
    });
  }

  async getConversationPanel(conversationId: string) {
    const conv = await this.prisma.vkConversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 100 },
        slaTrackers: { where: { closedAt: null }, include: { policy: true } },
        aiActions: { where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 10 },
        internalNotes: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!conv) throw new NotFoundException('Диалог не найден');
    return conv;
  }

  async setLifecycleStage(
    conversationId: string,
    newStage: LifecycleStage,
    managerId: string,
  ) {
    const conv = await this.prisma.vkConversation.findUnique({ where: { id: conversationId } });
    if (!conv) throw new NotFoundException('Диалог не найден');

    const prevStage = conv.lifecycleStage;

    await this.prisma.vkConversation.update({
      where: { id: conversationId },
      data: { lifecycleStage: newStage, assignedManagerId: managerId },
    });

    if (prevStage) {
      await this.sla.closeTrackers(conversationId, newStage);
    }
    await this.sla.openTracker(conversationId, newStage, this.nextExpectedStage(newStage));

    return { ok: true };
  }

  async requestCoaching(conversationId: string) {
    const conv = await this.prisma.vkConversation.findUnique({
      where: { id: conversationId },
      include: { messages: { orderBy: { createdAt: 'asc' }, take: 80 } },
    });
    if (!conv) throw new NotFoundException('Диалог не найден');

    const transcript = conv.messages
      .map(m => `[${m.direction === 'OUT' ? 'Мен.' : 'Кл.'}] ${m.text ?? ''}`)
      .join('\n');

    const context = `Стадия: ${conv.lifecycleStage ?? 'неизвестна'}. Клиент: ${conv.clientName}.`;

    const result = await this.claude.coachConversation(transcript, context);
    result.suggestions = this.guardrails.filterSuggestions(result.suggestions);

    if (result.suggestedReply) {
      await this.prisma.aiAction.create({
        data: {
          conversationId,
          type: AiActionType.SUGGEST_REPLY,
          payload: { text: result.suggestedReply },
          reasoning: result.reasoning,
          expiresAt: new Date(Date.now() + 2 * 3600_000),
        },
      });
    }

    for (const alert of result.riskAlerts) {
      await this.prisma.aiAction.create({
        data: {
          conversationId,
          type: AiActionType.RISK_ALERT,
          payload: { alert },
          reasoning: result.reasoning,
          expiresAt: new Date(Date.now() + 24 * 3600_000),
        },
      });
    }

    return result;
  }

  async reviewAction(actionId: string, decision: 'APPROVED' | 'REJECTED', reviewerId: string) {
    const action = await this.prisma.aiAction.findUnique({ where: { id: actionId } });
    if (!action) throw new NotFoundException('Действие не найдено');

    return this.prisma.aiAction.update({
      where: { id: actionId },
      data: { status: decision === 'APPROVED' ? 'APPROVED' : 'REJECTED', reviewedBy: reviewerId, reviewedAt: new Date() },
    });
  }

  async addNote(conversationId: string, authorId: string, body: string) {
    return this.prisma.internalNote.create({
      data: { conversationId, authorId, body },
    });
  }

  async listNotes(conversationId: string) {
    return this.prisma.internalNote.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPendingActions(conversationId: string) {
    await this.expireOldActions();
    return this.prisma.aiAction.findMany({
      where: { conversationId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async expireOldActions() {
    await this.prisma.aiAction.updateMany({
      where: { status: 'PENDING', expiresAt: { lt: new Date() } },
      data: { status: 'EXPIRED' },
    });
  }

  // Следующая ожидаемая стадия (для SLA-трекинга).
  private nextExpectedStage(current: LifecycleStage): LifecycleStage {
    const flow: Record<LifecycleStage, LifecycleStage> = {
      NEW_LEAD: 'PRICE_SENT',
      PRICE_SENT: 'OFORMLENO',
      OFORMLENO: 'OPLACHENO',
      IN_PRODUCTION: 'READY_TO_SHIP',
      READY_TO_SHIP: 'SHIPPED',
      SHIPPED: 'DELIVERED',
      DELIVERED: 'OPLACHENO',
      OPLACHENO: 'OPLACHENO',
      CLOSED_LOST: 'CLOSED_LOST',
    };
    return flow[current] ?? current;
  }
}
