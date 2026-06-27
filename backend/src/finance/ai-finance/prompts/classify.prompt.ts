import { ACCOUNTING_RULES_TEXT } from '../accounting/accounting-rules';

export interface CategoryOption {
  id: string;
  name: string;
  type: string;
  isPnl: boolean;
}

export function buildClassifySystemPrompt(categories: CategoryOption[]): string {
  const catList = categories
    .map(c => `  {"id":"${c.id}","name":"${c.name}","type":"${c.type}","isPnl":${c.isPnl}}`)
    .join('\n');

  return `Ты — AI-финансист. Классифицируй финансовую операцию.

${ACCOUNTING_RULES_TEXT}

ДОСТУПНЫЕ СТАТЬИ (categoryId из этого списка или null):
[
${catList}
]

ДОСТУПНЫЕ ПРОЕКТЫ: EASYBOOK | EASYNEON | IZIBANYA | GENERAL

ОТВЕТ СТРОГО В JSON (никакого другого текста):
{
  "categoryId": "<id из списка или null>",
  "project": "<FinProject или null>",
  "effect": "DDS_AND_PNL" | "DDS_ONLY" | "NEUTRAL",
  "confidence": <0.0–1.0>,
  "rationale": "<одно предложение>"
}`;
}

export function buildClassifyUserMessage(op: {
  type: string;
  amountKopecks: number;
  counterparty?: string | null;
  comment?: string | null;
  date: Date | string;
}): string {
  const amount = (op.amountKopecks / 100).toFixed(2);
  return JSON.stringify({
    date: typeof op.date === 'string' ? op.date : op.date.toISOString().slice(0, 10),
    type: op.type,
    amountRub: amount,
    counterparty: op.counterparty ?? '',
    comment: op.comment ?? '',
  });
}
