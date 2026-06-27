# AI-финансист [добавлен 2026-06-27]

**Файлы:** `backend/src/finance/ai-finance/`, `frontend/pages/finance/ai-finance.vue`

Модуль второго слоя Finance-раздела: автоматическая классификация операций + аналитика + прогноз.

---

## Архитектура

```
ClassifyService        — правило → AI → PROPOSED
LearningService        — confirm → CategorizationRule (upsert)
AnalyticsService       — ДДС + ПНЛ summary за период + AI-комментарий
ForecastService        — cashflow (история → недельный прогноз) + PNL (пайплайн)
AnomalyService         — дубли / 3σ-выбросы / бэклог незакатегоризированных
AiFinanceController    — 10 REST-эндпоинтов под /api/finance/ai/*
```

---

## Безопасность (нарушать нельзя)

- AI **НИКОГДА** не применяет категорию без подтверждения человеком, если не сработало правило
- AI **НЕ ТРОГАЕТ** уже подтверждённые операции (`aiCategorized=true` + `categoryId≠null`)
- Прогнозы возвращают `estimate: true` + список допущений (`assumptions`)
- Финансовая целостность: балансы счетов не пересчитываются через AI

---

## Правило-машина (rule-engine)

Типы матча (`CategorizationRule.matchType`):
| Тип | Матч |
|-----|------|
| `counterparty` | точное совпадение counterparty (case-insensitive) |
| `keyword` | подстрока в comment |
| `regex` | RegExp в comment |
| `amount_sign` | только знак суммы (positive/negative) |

Порядок: rule-engine → если `rule.confidence × match.score ≥ AI_FINANCE_RULE_MIN_CONFIDENCE` (default 0.8) → авто-применяем, статус `CONFIRMED`, `ruleId` заполнен.  
Иначе → Claude → статус `PROPOSED` → ждёт подтверждения менеджером.

---

## Human-in-the-loop

```
FinOperation (categoryId=null)
   ↓ POST /api/finance/ai/operations/:id/classify
AiFinSuggestion (status=PROPOSED)
   ↓ менеджер нажимает "Принять"
   POST /api/finance/ai/suggestions/:id/confirm
   ↓ LearningService
→ CategorizationRule.upsert (по counterparty)
→ FinOperation обновляется: categoryId, effect, aiCategorized=true, isPnl=(effect=DDS_AND_PNL)
```

Отклонение: `POST /suggestions/:id/reject` → статус REJECTED, правило не создаётся.

---

## Учётные эффекты

| `AccountingEffect` | Логика |
|---|---|
| `DDS_AND_PNL` | Движение денег + расход/доход в ПНЛ |
| `DDS_ONLY` | Только ДДС (авансы, переводы) |
| `NEUTRAL` | Не влияет ни на ДДС, ни на ПНЛ (возвраты кредитов, внутренние перемещения) |

---

## Prisma-модели

| Модель | Назначение |
|--------|-----------|
| `CategorizationRule` | Правило классификации: matchType, pattern, categoryId, effect, confidence, hitCount |
| `AiFinSuggestion` | AI-предложение для операции: status (PROPOSED/CONFIRMED/REJECTED), ruleId |
| `AiFinInsight` | Исторический лог аналитики/прогнозов (kind, period, payload JSON) |

Поля добавлены к `FinOperation`: `effect AccountingEffect?`, `aiCategorized Boolean @default(false)`.

---

## REST API (все под JwtAuthGuard)

| Эндпоинт | Описание |
|----------|---------|
| `GET /api/finance/ai/operations/uncategorized` | Очередь (limit до 50) |
| `POST /api/finance/ai/operations/:id/classify` | Классифицировать одну операцию |
| `POST /api/finance/ai/operations/classify-batch` | Пакет (limit) |
| `POST /api/finance/ai/suggestions/:id/confirm` | Подтвердить + создать правило |
| `POST /api/finance/ai/suggestions/:id/reject` | Отклонить |
| `POST /api/finance/ai/insights/summary` | ДДС+ПНЛ сводка (body: from, to, project?) |
| `POST /api/finance/ai/insights/cashflow-forecast` | Прогноз денежного потока |
| `POST /api/finance/ai/insights/pnl-forecast` | Прогноз ПНЛ по пайплайну |
| `GET /api/finance/ai/anomalies` | Детекция аномалий |
| `GET /api/finance/ai/rules` | Список активных правил |

---

## Claude client

`backend/src/finance/ai-finance/claude.client.ts`:
- `MockAiFinanceClient` — детерминированные заглушки (без API-ключа)
- `RealAiFinanceClient` — Claude (`claude-sonnet-4-6`), модель `AI_FINANCE_MODEL`, токены `AI_FINANCE_MAX_TOKENS`
- `createAiFinanceClient()` — фабрика: ключ есть → Real, нет → Mock

---

## Переменные окружения

| Переменная | Назначение | Default |
|-----------|-----------|---------|
| `ANTHROPIC_API_KEY` | Уже есть из ai-assistant. Без ключа → Mock | — |
| `AI_FINANCE_MODEL` | Модель Claude | `claude-sonnet-4-6` |
| `AI_FINANCE_MAX_TOKENS` | Макс. токенов ответа | `1500` |
| `AI_FINANCE_RULE_MIN_CONFIDENCE` | Порог авто-применения правила | `0.8` |
| `FORECAST_HORIZON_DAYS` | Горизонт прогноза по умолчанию (дней) | `60` |

---

## Seed

`backend/prisma/seed-ai-finance.ts`:
- 1 правило `counterparty=Яндекс.Директ` → первая expense-категория (критерий #2)
- 2 дублирующих операции Типография Принт24, -12500 руб, разница 1 день (критерий #7)
- 3 незакатегоризированных операции для очереди

Запуск: `npx ts-node -r tsconfig-paths/register prisma/seed-ai-finance.ts`

---

## Аномалии

- **duplicate**: один контрагент + одна сумма в окне 3 дней → severity=high
- **outlier**: операция >3σ от среднего по категории (нужно ≥5 операций) → severity=medium
- **uncategorized_backlog**: ≥10 незакатегоризированных → medium, ≥50 → high
