// Prefilter — экономия LLM-вызовов по простым правилам.
// Возвращает null → пропускаем в LLM; StageResult → правило сработало.

import { StageResult } from './llm-client';

const PRICE_KEYWORDS = [
  'руб', 'рублей', 'цена', 'стоит', 'стоимость', 'прайс', 'прайслист',
  'http', 'https', 'ссылку', 'ссылка', 'каталог',
];

export function prefilterTranscript(
  conversationId: string,
  clientMessages: string[],
  managerMessages: string[],
  qaPercent: number,
): StageResult | null {
  // QA sample — отправляем в LLM для контроля качества правил
  const hash = conversationId.charCodeAt(0) + conversationId.charCodeAt(conversationId.length - 1);
  if (hash % 100 < qaPercent) return null;

  const clientCount = clientMessages.length;
  const managerCount = managerMessages.length;

  // Правило 1: клиент ещё не написал
  if (clientCount === 0) {
    return { reachedStage: 'CONTACT', deathStage: 'CONTACT', objectionType: 'NONE', dayInDay: false, hadCTA: false, confidence: 1.0, needsReview: false, model: 'rule:no_client_messages' };
  }

  // Правило 2: менеджер не ответил
  if (managerCount === 0) {
    return { reachedStage: 'CONTACT', deathStage: 'CONTACT', objectionType: 'NONE', dayInDay: false, hadCTA: false, confidence: 1.0, needsReview: false, model: 'rule:no_manager_reply' };
  }

  // Правило 3: клиент написал, менеджер ответил — нет признаков прайса → REPLIED
  const allText = [...clientMessages, ...managerMessages].join(' ').toLowerCase();
  const hasPrice = PRICE_KEYWORDS.some((kw) => allText.includes(kw));

  if (!hasPrice && clientCount < 3) {
    return { reachedStage: 'REPLIED', deathStage: 'REPLIED', objectionType: 'NONE', dayInDay: false, hadCTA: managerCount > 0, confidence: 0.8, needsReview: false, model: 'rule:replied_no_price' };
  }

  // Иначе — нужен LLM
  return null;
}
