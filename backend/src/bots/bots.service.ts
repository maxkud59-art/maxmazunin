import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BotType, BotStepType, ScenarioStateStatus } from '@prisma/client';
import { CreateBotDto, UpdateBotDto, CreateBotStepDto, UpdateBotStepDto } from './dto';

@Injectable()
export class BotsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Bots CRUD ──────────────────────────────────────────────────────────────

  async listBots(includeArchived = false) {
    return this.prisma.bot.findMany({
      where: { archived: includeArchived ? undefined : false },
      include: {
        steps: { orderBy: { position: 'asc' } },
        _count: { select: { logs: true, states: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getBot(id: string) {
    const bot = await this.prisma.bot.findUnique({
      where: { id },
      include: { steps: { orderBy: { position: 'asc' } } },
    });
    if (!bot) throw new NotFoundException('Bot not found');
    return bot;
  }

  async createBot(dto: CreateBotDto) {
    return this.prisma.bot.create({
      data: { name: dto.name, type: dto.type },
      include: { steps: true },
    });
  }

  async updateBot(id: string, dto: UpdateBotDto) {
    await this.getBot(id);
    return this.prisma.bot.update({ where: { id }, data: dto });
  }

  async duplicateBot(id: string) {
    const bot = await this.getBot(id);
    const steps = bot.steps;
    const newBot = await this.prisma.bot.create({
      data: {
        name: `${bot.name} (копия)`,
        type: bot.type,
        enabled: false,
      },
    });
    // Duplicate steps; rebuild nextStepId references via position order
    const idMap: Record<string, string> = {};
    for (const s of steps) {
      const ns = await this.prisma.botStep.create({
        data: {
          botId: newBot.id,
          type: s.type,
          config: s.config as any,
          position: s.position,
          branches: s.branches as any,
        },
      });
      idMap[s.id] = ns.id;
    }
    // Fix nextStepId references
    for (const s of steps) {
      if (s.nextStepId && idMap[s.nextStepId]) {
        await this.prisma.botStep.update({
          where: { id: idMap[s.id] },
          data: { nextStepId: idMap[s.nextStepId] },
        });
      }
    }
    // Fix branch stepId references
    for (const s of steps) {
      const branches = (s.branches as any[]) ?? [];
      if (branches.some((b) => b.stepId && idMap[b.stepId])) {
        const mapped = branches.map((b) => ({
          ...b,
          stepId: b.stepId && idMap[b.stepId] ? idMap[b.stepId] : b.stepId,
        }));
        await this.prisma.botStep.update({
          where: { id: idMap[s.id] },
          data: { branches: mapped },
        });
      }
    }
    return this.getBot(newBot.id);
  }

  // ─── Steps CRUD ─────────────────────────────────────────────────────────────

  async createStep(botId: string, dto: CreateBotStepDto) {
    await this.getBot(botId);
    const maxPos = await this.prisma.botStep.aggregate({
      where: { botId },
      _max: { position: true },
    });
    const pos = dto.position ?? (maxPos._max.position ?? -1) + 1;
    return this.prisma.botStep.create({
      data: {
        botId,
        type: dto.type,
        config: dto.config ?? {},
        position: pos,
        nextStepId: dto.nextStepId ?? null,
        branches: dto.branches ?? [],
      },
    });
  }

  async updateStep(botId: string, stepId: string, dto: UpdateBotStepDto) {
    const step = await this.prisma.botStep.findFirst({ where: { id: stepId, botId } });
    if (!step) throw new NotFoundException('Step not found');
    return this.prisma.botStep.update({ where: { id: stepId }, data: dto });
  }

  async deleteStep(botId: string, stepId: string) {
    const step = await this.prisma.botStep.findFirst({ where: { id: stepId, botId } });
    if (!step) throw new NotFoundException('Step not found');
    // Unlink any references to this step
    await this.prisma.botStep.updateMany({
      where: { botId, nextStepId: stepId },
      data: { nextStepId: null },
    });
    await this.prisma.botStep.delete({ where: { id: stepId } });
    return { ok: true };
  }

  async reorderSteps(botId: string, ids: string[]) {
    await this.getBot(botId);
    for (let i = 0; i < ids.length; i++) {
      await this.prisma.botStep.updateMany({
        where: { id: ids[i], botId },
        data: { position: i },
      });
    }
    return this.getBot(botId);
  }

  // ─── Logs ────────────────────────────────────────────────────────────────────

  async getLogs(botId: string, limit = 50) {
    return this.prisma.botLog.findMany({
      where: { botId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ─── Scenario states ─────────────────────────────────────────────────────────

  async addClientToScenario(clientId: string, botId: string) {
    const bot = await this.getBot(botId);
    if (bot.type !== BotType.SCENARIO) throw new Error('Bot is not a SCENARIO type');
    const firstStep = bot.steps.find((s) => s.type !== BotStepType.TRIGGER && s.position === Math.min(...bot.steps.filter((x) => x.type !== BotStepType.TRIGGER).map((x) => x.position)));
    // Cancel existing active states
    await this.prisma.clientScenarioState.updateMany({
      where: { clientId, botId, status: { in: [ScenarioStateStatus.ACTIVE, ScenarioStateStatus.WAITING_DELAY] } },
      data: { status: ScenarioStateStatus.CANCELLED },
    });
    return this.prisma.clientScenarioState.create({
      data: { clientId, botId, currentStepId: firstStep?.id ?? null, status: ScenarioStateStatus.ACTIVE },
    });
  }

  async listScenarioStates(botId?: string, clientId?: string) {
    return this.prisma.clientScenarioState.findMany({
      where: {
        ...(botId ? { botId } : {}),
        ...(clientId ? { clientId } : {}),
      },
      include: { bot: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
