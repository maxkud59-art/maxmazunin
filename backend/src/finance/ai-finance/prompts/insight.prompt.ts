import { ACCOUNTING_RULES_TEXT } from '../accounting/accounting-rules';

export function buildInsightSystemPrompt(): string {
  return `Ты — AI-финансист. Пиши короткие аналитические комментарии (2–4 предложения).
Цифры уже посчитаны в коде — только интерпретируй, НЕ выдумывай числа.
Не давай инвестиционных, налоговых или юридических рекомендаций.
${ACCOUNTING_RULES_TEXT}`;
}

export function buildSummaryUserMessage(data: Record<string, unknown>): string {
  return `Дай короткий (2–3 предложения) аналитический комментарий к финансовой сводке:\n${JSON.stringify(data, null, 2)}`;
}

export function buildForecastUserMessage(data: Record<string, unknown>): string {
  return `Прокомментируй прогноз денежного потока (1–2 предложения). Явно укажи, что это оценка:\n${JSON.stringify(data, null, 2)}`;
}
