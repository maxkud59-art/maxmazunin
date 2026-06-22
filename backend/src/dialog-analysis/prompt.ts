// Версионированный промпт для разметки диалога.
// Модель должна вернуть СТРОГО JSON (без markdown-обёртки).
export const ANALYSIS_VERSION = 'v1';

export const DIALOG_STAGE_VALUES = [
  'CONTACT', 'REPLIED', 'PRICE_SHOWN', 'OBJECTION',
  'REBUTTAL', 'ORDERED', 'PREPAID', 'PAID_FULL',
] as const;

export const OBJECTION_TYPE_VALUES = [
  'NONE', 'EXPENSIVE', 'THINKING', 'JUST_ASKING',
  'IGNORED_AFTER_LINK', 'TIMING', 'OTHER',
] as const;

export function buildPrompt(transcript: string): string {
  return `Ты — аналитик скриптов продаж. Разметь диалог по канонической воронке.

ВОРОНКА (порядок):
CONTACT → REPLIED → PRICE_SHOWN → OBJECTION → REBUTTAL → ORDERED → PREPAID → PAID_FULL

ОПИСАНИЕ ЭТАПОВ:
- CONTACT: клиент написал первый раз
- REPLIED: менеджер ответил
- PRICE_SHOWN: менеджер озвучил цену или дал ссылку
- OBJECTION: клиент выразил возражение
- REBUTTAL: менеджер отработал возражение
- ORDERED: клиент согласился на заказ
- PREPAID: внесена предоплата
- PAID_FULL: полная оплата

ТИПЫ ВОЗРАЖЕНИЙ:
NONE | EXPENSIVE | THINKING | JUST_ASKING | IGNORED_AFTER_LINK | TIMING | OTHER

ЗАДАНИЕ:
1. reachedStage — максимальный достигнутый этап
2. deathStage — этап на котором диалог завис/умер (null если дошли до PAID_FULL)
3. objectionType — тип основного возражения (NONE если не было)
4. dayInDay — true если первый ответ менеджера и решение клиента в один день (bool)
5. hadCTA — был ли явный призыв к действию от менеджера (bool)
6. confidence — уверенность 0.0-1.0

Верни ТОЛЬКО JSON, без markdown, без объяснений:
{"reachedStage":"...","deathStage":"..." или null,"objectionType":"...","dayInDay":bool,"hadCTA":bool,"confidence":float}

ДИАЛОГ:
${transcript.slice(0, 6000)}`;
}
