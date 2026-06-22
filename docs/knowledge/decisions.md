# Журнал архитектурных решений

## 2026-06-23 | Dialog Analysis + A/B Experiments subsystem

**Решение:** Два новых модуля: `dialog-analysis` (разметка воронки через LLM) и `experiments` (A/B движок), плюс `analytics` (funnel endpoint).

**Ключевые архитектурные решения:**
- **MockLLM** детерминирован по sha256(conversationId) → стабильные исходы в smoke-тестах без API-ключей. `LLM_MODE=anthropic` + `ANTHROPIC_API_KEY` → реальный LLM (stub, готов к подключению).
- **Prefilter:** <2 клиентских сообщений → rule `CONTACT`; нет прайса-ключевых-слов → rule `REPLIED`; 3% QA-выборка → в LLM. Экономит 60–70% LLM-вызовов.
- **Баланс внутри менеджера:** для каждого (experimentId, managerId) выбирается вариант с min счётчиком → перекос ≤ 1.
- **Значимость:** minSample AND p<pThreshold AND стабильный знак ≥ 3 дня (ExperimentResultSnapshot). Победитель — ТОЛЬКО через POST /experiments/:id/decide, никогда автоматически.
- **DAILY_LLM_BUDGET:** LlmBudgetLog (@@unique date) — worker останавливается при исчерпании.
- **Smoke test:** `npm run smoke:experiments` — зелёный без внешних ключей (MockLLM + seed data).

**Аддитивные изменения схемы:** +3 поля в Order (paymentStatus/paidAt/managerId) + 4 enum + 5 новых моделей. Никаких DROP/TRUNCATE.

## 2026-06-23 | CRM — второй Prisma-клиент для read-only доступа к CRM-БД

**Решение:** Модуль `crm` использует отдельный Prisma-клиент (`PrismaCrmService`) сгенерированный из `prisma/crm.prisma` с `output = "../src/generated/crm-client"`. Указывает на отдельную БД через `CRM_DATABASE_URL`. Собственная модель `User` не конфликтует с `User` основной схемы.

**Почему:** CRM-схема имеет несовместимую модель `User` (Int ID vs String cuid в основной). Merging невозможен без переименования. Раздельный клиент — нулевой риск конфликтов, явная изоляция read-only данных.

**Генерация клиента:** `npm run db:generate:crm` (добавлено в package.json). Папка `src/generated/crm-client/` — не коммитить (в .gitignore добавить).

## 2026-06-21 | Finance — ДДС в копейках, раздельные отчёты, выручка по отгрузке

**Решение:** Суммы хранятся в Int (копейки), не Float/Decimal. ДДС и ПНЛ — отдельные отчёты. Выручка признаётся при переводе `FinOrder` в статус `SHIPPED` (создаётся `AccrualEntry` типа REVENUE). `currentBalance` — денормализованное поле, пересчитывается после каждой операции.

**Почему:** Методология «Нескучные финансы». Float даёт погрешности при суммировании. Кассовый метод (ДДС) и начисленческий (ПНЛ) нельзя смешивать: авансы/переводы влияют на ДДС, но не на ПНЛ. Отгрузка в СДЭК — точка признания выручки в нашей модели.

**Банк/СДЭК адаптеры:** пока заглушки (`bank.adapter.ts`, `cdek.adapter.ts`). Токены — BANK_API_TOKEN, CDEK_CLIENT_ID, CDEK_CLIENT_SECRET — только в `.env` на сервере.

## 2026-06-21 | VK Ads — VK_ADS_TOKEN + автосинхронизация кабинетов из VK API

**Решение:** Ввести отдельную переменную `VK_ADS_TOKEN` (fallback на `VK_ACCESS_TOKEN`). Добавить `listAccounts()` в `VkAdsClientService` и `syncAccounts()` в `VkAdsService`, которые загружают реальные рекламные аккаунты из VK API и upsert-ят их в `VkCabinet`. Добавить endpoint `POST /vk-ads/sync-accounts` (ADMIN). Frontend показывает баннер «Кабинеты не найдены» с кнопкой «Синхр. кабинеты» при пустом списке.

**Почему:** `VkCabinet` ранее заполнялась только через hardcoded `seed-cabinets.ts` с поддельными `externalAccountId`. Реальные VK account ID не использовались — stats-запросы игнорировали cabinet и тянули данные без account_id. Теперь `externalAccountId` = реальный VK account ID, и `getStatistics()` передаёт его в API-вызовы.

**Альтернатива:** оставить seed — отклонена, т.к. требует ручного обновления при смене аккаунтов и не масштабируется.

---

## 2026-06-21 | Мессенджер — рабочий стол оператора (realtime, 3-панели, боты, карточка)

**Решение:**
- Schema: добавлены `VkConversation.assignedBotId TEXT`, `VkConversation.botPaused BOOLEAN DEFAULT false`, `VkClient.email`, `birthDate`, `country`, `nextContactDate`, `lastContactAt` — через SQL `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- `VkRealtimeGateway` (assistant/vk-realtime.gateway.ts) — Socket.IO namespace `/assistant-realtime`, JWT auth on connect, метод `broadcast(event, data)` для push-уведомлений.
- `AssistantService`: добавлены `handleIncomingMessage()` (sync incoming VK msg → DB → WebSocket push), `setConversationBot()`, `getConversationBotInfo()`, `getReminders()` (клиенты с nextContactDate ≤ +7 дней).
- `AssistantController`: новые endpoints `PATCH /conversations/:id/bot`, `GET /conversations/:id/bot`, `GET /reminders`.
- `VkBotLongPollService`: при `message_new` вызывает `assistantService.handleIncomingMessage()` — incoming message сохраняется в БД и пушится в браузер via WebSocket.
- `BotEngineService._dispatch()`: проверяет `VkConversation.assignedBotId` / `botPaused` — если бот назначен и не на паузе, запускает только его; если на паузе — не запускает ничего; если не назначен — старое поведение (все enabled-боты).
- `AssistantModule`: добавлен `JwtModule`, экспортирует `AssistantService`, `VkMessengerClient`, `VkRealtimeGateway`.
- `BotsModule`: импортирует `AssistantModule` (убрал локальный `VkMessengerClient`).
- Frontend: `composables/useVkRealtime.ts` — singleton Socket.IO клиент к `/assistant-realtime`; `composables/useAssistant.ts` расширен (bot methods, reminders, updateClient, orders, phrases); `pages/assistant.vue` поддерживает `messengerFullscreen` (useState, скрывает nav); `pages/assistant/messenger.vue` — полный редизайн: 3 панели (конвс+фразы+напоминания / сообщения / карточка+заказы), bot-assign dropdown, fullscreen-кнопка, realtime через Socket.IO.

**Причина:** ТЗ 2026-06-21 — рабочий стол оператора BlueSales-стиль; realtime при входящих от VK (секунды задержки).

---

## 2026-06-21 | Рассылки — BlueSales-стиль, 3 типа аудитории, архив

**Решение:**
- Prisma: к `Campaign` добавлены поля `audienceType String @default("filter")`, `audienceConfig Json @default("{}")`, `archived Boolean @default(false)`, `description String @default("")`. Миграция `20260621_campaign_audience_archived`.
- `BroadcastsService`: `startCampaign` поддерживает 3 типа аудитории: `vkIds` (список VK peer ID), `clientIds` (cuid клиентов), `filter` (CRM-фильтры из `segmentFilter`). `audiencePreview` — предпросмотр для всех трёх.
- `BroadcastsController`: добавлены `DELETE /:id` (архив), `GET /daily-limit`, `POST /audience-preview`.
- Дневной лимит вынесен в `process.env.BROADCAST_DAILY_LIMIT` (default 10 000).
- Frontend `broadcasts.vue` полностью переписан: таблица с колонками (checkbox, edit, название, создана, дата запуска, канал-badge, аудитория-link, статистика, статус-badge, описание), пагинация 10/25/50/100, сортировки, форма с 3 tabbed-аудиториями, поля-подстановки `[Имя]/[Заказ.Сумма]`, вложения-маркеры, предпросмотр подстановки, доп. настройки, отложенный запуск.
- `clients.vue`: кнопка «📢 Создать рассылку» в footer передаёт текущие CRM-фильтры через `?fromFilter=<json>` → `broadcasts.vue` открывает форму с предзаполненной аудиторией.

**Причина:** ТЗ 2026-06-21. Привести модуль к виду BlueSales; удаление через архив, а не физическое.

---

## 2026-06-21 | Боты — визуальный no-code конструктор VK-ботов

**Решение:**
- `BotsModule` (backend/src/bots/) — NestJS модуль с 4 компонентами: `BotsService`, `BotsController`, `BotEngineService`, `VkBotLongPollService`.
- 4 новых Prisma-модели: `Bot`, `BotStep`, `ClientScenarioState`, `BotLog`.
- VK Long Poll запускается `OnModuleInit` если заданы `VK_GROUP_TOKEN`/`VK_GROUP_ID`; loop с `wait=25`, exp back-off, авто-rekey при failed≥2.
- Движок исполнения: `handleEvent(VkEvent)` → матч триггеров → для RULE выполняет action-steps; для SCENARIO — ищет активное состояние клиента или создаёт новое.
- DELAY блок: сохраняет `scheduledAt` в `ClientScenarioState`, `@Cron('* * * * *')` возобновляет каждую минуту → restart-safe.
- Дедупликация событий: in-memory `Set<string>` на 500 записей.
- Keyboard VK: конфиг `{ inline, one_time, buttons: [[{action: {type,label,payload/link}, color}]] }` сохраняется в `BotStep.config.keyboard`; на отправку → JSON-строка в `messages.send({ keyboard })`.
- Frontend: `pages/assistant/bots.vue` — список карточек + встроенный редактор (step chain + palette + config panel). `composables/useBotsModule.ts`.
- Таб «Боты» добавлен в `pages/assistant.vue` между «Быстрые фразы» и «Справочники».

**Причина:** ТЗ от 2026-06-21. Два режима (RULE / SCENARIO) реализуют BlueSales-правила и Senler-воронки соответственно.

---

## 2026-06-21 | ИИ-ассистент: метки вложений VK + seed быстрых фраз + системный контекст ИИ

**Решение:**
- `vk-attachments.util.ts` — утилита `parseVkMarkers(text, clientName)`: извлекает `[photo...]`, `[video...]`, `[clip...]`, `[audio...]`, `[audio_message...]`, `[doc...]` из текста в строку `attachment` для `messages.send`; заменяет `[Имя]` первым именем клиента.
- `VkMessengerClient.sendMessage()` — добавлен параметр `attachment?: string`, передаётся в `messages.send`.
- `AssistantService.sendMessage()` — перед отправкой вызывает `parseVkMarkers`; в БД сохраняется чистый текст (без маркеров), клиент получает вложения через VK API.
- `QuickPhrase.hotkey String?` — добавлено в schema.prisma и DTOs.
- `backend/seed/quick_phrases_seed.json` + `backend/prisma/seed-phrases.ts` — идемпотентный seed: `npm run seed:phrases`. Upsert по stable-id (`seed_cat_*`, `seed_ph_*`), не удаляет данные.
- `AiSettings.systemPrompt` — при первом seed заполняется текстом бизнес-контекста ИЗИБУК; если уже задан — не перезаписывается.
- UI быстрых фраз (`phrases.vue`) и мессенджера (`assistant/messenger.vue`) — кнопки `[Имя]` и `+ Вложение` с выбором типа и URL → вставка маркера в позицию курсора.
- `extractMarkerFromUrl(url, type)` — утилита для извлечения маркера из VK URL (используется в UI).

**Причина:** ТЗ от 2026-06-21. Готовые фразы содержат вложения (clip, photo, video); маркеры не должны быть видны клиенту — только через VK attachment API.

---

## 2026-06-21 | ИИ-ассистент: полный модуль — 8 вкладок, 6 новых NestJS-модулей, 11 новых Prisma-моделей

**Решение:**
- `pages/assistant.vue` → родительский layout с левым nav + `<NuxtPage />` (по gotcha book-layout).
- Все 8 вкладок: `pages/assistant/{clients,orders,messenger,phrases,directories,broadcasts,ai-settings,settings}.vue`.
- 6 новых NestJS-модулей: `directories`, `clients`, `orders`, `phrases`, `broadcasts`, `ai-settings`.
- Рассылки: асинхронный `runSend()` в `BroadcastsService`, пауза 1100мс/сообщение, лимит 10к/день, только клиентам с реальным диалогом.
- `VkMessengerClient` переиспользован в `BroadcastsModule` для отправки.
- `DirectoriesService.onModuleInit()` — idempotent seed дефолтных CRM-статусов и статусов заказов.
- `prisma generate` нужен перед `npm run build` после любых изменений schema.

**Причина:** ТЗ от 2026-06-21. Клиент = автор диалога VK (единая сущность VkClient). Удаление через архив (поле `archived`), не жёсткое.

---

## 2026-06-21 | Performance: swap + PM2 memory limit + nginx timeout

**Решение:**
- Swap 2GB создан на сервере (`/swapfile`, `vm.swappiness=10`, в `/etc/fstab` для персистентности).
- PM2 `max_memory_restart 1500M` для enhance-service (GFPGAN включён, пик ~1140MB при втором ESRGAN проходе на 1562×2560).
- `ENABLE_GFPGAN=true` + `GFPGAN_FIDELITY=0.85` в `.env`.
- nginx `proxy_read_timeout 300s` для `/api/`.

**Причина:** OOM без swap → Linux убивал backend-процесс при пиковой нагрузке enhance. Подробнее в gotchas.md (2026-06-21).

---

## 2026-06-21 | Book Layout: AI-улучшение фото до 300 DPI (target-aware GFPGAN + ESRGAN)

**Решение:**
- Кнопка "AI Улучшить до печати → {W}×{H}" передаёт контекст (bookSize, templateId, cellIndex) в бэкенд.
- Бэкенд вычисляет `requiredPixels` через `calculatePrintQuality()` и передаёт `target_w/target_h` в Python-сервис.
- Python-сервис: GFPGAN (на оригинале, пока RAM свободна) → ESRGAN ×2 → опциональный второй ESRGAN ×2 (если нужно >2.5×) → ресайз до точного target → unsharp mask.
- **Порядок операций**: GFPGAN первым (baseline RAM ~300MB, пик ~950MB) → освобождается через `del restorer; gc.collect(); malloc_trim(0)` → ESRGAN (+200MB).
- Оригинал фото НЕ удаляется. Улучшенная версия — отдельный файл (`enh_*.jpg`).
- NestJS timeout увеличен до 660s; axios timeout для поллинга — 30s (torch.load держит GIL).

**Причина:** Пользователи хотят видеть результат улучшения именно до нужного разрешения для печати конкретной ячейки (не просто ×2). Размытые лица на семейных фото — ключевая проблема → GFPGAN с fidelity=0.85.

---

## 2026-06-20 | ИИ-ассистент: local DB sync + periodic poll (без Long Poll VK)

**Решение:**
- Синкронизация: cron каждые 5 мин (`@Cron(EVERY_5_MINUTES)`) + первый синк через 10 сек после старта.
- Выбор в пользу периодического поллинга (не Bot Long Poll API): Long Poll VK требует отдельного процесса/воркера и сложной state-machine для обработки `ts` и `pts`. Планируется в следующей итерации.
- Хранилище: локальная Postgres (VkConversation + VkMessage + VkClient). UI работает с БД, не с VK API напрямую → мгновенный отклик.
- Адаптер `VkMessengerClient` изолирует всю VK-специфику. При переходе на другой канал — меняется только адаптер.
- Схема применена через raw psql DDL (проект использует `prisma db push`, не migrations).

---

## 2026-06-20 | Book Layout: Тревелбук — ИИ-генерация обложки (Pillow poster + CoverImageClient)

**Решение:**
- Сервер: 1.9GB RAM, без GPU → Stable Diffusion физически невозможен.
- Основной путь: Pillow-генератор (`enhance-service/cover_generator.py`) — плоский винтажный постер: градиент, векторный силуэт места, орнаментальная рамка, компас. Время ~0.1 сек.
- Внешний API: если `COVER_IMAGE_API_KEY` задан в env → `generate_via_external_api()` (Stability AI / OpenAI-совместимый). За интерфейсом `CoverImageClient`-адаптера.
- Текст NOT вшивается в картинку — генерируются только фоны. Заголовок/подзаголовок — `BookTextElement` слои поверх.
- 67 локаций → 10 типов силуэтов (mountains/skyline/pyramids/eiffel/kremlin/fuji/mosque/colosseum/beach/palm/forest).
- 5 палитр: закат/минимал/ночь/пастель/тропики.
- Сгенерированное изображение сохраняется как `BookPhoto` (covgen_*.jpg) → размещается в cellIndex=0 COVER spread. Никаких изменений схемы БД.
- Очереди: asyncio background_tasks, единый executor thread.
- Эндпоинты: `POST /cover/generate` → `GET /cover/status/{id}` → `POST /cover/apply` через NestJS → enhance-service.
- UX: панель "✈ Тревелбук" (collapsible) в боковом панели обложки (desktop aside + mobile templates tab). Location dropdown, 5 стиль-пресетов, прогресс-бар, кнопки Применить/Перегенерировать.
- Данные: `cover_generator.py` — self-contained генератор без внешних зависимостей, только Pillow.

**Причина:** Zero schema changes, instant generation, works without GPU or internet, no copyright issues.

---

## 2026-06-20 | Book Layout: библиотека шаблонов обложек (CoverTemplate)

**Решение:**
- `CoverTemplate` — чисто фронтендовый тип (нет изменений БД). Хранится в `frontend/composables/useCoverTemplates.ts`.
- Применение шаблона: записывает `spread.templateId = tpl.id` (уже было в БД), заменяет `textElements` (кроме sentinel x=-1), сохраняет `placements` (фото пользователя).
- Позиции текстовых слотов заданы в относительных координатах зоны (relX/relY/relW в %), при применении пересчитываются в абсолютные % canvas.
- Фон зон (frontBg/backBg/spineBg) применяется через `:style="{ background: activeCoverTemplate?.frontBg ?? ... }"` — вместо статичных Tailwind-классов.
- Для шаблонов с фото + градиентным оверлеем (тёмный оверлей снизу) — поле `frontOverlay?` рендерится поверх img.
- 31 шаблон в 5 группах: Нейтральные, Пастельные, Насыщенные, Тёмные, С фото.
- На обложке (kind=COVER) в боковой панели вместо Фото/Текст вкладок показывается "Стиль обложки" с миниатюрами.
- Превью шаблона — inline div с тремя зонами (back|spine|front), text slots как цветные полоски.

**Причина:** Фронтенд-only решение без изменения схемы — быстро, без рисков. Spread.templateId уже существовал, перегружаем его под cover template id.

---

## 2026-06-20 | Book Layout: обложка — единый 3-зонный canvas, cellIndex-соглашение

**Решение:**
- Разворот `kind=COVER` рендерится не как обычный разворот, а как единый canvas «задняя | корешок | лицевая».
- Физические размеры: 2×pageW + 12мм spine. Для 20×30 → 412×300мм, ratio ≈ 1.373.
- Фото лицевой → `cellIndex=0`, фото задней → `cellIndex=10` (пропуск из-за потенциального роста числа ячеек).
- Текст корешка → `BookTextElement` с `x=-1` (sentinel — отличает его от обычных overlay-текстов).
- Направляющие: bleed=3мм (красные), safe=5мм (красные пунктир), spine-границы (серые). Тумблер `showGuides`.
- `coverThumbUrl` в `GET /projects`: берёт `thumbKey` placement `cellIndex=0` из COVER-разворота. Null если обложка пустая — в карточке показывается BookIcon.
- В overview-режиме обложка занимает 2 колонки, показывает зоны.

**Причина:** Полиграфический стандарт. Обложка — единый лист, который обёртывает книгу. Редактирование должно отражать физическую реальность с корректными пропорциями и зонами.

---

## 2026-06-20 | Защита данных: только аддитивные миграции + обязательный бэкап

**Решение:**
- Схема обновляется ТОЛЬКО через `npx prisma db push --accept-data-loss` (никогда не `--force-reset`).
- Перед любым `db push` автоматически выполняется `scripts/backup-db.sh` (pg_dump → gzip → `/home/deploy/backups/`).
- Ежедневный cron: `0 3 * * * /home/deploy/maxmazunin/scripts/backup-db.sh`.
- Дампы хранятся 30 дней. Восстановление: `gunzip -c cabinet_DATE.sql.gz | psql -U cabinet -h localhost cabinet`.
- Все изменения схемы — ТОЛЬКО аддитивные (ADD COLUMN, CREATE TABLE). DROP требует явного подтверждения владельца.
- Деплой через `scripts/pm2-redeploy.sh` (backup → prisma db push → npm run build → pm2 restart).

**Причина:** Инцидент 2026-06-20 — `--force-reset` полностью уничтожил данные БД: пользователи, проекты книг, фотографии — всё удалено без возможности восстановления (бэкапа не было).

**Факты:**
- Сервер: 72.56.234.73, путь `/home/deploy/maxmazunin/`, PM2 (не docker-compose для запуска процессов).
- Docker установлен, но приложение работает через PM2 (`cabinet-backend` + `cabinet-frontend`).
- Postgres native (не в Docker), данные в `/var/lib/postgresql/16/main/`.
- Бэкап первый раз создан: `/home/deploy/backups/cabinet_20260620_105942.sql.gz`.

---

## 2026-06-20 | Book Layout: шаблоны — cellKinds для text/photo ячеек без отдельной БД-таблицы

**Решение:** Добавлено поле `cellKinds?: ('photo' | 'text')[]` в статический объект `LayoutTemplate`. Текстовые ячейки внутри CSS-grid рендерятся иначе (amber плейсхолдер), клик → `openTextModal`. Текстовые элементы хранятся в `textElements[slotIndex]` — маппинг по порядку слотов, без изменения схемы БД.

**Причина:** Не требует схемы БД, данные статические (шаблоны не меняются пользователями), CSS grid уже используется для фото-ячеек — text-ячейки встают в тот же грид.

---

## 2026-06-20 | Book Layout: оценка DPI — статические фракции ячеек на сервере

**Решение:** Физические размеры ячейки вычисляются из размера книги × фракции шаблона (hardcoded в `quality.util.ts`). DPI = min(photoW / cellW_inches, photoH / cellH_inches).

**Причина:** CSS grid areas сложно парсить на сервере. Для 11 шаблонов статический массив фракций проще и быстрее ORM-запроса или передачи CSS-параметров с клиента.

---

## 2026-06-20 | Book Layout: AI-улучшение — Real-ESRGAN ×2 на CPU, GFPGAN отключён из-за RAM

**Решение:**
- Python FastAPI микросервис (`enhance-service/`) на порту 8001, запущен через PM2 как `enhance-service`.
- Real-ESRGAN x2plus (`RealESRGAN_x2plus.pth`, 64MB) с tile_mode=256 (низкое потребление RAM).
- GFPGAN v1.4 (332MB) установлен, но **отключён** (`ENABLE_GFPGAN=false`): 1.9GB сервер без swap — во время GFPGAN-инференса peak RAM ~1.7-1.9GB → OOM kill.
- Для активации GFPGAN нужен сервер ≥ 3GB RAM или добавить swap.
- Python venv: `/home/deploy/enhance-venv/`. Модели: `/home/deploy/enhance-models/`.
- Запуск: `/home/deploy/run_enhance.sh` (PM2 wrapper).
- Fallback: если сервис недоступен → `SharpEnhanceClient` (brightness/sharpen/contrast, быстро, без AI).
- Enhance теперь асинхронный: `POST /enhance/start` → `{ jobId }`, `GET /enhance/job/:id` → поллинг.

**Производительность (CPU, 2 ядра):**
- 1200×896px → 2400×1792px за **~80 секунд**.
- Прогресс-бар interpolates 35→90% по времени (нет native callback в RealESRGANer).

**Причина:**
- Real-ESRGAN — реальный AI апскейл (не интерполяция), даёт чёткую текстуру и детали.
- tile_mode позволяет работать на сервере с малой RAM.
- PyTorch CPU torch — ~600MB disk, ~300MB RAM при загрузке (вместе с ESRGAN моделью ~450MB).

---

## 2026-06-20 | Book Layout: улучшение фото — хранить enhanced как отдельный файл, toggle useEnhanced

**Решение:** `enhancePhoto` создаёт `enh_{uuid}.jpg` рядом с оригиналом. Поле `useEnhanced` переключается отдельным endpoint. `enrichPhoto` автоматически подставляет enhanced-URL.

**Причина:** Оригинал не уничтожается → можно откатить в любой момент без повторной загрузки. База знаний в БД минимальна (2 nullable поля + 1 boolean).

---

## 2026-06-20 | Book Layout: AI-прогресс через симулированные шаги + реальный API параллельно

**Решение:** Анимация прогресса: 4 этапа с setTimeout (600ms/1400ms), реальный `autoLayout` вызов параллельно. Когда API завершился — переход сразу к "Готово!", окно закрывается через 1.5s.

**Причина:** SSE или polling усложняют backend. Симуляция даёт хороший UX без серверных изменений. Реальный прогресс всегда ≥ симулированного, потому что API в среднем занимает >2s.

---

## 2026-06-20 | Book Layout: photo edit via CSS (object-position + transform)

**Решение:** Масштаб и кадрирование фото в ячейке реализованы только через CSS: `object-fit: cover; object-position: {panX}% {panY}%; transform: rotate(Xdeg) scale(Y)`. Данные хранятся в `BookPlacement.scale/panX/panY`.

**Причина:** Не нужен canvas или серверная обрезка. CSS-подход работает мгновенно, scale/panX/panY легко сохраняются в БД и применяются при любом рендере.

---

## 2026-06-20 | Book Layout: XHR вместо $fetch для upload с прогрессом

**Решение:** Загрузка фото в редакторе — один файл = один `XMLHttpRequest` с `xhr.upload.onprogress`, очередь 3 concurrent через `async/await` worker. `$fetch` из composable используется для остального API.

**Причина:** `$fetch`/`fetch` не поддерживает per-file прогресс. XHR — единственный способ получить `onprogress` без потоковых API.

---

## 2026-06-20 | Book Layout: прямые $fetch вызовы вместо orval

**Решение:** `frontend/composables/useBookLayout.ts` вызывает backend через `$fetch` напрямую. Не используется orval/openapi.json для этого модуля.

**Причина:** orval требует snapshot openapi.json от запущенного бэкенда. Для нового сложного модуля проще написать типизированный composable руками, чем поддерживать цикл snapshot → генерация. В будущем можно синхронизировать в рамках полного обновления контракта.

---

## 2026-06-20 | Book Layout: prisma db push вместо migrate deploy

**Решение:** Схема на сервере обновляется через `npx prisma db push --accept-data-loss`. Миграционных файлов в `prisma/migrations/` нет.

**Причина:** Проект изначально поднимался без migration workflow — всё шло через `db push`. Переход на полноценные миграции требует ревизии и явной инициализации с baseline-миграцией. TBD.

---

## 2026-06-20 | Book Layout: шаблоны компоновки — статическая конфигурация

**Решение:** 11 шаблонов определены в `layout-templates.ts` как статический массив, не в БД.

**Причина:** Шаблоны никогда не меняются пользователями и не персонализируются. В БД они создали бы лишний JOIN + seed без преимуществ. Frontend получает их через `GET /templates`.

---

## 2026-06-20 | Book Layout: VisionClient адаптер за интерфейсом

**Решение:** `vision.adapter.ts` определяет интерфейс `VisionClient`. Единственная реализация сейчас — `ExifOnlyVisionClient` (сортировка по EXIF). При появлении `VISION_API_KEY` в env можно подключить реальный AI-провайдер без изменения сервиса.

**Причина:** Соответствует требованию "при отсутствии ключа — деградировать до EXIF, не падать".

---

## 2026-06-19 | Messenger: soft-delete сообщений

**Решение:** Сообщения не удаляются физически. При удалении устанавливается `deletedAt`, `body` очищается.

**Причина:** Сохранение истории чата, корректное отображение ответов на удалённые сообщения.

---

## 2026-06-19 | Messenger: cursor-пагинация сообщений (40/страница)

**Решение:** `GET /chats/:id/messages?cursor=<messageId>` возвращает 40 сообщений назад от курсора.

**Причина:** Чаты могут содержать тысячи сообщений — offset-пагинация была бы медленной.

---

## 2026-06-19 | VK Ads: снимок → дельта вместо прямого запроса дельт

**Решение:** Сохраняем накопленные снимки (`AdSnapshot`), дельты (`HourlyStat`) вычисляем post-factum.

**Причина:** VK Ads API возвращает только накопленные за день значения. Хранение сырых снимков позволяет пересчитать дельты при изменении алгоритма и детектировать полуночный сброс.

---

## 2026-06-19 | Messenger: GendirAccessGrant (матрица прав доступа к Гендиру)

**Решение:** MANAGER и DESIGNER не могут писать GEN_DIRECTOR без явного гранта от COMMERCIAL_DIRECTOR. Грант хранится в таблице `GendirAccessGrant`.

**Причина:** Защита Гендира от прямого потока сообщений от всех сотрудников.

---

## 2026-06-19 | MESSENGER_TEST_MODE для разработки

**Решение:** `MESSENGER_TEST_MODE=true` в `.env` отключает всю матрицу прав — все пользователи могут писать всем и создавать группы.

**Причина:** Удобство разработки и тестирования без необходимости назначать роли.

---

## 2026-06-19 | orval + openapi.json snapshot вместо live URL

**Решение:** `orval.config.ts` читает из `frontend/openapi.json` (зафиксированный snapshot), а не из `http://localhost:3001/api/docs-json`.

**Причина:** Позволяет генерировать клиент без запущенного бэкенда (CI, свежий клон). Для обновления: скопировать `/api/docs-json` → `openapi.json`.

---

## 2026-06-19 | JWT в localStorage (не httpOnly cookie)

**Решение:** Токен хранится в `localStorage('auth_token')` и читается в Pinia store.

**Причина:** Простота реализации для приватного кабинета с закрытым доступом. XSS-риски минимальны при отсутствии UGC на страницах, кроме мессенджера.

---

## 2026-06-19 | Nuxt SSR + Socket.IO через плагин `socket.client.ts`

**Решение:** Socket.IO клиент создаётся только на клиентской стороне через `plugins/socket.client.ts`.

**Причина:** Socket.IO несовместим с SSR; `.client.ts` суффикс гарантирует, что плагин не запустится на сервере.

---

## 2026-06-19 | Messenger: presence через WebSocket (presence:update/snapshot)

**Решение:** Заменили `user:online`/`user:offline` на единое событие `presence:update { userId, online }`. При подключении клиента — `presence:snapshot { onlineIds }` вместо REST-вызова.

**Причина:** Унифицированный контракт проще обрабатывать на клиенте; snapshot гарантирует актуальное состояние без дополнительного HTTP-запроса.

---

## 2026-06-19 | Messenger: emoji picker — vue3-emoji-picker (native mode)

**Решение:** `vue3-emoji-picker` в `native: true` режиме. Кнопка 🙂 в строке ввода открывает поповер над полем сообщения. Эмодзи вставляется на позицию курсора.

**Причина:** Библиотека ~70 KB, чистый Vue 3, не требует дополнительного сервера или CDN. `native: true` — нативные Unicode-эмодзи вместо картинок.

---

## 2026-06-20 | Messenger: isMine вычисляется на клиенте, не в WebSocket-событии

**Решение:** Gateway стрипает `isMine` перед бродкастом `message:new`/`message:edit`. Фронтенд вычисляет `isMine = message.sender?.id === auth.user?.id` в socket plugin.

**Причина:** `isMine` — sender-relative поле; при бродкасте в комнату все получатели получали `isMine: true` (от имени отправителя) → сообщение чужого пользователя отображалось как своё, пузырь справа, unreadCount не рос.

---

## 2026-06-20 | Messenger: loadedChats флаг в store

**Решение:** `loadedChats: Record<string, boolean>` в state store. Устанавливается после REST `loadMessages`. При открытии чата: загружаем историю только если `!store.loadedChats[chatId]`.

**Причина:** Без флага — если WS доставил сообщение в незагруженный чат, `addMessage` создаёт `messages[chatId] = [msg]`, потом при клике `length === 1` → REST не вызывается → история не грузится.

---

## 2026-06-20 | Messenger: layout 100dvh mobile-first

**Решение:** Корневой div `style="height:100dvh"`. Sidebar и main — `flex flex-col`, messages — `flex-1 overflow-y-auto min-h-0`. Input bar — `shrink-0 pb-safe` (env safe-area-inset-bottom).

**Причина:** `h-screen` на iOS некорректно учитывает адресную строку и клавиатуру. `100dvh` = dynamic viewport height, всегда точно занимает экран.

---

## 2026-06-19 | Messenger: CurrentUser decorator возвращает { id } не { sub }

**Решение:** `JwtStrategy.validate()` возвращает `{ id, email, role }`. В `messenger.controller.ts` интерфейс `JwtUser` содержит `id`, и все вызовы используют `u.id`.

**Причина:** Исходный код контроллера использовал `u.sub` (из JWT payload), но декоратор возвращает трансформированный Passport-объект где поле называется `id`.
