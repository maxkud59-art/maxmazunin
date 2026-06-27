# AI-ассистент модуль

Модуль для коучинга менеджеров через Claude API + SLA-таймеры + human-in-the-loop предложения.

## Архитектура

```
AiAssistantController (GET/POST/PATCH /api/ai-assistant/*)
  └── AiAssistantService
        ├── ClaudeClient (MockClaudeClient | AnthropicClaudeClient)
        ├── SlaService — бизнес-часы, дедлайны, cron маркировки
        └── GuardrailsService — фильтрация, запрет авто-действий
```

## Guardrails (КРИТИЧНО)

- AI **НИКОГДА** не пишет клиенту напрямую
- AI **НИКОГДА** не меняет стадию `OPLACHENO` самостоятельно
- Все предложения — `AiAction` со статусом `PENDING`. Только менеджер решает
- `GuardrailsService.filterSuggestions()` убирает манипулятивные формулировки

## LifecycleStage flow

```
NEW_LEAD → PRICE_SENT → OFORMLENO → OPLACHENO
                                   ↑
           IN_PRODUCTION → READY_TO_SHIP → SHIPPED → DELIVERED ─┘
```

`CLOSED_LOST` — терминальная стадия.

## SLA-политики

SLA рассчитывается в рабочих часах (09:00–21:00, Пн–Пт).
Добавить / изменить: `prisma/seed-sla-policies.ts` → запустить.

| Переход | Рабочих часов |
|---------|--------------|
| NEW_LEAD → PRICE_SENT | 4 |
| PRICE_SENT → OFORMLENO | 24 |
| OFORMLENO → OPLACHENO | 48 |
| IN_PRODUCTION → READY_TO_SHIP | 72 |
| READY_TO_SHIP → SHIPPED | 8 |

## Добавить новую стадию

1. Добавить значение в `LifecycleStage` enum в `schema.prisma`
2. `prisma db push` локально / `prisma migrate deploy` на проде (с `pg_dump` бэкапом)
3. Обновить `nextExpectedStage()` в `ai-assistant.service.ts`
4. При необходимости добавить SLA-политику в `seed-sla-policies.ts` и запустить seed

## Режим без API-ключа

Без `ANTHROPIC_API_KEY` — `MockClaudeClient`. Ответы детерминированы по длине транскрипта.
Включить реальный: добавить `ANTHROPIC_API_KEY=sk-ant-...` в `.env`, перезапустить backend.
