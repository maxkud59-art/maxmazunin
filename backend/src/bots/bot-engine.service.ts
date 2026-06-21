import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { VkMessengerClient } from '../assistant/vk-messenger.client';
import { BotType, BotStepType, ScenarioStateStatus, Bot, BotStep } from '@prisma/client';

export interface VkEvent {
  type: 'message_new' | 'message_event' | 'message_allow' | 'message_deny';
  peerId: number;
  text?: string;
  payload?: any;
  attachments?: any[];
  eventId?: string;
  refParam?: string;
}

type BotWithSteps = Bot & { steps: BotStep[] };

@Injectable()
export class BotEngineService {
  private readonly logger = new Logger(BotEngineService.name);
  // Idempotency: track recently processed event IDs (vkMessageId or eventId)
  private readonly processedIds = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly vk: VkMessengerClient,
  ) {}

  /** Entry point: called by VkBotLongPollService for each VK event */
  async handleEvent(ev: VkEvent): Promise<void> {
    // Dedup: skip if already processed this event (prevent double-processing on ts-failed reconnect)
    const dedupeKey = `${ev.type}:${ev.peerId}:${ev.eventId ?? ev.text?.slice(0, 20) ?? ''}:${Date.now()}`;
    if (this.processedIds.has(dedupeKey)) return;
    this.processedIds.add(dedupeKey);
    // Keep set small
    if (this.processedIds.size > 500) {
      const iter = this.processedIds.values();
      for (let i = 0; i < 100; i++) this.processedIds.delete(iter.next().value!);
    }

    try {
      await this._dispatch(ev);
    } catch (err: any) {
      this.logger.error('BotEngine error for event %s peerId=%d: %s', ev.type, ev.peerId, err.message);
    }
  }

  private async _dispatch(ev: VkEvent) {
    const bots = await this.prisma.bot.findMany({
      where: { enabled: true, archived: false },
      include: { steps: { orderBy: { position: 'asc' } } },
    });
    if (!bots.length) return;

    // Resolve or create VkClient for this peerId
    const client = await this._resolveClient(ev.peerId);

    for (const bot of bots) {
      try {
        if (bot.type === BotType.RULE) {
          await this._executeRule(bot, ev, client);
        } else {
          await this._executeScenario(bot, ev, client);
        }
      } catch (err: any) {
        this.logger.error('Bot %s (%s) error: %s', bot.name, bot.id, err.message);
        await this._log(bot.id, client?.id, ev.type, 'execute', `ERROR: ${err.message}`);
      }
    }
  }

  // ─── RULE execution ──────────────────────────────────────────────────────────

  private async _executeRule(bot: BotWithSteps, ev: VkEvent, client: any) {
    const triggers = bot.steps.filter((s) => s.type === BotStepType.TRIGGER);
    const actions = bot.steps.filter((s) => s.type !== BotStepType.TRIGGER);

    const matched = triggers.some((t) => this._matchTrigger(t, ev));
    if (!matched) return;

    this.logger.log('Rule bot "%s" matched event %s for peerId=%d', bot.name, ev.type, ev.peerId);
    await this._log(bot.id, client?.id, ev.type, 'rule_match', `Matched ${triggers.length} triggers`);

    for (const step of actions.sort((a, b) => a.position - b.position)) {
      await this._executeStep(bot, step, ev, client, {});
    }
  }

  // ─── SCENARIO execution ───────────────────────────────────────────────────────

  private async _executeScenario(bot: BotWithSteps, ev: VkEvent, client: any) {
    if (!client) return;

    // 1. Check if client has active state in this scenario waiting for input (button/message)
    const activeState = await this.prisma.clientScenarioState.findFirst({
      where: {
        clientId: client.id,
        botId: bot.id,
        status: ScenarioStateStatus.ACTIVE,
      },
    });

    if (activeState?.currentStepId) {
      const currentStep = bot.steps.find((s) => s.id === activeState.currentStepId);
      if (currentStep && (currentStep.type === BotStepType.CONDITION || ev.type === 'message_event')) {
        await this._continueScenario(bot, activeState, currentStep, ev, client);
        return;
      }
    }

    // 2. Check triggers — start scenario for this client if no active state
    if (activeState) return; // already in scenario, don't restart

    const triggers = bot.steps.filter((s) => s.type === BotStepType.TRIGGER);
    const matched = triggers.some((t) => this._matchTrigger(t, ev));
    if (!matched) return;

    // Find first non-trigger step
    const nonTriggers = bot.steps.filter((s) => s.type !== BotStepType.TRIGGER).sort((a, b) => a.position - b.position);
    if (!nonTriggers.length) return;

    const firstStep = nonTriggers[0];
    const state = await this.prisma.clientScenarioState.create({
      data: {
        clientId: client.id,
        botId: bot.id,
        currentStepId: firstStep.id,
        status: ScenarioStateStatus.ACTIVE,
      },
    });

    this.logger.log('Scenario "%s" started for peerId=%d', bot.name, ev.peerId);
    await this._log(bot.id, client.id, ev.type, 'scenario_start', `Step: ${firstStep.type}`);
    await this._runScenarioFrom(bot, state, firstStep, ev, client, {});
  }

  private async _continueScenario(bot: BotWithSteps, state: any, currentStep: BotStep, ev: VkEvent, client: any) {
    const cfg = (currentStep.config as any) ?? {};
    const branches: any[] = (currentStep.branches as any[]) ?? [];
    let nextStepId: string | null = currentStep.nextStepId ?? null;

    if (currentStep.type === BotStepType.CONDITION) {
      // Evaluate which branch to take
      for (const branch of branches) {
        if (this._evalCondition(branch.condition, ev, client)) {
          nextStepId = branch.stepId;
          break;
        }
      }
      // default branch
      if (nextStepId === currentStep.nextStepId) {
        const defaultBranch = branches.find((b) => b.isDefault);
        if (defaultBranch) nextStepId = defaultBranch.stepId;
      }
    } else if (ev.type === 'message_event') {
      // Button click — find branch matching payload
      const payload = ev.payload;
      const matchBranch = branches.find((b) => b.payload && JSON.stringify(b.payload) === JSON.stringify(payload));
      if (matchBranch) nextStepId = matchBranch.stepId;
    }

    if (!nextStepId) {
      await this._finishScenario(state);
      return;
    }

    const nextStep = bot.steps.find((s) => s.id === nextStepId);
    if (!nextStep) {
      await this._finishScenario(state);
      return;
    }

    await this.prisma.clientScenarioState.update({
      where: { id: state.id },
      data: { currentStepId: nextStepId },
    });

    await this._runScenarioFrom(bot, state, nextStep, ev, client, (state.vars as any) ?? {});
  }

  private async _runScenarioFrom(bot: BotWithSteps, state: any, step: BotStep, ev: VkEvent, client: any, vars: Record<string, any>) {
    let currentStep: BotStep | undefined = step;

    while (currentStep) {
      if (currentStep.type === BotStepType.DELAY) {
        const cfg = (currentStep.config as any) ?? {};
        const ms = this._delayToMs(cfg.value ?? 1, cfg.unit ?? 'minutes');
        await this.prisma.clientScenarioState.update({
          where: { id: state.id },
          data: {
            status: ScenarioStateStatus.WAITING_DELAY,
            scheduledAt: new Date(Date.now() + ms),
            currentStepId: currentStep.nextStepId ?? null,
            vars,
          },
        });
        return;
      }

      if (currentStep.type === BotStepType.CONDITION) {
        // Pause here — wait for next event to evaluate condition
        await this.prisma.clientScenarioState.update({
          where: { id: state.id },
          data: { currentStepId: currentStep.id, vars },
        });
        return;
      }

      if (currentStep.type === BotStepType.END_SCENARIO) {
        await this._finishScenario(state);
        return;
      }

      if (currentStep.type === BotStepType.UNSUBSCRIBE) {
        await this._finishScenario(state);
        return;
      }

      if (currentStep.type === BotStepType.GOTO_STEP) {
        const cfg = (currentStep.config as any) ?? {};
        const target = bot.steps.find((s) => s.id === cfg.stepId);
        currentStep = target;
        continue;
      }

      // Execute the action step
      const newVars = await this._executeStep(bot, currentStep, ev, client, vars);
      if (newVars) Object.assign(vars, newVars);

      // Advance
      const nextId = currentStep.nextStepId;
      currentStep = nextId ? bot.steps.find((s) => s.id === nextId) : undefined;
    }

    await this._finishScenario(state);
  }

  private async _finishScenario(state: any) {
    await this.prisma.clientScenarioState.update({
      where: { id: state.id },
      data: { status: ScenarioStateStatus.DONE },
    });
  }

  // ─── Cron: resume delayed scenario steps ─────────────────────────────────────

  @Cron('* * * * *') // every minute
  async resumeDelayedSteps() {
    const due = await this.prisma.clientScenarioState.findMany({
      where: {
        status: ScenarioStateStatus.WAITING_DELAY,
        scheduledAt: { lte: new Date() },
      },
      include: {
        bot: { include: { steps: { orderBy: { position: 'asc' } } } },
        client: true,
      },
      take: 50,
    });

    for (const state of due) {
      try {
        if (!state.currentStepId) {
          await this._finishScenario(state);
          continue;
        }
        const step = state.bot.steps.find((s) => s.id === state.currentStepId);
        if (!step) {
          await this._finishScenario(state);
          continue;
        }
        await this.prisma.clientScenarioState.update({
          where: { id: state.id },
          data: { status: ScenarioStateStatus.ACTIVE, scheduledAt: null },
        });
        const fakeEvent: VkEvent = { type: 'message_new', peerId: state.client.peerId };
        await this._runScenarioFrom(state.bot as any, state, step, fakeEvent, state.client, (state.vars as any) ?? {});
      } catch (err: any) {
        this.logger.error('Resume delayed step failed for state %s: %s', state.id, err.message);
      }
    }
  }

  // ─── Step executor ────────────────────────────────────────────────────────────

  private async _executeStep(bot: BotWithSteps, step: BotStep, ev: VkEvent, client: any, vars: Record<string, any>): Promise<Record<string, any> | undefined> {
    const cfg = (step.config as any) ?? {};
    const peerId = client?.peerId ?? ev.peerId;

    switch (step.type) {
      case BotStepType.SEND_MESSAGE: {
        const text = this._interpolate(cfg.text ?? '', client, vars);
        const attachment = this._resolveAttachment(cfg.attachment ?? '');
        const keyboard = cfg.keyboard ? JSON.stringify(cfg.keyboard) : undefined;
        if (text || attachment) {
          const params: Record<string, any> = { keyboard };
          await this.vk.sendMessage(peerId, text, attachment || undefined);
          // If callback keyboard: attachment field not used here, keyboard is separate
        }
        if (ev.type === 'message_event' && ev.eventId) {
          await this._sendEventAnswer(ev.eventId, peerId, ev.peerId);
        }
        await this._log(bot.id, client?.id, ev.type, 'send_message', `peerId=${peerId}`);
        break;
      }

      case BotStepType.SET_CRM_STATUS: {
        if (client && cfg.statusId) {
          await this.prisma.vkClient.update({
            where: { id: client.id },
            data: { crmStatusId: cfg.statusId },
          });
          await this._log(bot.id, client.id, ev.type, 'set_crm_status', cfg.statusId);
        }
        break;
      }

      case BotStepType.SET_TAGS: {
        if (client) {
          if (cfg.add?.length) {
            for (const tagId of cfg.add) {
              await this.prisma.clientTag.upsert({
                where: { clientId_tagId: { clientId: client.id, tagId } },
                create: { clientId: client.id, tagId },
                update: {},
              });
            }
          }
          if (cfg.remove?.length) {
            await this.prisma.clientTag.deleteMany({
              where: { clientId: client.id, tagId: { in: cfg.remove } },
            });
          }
          await this._log(bot.id, client.id, ev.type, 'set_tags', JSON.stringify(cfg));
        }
        break;
      }

      case BotStepType.SET_ORDER_STATUS: {
        if (client && cfg.statusId) {
          // Update latest non-archived order
          const order = await this.prisma.order.findFirst({
            where: { clientId: client.id, archived: false },
            orderBy: { createdAt: 'desc' },
          });
          if (order) {
            await this.prisma.order.update({ where: { id: order.id }, data: { orderStatusId: cfg.statusId } });
          }
          await this._log(bot.id, client?.id, ev.type, 'set_order_status', cfg.statusId);
        }
        break;
      }

      case BotStepType.MARK_IMPORTANT: {
        // VK doesn't have a native "mark important" in community messages — store as tag
        if (client) {
          const tag = await this.prisma.tag.findFirst({ where: { name: 'Важный', archived: false } });
          if (tag) {
            await this.prisma.clientTag.upsert({
              where: { clientId_tagId: { clientId: client.id, tagId: tag.id } },
              create: { clientId: client.id, tagId: tag.id },
              update: {},
            });
          }
        }
        break;
      }

      case BotStepType.EXTRACT_FIELD: {
        if (client && ev.text) {
          const field = cfg.field as string;
          const regex = cfg.regex ? new RegExp(cfg.regex) : this._defaultRegex(field);
          const match = ev.text.match(regex);
          if (match) {
            const value = match[1] ?? match[0];
            if (field === 'phone') await this.prisma.vkClient.update({ where: { id: client.id }, data: { phone: value } });
            else if (field === 'email') await this.prisma.vkClient.update({ where: { id: client.id }, data: { note: `email: ${value}` } });
            else if (field === 'startParam') vars['startParam'] = value;
            else vars[field] = value;
            await this._log(bot.id, client.id, ev.type, 'extract_field', `${field}=${value}`);
          }
        }
        return vars;
      }

      case BotStepType.SET_REMINDER: {
        if (client && cfg.days !== undefined) {
          const d = new Date();
          d.setDate(d.getDate() + (cfg.days ?? 1));
          await this.prisma.vkClient.update({ where: { id: client.id }, data: { note: `Напомнить: ${d.toLocaleDateString('ru')}` } });
        }
        break;
      }

      case BotStepType.NOTIFY_MANAGER: {
        if (cfg.message) {
          const text = this._interpolate(cfg.message, client, vars);
          this.logger.log('NOTIFY_MANAGER: %s', text);
          await this._log(bot.id, client?.id, ev.type, 'notify_manager', text);
        }
        break;
      }

      case BotStepType.ASSIGN_MANAGER: {
        if (client && cfg.managerId) {
          await this.prisma.vkClient.update({ where: { id: client.id }, data: { source: `manager:${cfg.managerId}` } });
        }
        break;
      }

      case BotStepType.LOG_STAT: {
        await this._log(bot.id, client?.id, ev.type, 'stat', JSON.stringify({ peerId, text: ev.text?.slice(0, 50) }));
        break;
      }
    }
    return undefined;
  }

  // ─── Trigger matching ─────────────────────────────────────────────────────────

  private _matchTrigger(trigger: BotStep, ev: VkEvent): boolean {
    const cfg = (trigger.config as any) ?? {};
    const expectedEvent = cfg.event ?? 'message_new';

    if (ev.type !== expectedEvent) return false;

    const filter = cfg.filter ?? {};

    // Direction filter (IN = incoming, OUT = from group)
    if (filter.direction === 'IN' && ev.type === 'message_new') {
      // incoming: from_id > 0 (user), peerId > 0
    }

    // Text matching
    if (ev.type === 'message_new' && ev.text !== undefined) {
      const text = ev.text.toLowerCase();

      if (filter.anyWords?.length) {
        const match = filter.anyWords.some((w: string) => text.includes(w.toLowerCase()));
        if (!match) return false;
      }

      if (filter.allWords?.length) {
        const match = filter.allWords.every((w: string) => text.includes(w.toLowerCase()));
        if (!match) return false;
      }

      if (filter.exact) {
        if (text.trim() !== filter.exact.toLowerCase().trim()) return false;
      }

      if (filter.regex) {
        try {
          if (!new RegExp(filter.regex, 'i').test(ev.text)) return false;
        } catch {
          return false;
        }
      }

      if (filter.hasAttachment && (!ev.attachments || !ev.attachments.length)) return false;
    }

    // Button payload
    if (ev.type === 'message_event' && filter.payload) {
      const payloadStr = typeof ev.payload === 'string' ? ev.payload : JSON.stringify(ev.payload);
      if (payloadStr !== filter.payload) return false;
    }

    // Command /start with param
    if (filter.command === 'start' && ev.text) {
      const match = ev.text.match(/^\/start\s*(.*)$/i);
      if (!match) return false;
      if (filter.startParam && match[1]?.trim() !== filter.startParam) return false;
    }

    return true;
  }

  private _evalCondition(condition: any, ev: VkEvent, client: any): boolean {
    if (!condition) return false;
    const { type, value } = condition;
    if (type === 'message_contains' && ev.text) return ev.text.toLowerCase().includes((value ?? '').toLowerCase());
    if (type === 'button_clicked') {
      const payloadStr = typeof ev.payload === 'string' ? ev.payload : JSON.stringify(ev.payload ?? {});
      return payloadStr.includes(value ?? '');
    }
    if (type === 'has_tag' && client?.tagLinks) return client.tagLinks.some((tl: any) => tl.tagId === value);
    return false;
  }

  // ─── Variable interpolation ───────────────────────────────────────────────────

  private _interpolate(text: string, client: any, vars: Record<string, any>): string {
    if (!text) return '';
    return text
      .replace(/\[Имя\]/g, client?.firstName ?? '')
      .replace(/\[Фамилия\]/g, client?.lastName ?? '')
      .replace(/\[Телефон\]/g, client?.phone ?? '')
      .replace(/\[Город\]/g, client?.city ?? '')
      .replace(/\[Статус\]/g, client?.crmStatus?.name ?? '')
      .replace(/\[startParam\]/g, vars['startParam'] ?? '')
      .replace(/\[([a-zA-Z0-9_]+)\]/g, (_, k) => vars[k] ?? '');
  }

  private _resolveAttachment(raw: string): string {
    // Pass VK attachment strings like photo123_456, video789_012 directly
    return raw.replace(/\[(photo[^]]+|video[^]]+|doc[^]]+|clip[^]]+)\]/g, '$1').trim();
  }

  private _defaultRegex(field: string): RegExp {
    if (field === 'phone') return /(\+?7[\s-]?\(?9\d{2}\)?[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2})/;
    if (field === 'email') return /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
    return /(.+)/;
  }

  private _delayToMs(value: number, unit: string): number {
    const multipliers: Record<string, number> = { seconds: 1000, minutes: 60_000, hours: 3_600_000, days: 86_400_000 };
    return value * (multipliers[unit] ?? 60_000);
  }

  // ─── VK callback event answer ─────────────────────────────────────────────────

  private async _sendEventAnswer(eventId: string, userId: number, peerId: number) {
    try {
      await (this.vk as any).call('messages.sendMessageEventAnswer', {
        event_id: eventId,
        user_id: userId,
        peer_id: peerId,
      });
    } catch (err: any) {
      this.logger.warn('sendMessageEventAnswer failed: %s', err.message);
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private async _resolveClient(peerId: number) {
    return this.prisma.vkClient.findUnique({
      where: { peerId },
      include: { crmStatus: true, tagLinks: true },
    });
  }

  private async _log(botId: string, clientId: string | null | undefined, event: string, action: string, result?: string) {
    try {
      await this.prisma.botLog.create({
        data: { botId, clientId: clientId ?? null, event, action, result: result?.slice(0, 500) },
      });
    } catch { /* non-critical */ }
  }
}
