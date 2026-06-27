import { Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';

export interface CoachingResult {
  suggestions: string[];
  riskAlerts: string[];
  suggestedReply?: string;
  reasoning: string;
  model: string;
}

export interface ClaudeClient {
  coachConversation(transcript: string, context: string): Promise<CoachingResult>;
}

// Детерминированный стаб — не требует ANTHROPIC_API_KEY.
export class MockClaudeClient implements ClaudeClient {
  async coachConversation(transcript: string, _ctx: string): Promise<CoachingResult> {
    const len = transcript.length;
    return {
      suggestions: [
        'Уточните детали заказа у клиента.',
        len > 500 ? 'Диалог длинный — предложите следующий шаг прямо сейчас.' : 'Поддерживайте тон доверия.',
      ],
      riskAlerts: len < 100 ? ['Мало информации для оценки.'] : [],
      suggestedReply: 'Добрый день! Уточните, пожалуйста, размеры неона.',
      reasoning: 'Mock-ответ (ANTHROPIC_API_KEY не задан).',
      model: 'mock',
    };
  }
}

// Реальный клиент через claude-sonnet-4-6.
export class AnthropicClaudeClient implements ClaudeClient {
  private readonly logger = new Logger('AnthropicClaudeClient');
  private readonly sdk: Anthropic;

  constructor(apiKey: string) {
    this.sdk = new Anthropic({ apiKey });
  }

  async coachConversation(transcript: string, context: string): Promise<CoachingResult> {
    const response = await this.sdk.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: `Ты — коуч по продажам неоновых вывесок. Помогаешь менеджеру вести диалог к оплате.
ПРАВИЛА:
- Ты ТОЛЬКО советуешь менеджеру, ты НИКОГДА не пишешь клиенту самостоятельно.
- Не предлагай давить или манипулировать.
- Ответ СТРОГО в JSON: { "suggestions": string[], "riskAlerts": string[], "suggestedReply": string, "reasoning": string }`,
      messages: [
        {
          role: 'user',
          content: `Контекст: ${context}\n\nТранскрипт диалога:\n${transcript}`,
        },
      ],
    });

    const raw = (response.content[0] as { type: string; text: string }).text;
    try {
      const parsed = JSON.parse(raw.replace(/```json\n?|```/g, '').trim());
      return {
        suggestions: parsed.suggestions ?? [],
        riskAlerts: parsed.riskAlerts ?? [],
        suggestedReply: parsed.suggestedReply,
        reasoning: parsed.reasoning ?? '',
        model: response.model,
      };
    } catch {
      this.logger.warn('Failed to parse Claude response as JSON, returning raw text');
      return {
        suggestions: [raw.slice(0, 200)],
        riskAlerts: [],
        reasoning: raw.slice(0, 100),
        model: response.model,
      };
    }
  }
}

export function createClaudeClient(): ClaudeClient {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    new Logger('ClaudeClient').warn('ANTHROPIC_API_KEY not set → using MockClaudeClient');
    return new MockClaudeClient();
  }
  return new AnthropicClaudeClient(key);
}
