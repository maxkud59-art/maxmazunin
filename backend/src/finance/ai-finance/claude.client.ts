import { Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { AccountingEffect } from '@prisma/client';

export interface ClassifyResult {
  categoryId: string | null;
  project: string | null;
  effect: AccountingEffect;
  confidence: number;
  rationale: string;
  model: string;
}

export interface AiFinanceClaudeClient {
  classify(system: string, userMsg: string): Promise<ClassifyResult>;
  text(system: string, userMsg: string): Promise<string>;
}

const MODEL = process.env.AI_FINANCE_MODEL ?? 'claude-sonnet-4-6';
const MAX_TOKENS = parseInt(process.env.AI_FINANCE_MAX_TOKENS ?? '1500', 10);

class MockAiFinanceClient implements AiFinanceClaudeClient {
  async classify(_s: string, _u: string): Promise<ClassifyResult> {
    return {
      categoryId: null,
      project: null,
      effect: 'DDS_ONLY',
      confidence: 0.5,
      rationale: 'Mock: ANTHROPIC_API_KEY не задан.',
      model: 'mock',
    };
  }
  async text(_s: string, _u: string): Promise<string> {
    return 'Mock AI-анализ: задайте ANTHROPIC_API_KEY для реального ответа.';
  }
}

class RealAiFinanceClient implements AiFinanceClaudeClient {
  private readonly sdk: Anthropic;
  private readonly logger = new Logger('AiFinanceClient');

  constructor(apiKey: string) {
    this.sdk = new Anthropic({ apiKey });
  }

  async classify(system: string, userMsg: string): Promise<ClassifyResult> {
    const response = await this.sdk.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: userMsg }],
    });

    const raw = (response.content[0] as { type: string; text: string }).text;
    try {
      const parsed = JSON.parse(raw.replace(/```json\n?|```/g, '').trim());
      return {
        categoryId: parsed.categoryId ?? null,
        project: parsed.project ?? null,
        effect: (['DDS_AND_PNL', 'DDS_ONLY', 'NEUTRAL'].includes(parsed.effect)
          ? parsed.effect
          : 'DDS_ONLY') as AccountingEffect,
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
        rationale: String(parsed.rationale ?? ''),
        model: response.model,
      };
    } catch {
      this.logger.warn('Failed to parse classify response, returning safe default');
      return { categoryId: null, project: null, effect: 'DDS_ONLY', confidence: 0, rationale: raw.slice(0, 200), model: response.model };
    }
  }

  async text(system: string, userMsg: string): Promise<string> {
    const response = await this.sdk.messages.create({
      model: MODEL,
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: userMsg }],
    });
    return (response.content[0] as { type: string; text: string }).text;
  }
}

export function createAiFinanceClient(): AiFinanceClaudeClient {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    new Logger('AiFinanceClient').warn('ANTHROPIC_API_KEY not set → MockAiFinanceClient');
    return new MockAiFinanceClient();
  }
  return new RealAiFinanceClient(key);
}
