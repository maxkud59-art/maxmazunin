import { Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { DialogStage, ObjectionType } from '@prisma/client';

export interface StageResult {
  reachedStage: DialogStage;
  deathStage: DialogStage | null;
  objectionType: ObjectionType;
  dayInDay: boolean;
  hadCTA: boolean;
  confidence: number;
  needsReview: boolean;
  model: string;
}

export interface LlmClient {
  analyzeDialog(conversationId: string, transcript: string): Promise<StageResult>;
}

// Детерминированный стаб — исход определяется хешем conversationId.
export class MockLLM implements LlmClient {
  private readonly logger = new Logger('MockLLM');

  async analyzeDialog(conversationId: string, _transcript: string): Promise<StageResult> {
    const hash = parseInt(createHash('sha256').update(conversationId).digest('hex').slice(0, 8), 16);
    const bucket = hash % 100;

    const stages: DialogStage[] = [
      'CONTACT', 'REPLIED', 'PRICE_SHOWN', 'OBJECTION',
      'REBUTTAL', 'ORDERED', 'PREPAID', 'PAID_FULL',
    ];
    const objections: ObjectionType[] = [
      'NONE', 'EXPENSIVE', 'THINKING', 'JUST_ASKING',
      'IGNORED_AFTER_LINK', 'TIMING', 'OTHER',
    ];

    let reachedStage: DialogStage;
    let deathStage: DialogStage | null = null;
    let objectionType: ObjectionType = 'NONE';

    if (bucket < 10) {
      reachedStage = 'CONTACT'; deathStage = 'CONTACT';
    } else if (bucket < 25) {
      reachedStage = 'REPLIED'; deathStage = 'REPLIED';
    } else if (bucket < 40) {
      reachedStage = 'PRICE_SHOWN'; deathStage = 'PRICE_SHOWN';
      objectionType = objections[hash % objections.length];
    } else if (bucket < 55) {
      reachedStage = 'OBJECTION'; deathStage = 'OBJECTION';
      objectionType = objections[(hash + 1) % objections.length];
    } else if (bucket < 65) {
      reachedStage = 'REBUTTAL'; deathStage = 'REBUTTAL';
      objectionType = 'EXPENSIVE';
    } else if (bucket < 75) {
      reachedStage = 'ORDERED';
    } else if (bucket < 85) {
      reachedStage = 'PREPAID';
    } else {
      reachedStage = 'PAID_FULL';
    }

    return {
      reachedStage,
      deathStage,
      objectionType,
      dayInDay: bucket % 3 === 0,
      hadCTA: bucket > 30,
      confidence: 0.85 + (hash % 15) / 100,
      needsReview: false,
      model: 'mock',
    };
  }
}

// Stub: подключить реальный Anthropic API здесь, когда будет ключ.
export class AnthropicLLM implements LlmClient {
  private readonly logger = new Logger('AnthropicLLM');

  async analyzeDialog(conversationId: string, transcript: string): Promise<StageResult> {
    // TODO: реализовать через ANTHROPIC_API_KEY
    // Промпт — в prompt.ts
    this.logger.warn('AnthropicLLM not implemented — falling back to MockLLM');
    return new MockLLM().analyzeDialog(conversationId, transcript);
  }
}

export function createLlmClient(): LlmClient {
  const mode = process.env.LLM_MODE ?? 'mock';
  if (mode === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      new Logger('LlmClientFactory').warn(
        'LLM_MODE=anthropic but ANTHROPIC_API_KEY not set → falling back to mock',
      );
      return new MockLLM();
    }
    return new AnthropicLLM();
  }
  return new MockLLM();
}
