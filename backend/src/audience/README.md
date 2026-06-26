# Audience module — сбор тёплой аудитории и оркестрация VK-ретаргета

## Что реализовано и проверено локально

| Функция | Статус |
|---------|--------|
| Приём событий `POST /api/audience/events` с дедупом по `dedupeKey` | ✅ работает |
| Upsert `AdContact` при наличии `vkUserId` (isWriter, isLead, isPayer флаги) | ✅ работает |
| `GET /api/audience/funnel` — counts по этапам + конверсии + biggest drop | ✅ работает |
| CRUD сегментов `AdAudience` | ✅ работает |
| `VkSyncLog` с `status=DRY_RUN` при `VK_SYNC_ENABLED=false` | ✅ работает |
| Хук `message_allow` → `DIALOG_ALLOWED` через `BotEngineService` | ✅ работает |
| Хук `message_new` → `FIRST_MESSAGE` через `BotEngineService` | ✅ работает |
| Silent followup: DIALOG_ALLOWED без FIRST_MESSAGE → ровно 1 сообщение | ✅ логика (без живого VK token — DRY_RUN) |
| LaL-сид из плательщиков `AdContact.isPayer=true` | ✅ работает |
| Cron: followup каждые 10 мин, custom sync каждые 6 ч, LaL в 03:00 | ✅ зарегистрировано |
| Frontend `/audience`: воронка + список сегментов + кнопка синк | ✅ работает |

## Что требует живых ключей VK (не тестировалось)

| Функция | Что нужно |
|---------|-----------|
| `RealVkAdsClient.upsertRetargetSegment` | `VK_ADS_TOKEN` + эндпоинт `ads.createTargetGroup` / `ads.updateTargetGroup` по актуальной документации VK Ads API |
| `RealVkAdsClient.uploadCustomAudience` | Сверить формат хешей контактов (MD5/SHA256), batch-лимиты в `ads.importTargetContacts` |
| `RealVkAdsClient.createLookalike` | `ads.createLookalikeRequest` — проверить availability и время создания |
| `RealVkAdsClient.pushExclusions` | Уточнить флаг remove в `ads.importTargetContacts` |
| `message_allow` на рекламном CTA «написать сообществу» | Проверить Callback API docs: гарантированно ли приходит `message_allow` при клике на рекламный CTA в VK Ads «сообщения сообщества»? Если нет — DIALOG_ALLOWED ловим только через VK-ретаргет, silent followup работает только для тех, кто разрешил переписку явно. |
| Реальная отправка silent followup | `VK_GROUP_TOKEN` в `.env` — уже используется в BotsModule, тот же токен |

## Переменные окружения

| Переменная | По умолчанию | Описание |
|-----------|-------------|---------|
| `VK_SYNC_ENABLED` | `false` | `true` → реальные вызовы VK Ads API; `false` → DRY_RUN |
| `VK_ADS_TOKEN` | — | Токен VK Ads API (нужен при `VK_SYNC_ENABLED=true`) |
| `SILENT_FOLLOWUP_MINUTES` | `30` | Порог молчания в минутах до авто-дожима |
| `SILENT_FOLLOWUP_TEXT` | (встроенный текст) | Текст первого сообщения молчунам |

## Добавить новый этап воронки

1. Добавить значение в `AdFunnelStage` enum в `schema.prisma`.
2. Аддитивный `prisma db push` (локально) / `prisma migrate deploy` (прод, с бэкапом).
3. Обновить массив `stageOrder` в `funnel-ingest.service.ts` — новый этап появится в counts воронки автоматически.
4. При необходимости обновить флаги в `PAYER_STAGES`/`LEAD_STAGES`/`WRITER_STAGES`.

## Безопасность данных

- **Никаких деструктивных операций с БД.** Только аддитивные миграции.
- Не пишем пользователям без `message_allow` — проверка через `lastStage=DIALOG_ALLOWED`.
- Флаг `silentFollowupSent` гарантирует ровно одно сообщение на контакт.
- При `VK_SYNC_ENABLED=false` нет сетевых вызовов в VK Ads API.
