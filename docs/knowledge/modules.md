# Модули

## auth

**Файлы:** `backend/src/auth/`

| Эндпоинт | Защита | Описание |
|----------|--------|---------|
| `POST /api/auth/login` | публичный | email + password → JWT access token |
| `GET /api/auth/me` | JwtAuthGuard | возвращает { id, email, role } |

JWT payload: `{ sub: userId, email, role }`. Алгоритм: HS256. TTL: `JWT_EXPIRES_IN` (default `7d`).

Декораторы:
- `@CurrentUser()` → извлекает `{ sub, email, role }` из JWT
- `@Roles(Role.ADMIN)` → в паре с `RolesGuard`

Пользователей создаёт только ADMIN (через `/users`). Публичной регистрации нет.

Frontend: токен хранится в `localStorage('auth_token')` и Pinia `authStore.token`.

---

## users

**Файлы:** `backend/src/users/`

| Эндпоинт | Защита |
|----------|--------|
| `GET /api/users` | ADMIN |
| `POST /api/users` | ADMIN |
| `GET /api/users/:id` | ADMIN |
| `PATCH /api/users/:id` | ADMIN |
| `DELETE /api/users/:id` | ADMIN |

Создание пользователя задаёт `email`, `password` (хешируется bcrypt), `role` (USER/ADMIN).  
Messenger-поля (firstName, lastName, nickname и т.д.) обновляются через `/api/messenger/profile`.

---

## health

**Файлы:** `backend/src/health/`

`GET /api/health` → `{ status: 'ok' }`. Используется docker-compose healthcheck.

---

## vk-ads

**Файлы:** `backend/src/vk-ads/`

### Концепция снимок → дельта

VK Ads API возвращает **накопленные** за МСК-день значения (обнуляются в 00:00 МСК = 21:00 UTC).

1. Каждые `POLL_INTERVAL_MINUTES` (default 5) минут `VkAdsScheduler` вызывает `pollSnapshots()`.
2. Сохраняется `AdSnapshot` с `capturedAt = now()` и накопленными показателями.
3. После каждого poll (и кроном в `:02` каждого часа) — `computeRollupForLastHours(2)`.
4. Rollup для каждого часа: `delta = end_snapshot - baseline_snapshot` (где baseline = последний снимок **до** начала часа).
5. Обнуление в полночь: `if end.spend < baseline.spend` → delta = end (весь расход часа без вычитания).
6. Результат — `HourlyStat` с дельтами и вычисленными CPL/CPM/CPC.
7. `HourlyStat.isPreliminary = true` для последних 2 часов (VK ещё корректирует данные).

### Платформы VK API

| `VK_API_PLATFORM` | API | Токен |
|---|---|---|
| `new` (default) | ads.vk.com/api/v2 | Bearer-токен из ads.vk.com |
| `old` | vk.com API | токен + `VK_ACCOUNT_ID` |

### Эндпоинты

| Эндпоинт | Защита | Описание |
|----------|--------|---------|
| `GET /api/vk-ads/cabinets` | auth | список кабинетов |
| `GET /api/vk-ads/hourly?cabinetId&date` | auth | почасовые дельты за МСК-день |
| `GET /api/vk-ads/hour-profile?cabinetId&from&to` | auth | средний профиль по часу суток за период |
| `POST /api/vk-ads/poll` | ADMIN | ручной запуск сбора снимков |
| `GET /api/vk-ads/token-health` | auth | проверить валидность VK-токена → `{ok, message}` |

Даты везде принимаются в МСК (`YYYY-MM-DD`), конвертация в UTC внутри сервиса (UTC+3 без DST).

### Инициализация кабинетов

```bash
cd backend && npm run seed:cabinets   # создать VkCabinet-записи
# Затем активировать нужный кабинет:
# UPDATE "VkCabinet" SET "isActive" = true WHERE ...
```

### Prisma-модели

- `VkCabinet` — рекламный кабинет (id, title, externalAccountId, isActive)
- `AdSnapshot` — сырой снимок (cabinetId, campaignId, capturedAt, накопленные показатели)
- `HourlyStat` — вычисленная дельта за час (уникальность: cabinetId + campaignId + hourStartUtc)

---

## messenger

**Файлы:** `backend/src/messenger/`

### Подмодули

| Файл | Назначение |
|------|-----------|
| `messenger.controller.ts` | REST-эндпоинты |
| `messenger.gateway.ts` | Socket.IO WebSocket gateway (namespace `/messenger`) |
| `messenger.service.ts` | бизнес-логика: чаты, сообщения, участники |
| `permission.service.ts` | матрица прав доступа |
| `upload.controller.ts` | `POST /api/messenger/upload` — загрузка файлов (multer) |

### Типы чатов

| `ChatType` | Описание |
|-----------|---------|
| `DIRECT` | Личный чат между двумя пользователями |
| `GROUP` | Групповой чат |
| `NEWS` | Канал новостей (только руководство пишет) |

### Роли мессенджера (`MessengerRole`)

`GEN_DIRECTOR`, `COMMERCIAL_DIRECTOR`, `SALES_DIRECTOR`, `ROP`, `MANAGER`, `DESIGN_DIRECTOR`, `DESIGNER`, `PRODUCTION_HEAD`, `ASSEMBLER`, `PROGRAMMER`, `ACCOUNTANT`, `OTHER`

Компании: `IZIBOOK`, `IZINEON` (поле `companies: Company[]` на пользователе).

### Матрица прав (PermissionService)

LEADERSHIP = `[GEN_DIRECTOR, COMMERCIAL_DIRECTOR, SALES_DIRECTOR, ROP, DESIGN_DIRECTOR, PRODUCTION_HEAD]`

| Действие | Кто может |
|----------|----------|
| Создать группу | ADMIN или LEADERSHIP |
| Постить в NEWS | ADMIN или GEN_DIRECTOR |
| Назначить роль | ADMIN или LEADERSHIP |
| Написать в личку | Все, кроме MANAGER/DESIGNER → GEN_DIRECTOR (без гранта) |

**GendirAccessGrant** — COMMERCIAL_DIRECTOR выдаёт разрешение MANAGER/DESIGNER писать Гендиру.

**`MESSENGER_TEST_MODE=true`** — все ограничения выключены (все пишут всем). Используется в dev.

### REST-эндпоинты (все под JwtAuthGuard)

| Эндпоинт | Описание |
|----------|---------|
| `GET /api/messenger/profile` | свой профиль |
| `PATCH /api/messenger/profile` | обновить профиль |
| `GET /api/messenger/users?q=` | поиск пользователей |
| `PATCH /api/messenger/users/:id/role` | назначить роль (руководитель) |
| `GET /api/messenger/chats` | список чатов |
| `POST /api/messenger/chats` | создать группу |
| `POST /api/messenger/direct/:userId` | открыть/создать личный чат |
| `GET /api/messenger/chats/:id/messages?cursor=` | сообщения (cursor-пагинация, 40/раз) |
| `POST /api/messenger/chats/:id/messages` | отправить сообщение |
| `PATCH /api/messenger/messages/:id` | редактировать своё сообщение |
| `DELETE /api/messenger/messages/:id` | soft-delete своего сообщения |
| `POST /api/messenger/chats/:id/read` | отметить прочитанным |
| `GET /api/messenger/gendir-grants` | список грантов (КомДир) |
| `POST /api/messenger/gendir-grants` | выдать грант (КомДир) |
| `DELETE /api/messenger/gendir-grants/:id` | отозвать грант (КомДир) |
| `GET /api/messenger/online` | список онлайн-пользователей |
| `POST /api/messenger/upload` | загрузить файл → `{ storageKey, fileName, kind, url }` |

### WebSocket события

Подключение: токен в `socket.handshake.auth.token`. При connect gateway автоматически джоинит все комнаты пользователя.

| Клиент → сервер | Сервер → клиент |
|----------------|----------------|
| `chat:join` | `message:new` |
| `typing:start` | `message:edit` |
| `typing:stop` | `message:delete` |
| `read:mark` | `presence:snapshot` — список онлайн при подключении |
| | `presence:update { userId, online }` — изменение статуса |
| | `typing:start`, `typing:stop` |
| | `read:update` |

### Присутствие (Presence)

- Карта `userId → Set<socketId>` хранится в памяти gateway (один инстанс, Redis не нужен).
- При connect: gateway отправляет `presence:snapshot { onlineIds: string[] }` новому клиенту.
- При connect/disconnect: gateway бродкастит `presence:update { userId, online }` всем клиентам.
- Frontend: зелёная точка = онлайн, красная = офлайн. Показывается везде: список чатов (только DIRECT), шапка чата, контакты, @-упоминания. Текстовый `title`/`aria-label` для доступности.
- REST `GET /api/messenger/online` → `string[]` — fallback если socket подключился после mount.

### Profile gate (frontend)

При первом входе в мессенджер, если `profile.isComplete === false`, показывается модалка с заполнением профиля (firstName, lastName, nickname обязательны). Без заполненного профиля функции мессенджера недоступны.

### Типы сообщений (`MessageType`)

`TEXT`, `FILE`, `IMAGE`, `VIDEO`, `SYSTEM`

Soft-delete: `deletedAt` устанавливается, `body` очищается; запись в БД остаётся.

---

---

## book-layout

**Файлы:** `backend/src/book-layout/`, `frontend/pages/book-layout/index.vue`, `frontend/pages/book-layout/[id].vue`, `frontend/composables/useBookLayout.ts`

### Назначение
Редактор фотокниг: загрузка фото с EXIF-датой, расстановка по разворотам с компоновками-шаблонами, подписи шрифтами, авто-расстановка по хронологии, сохранение в БД, ссылка и номер заказа.

### Размеры книг (`BookSize`)

| Enum | Размер | Пропорция страницы | Пропорция разворота | Canvas обложки |
|------|--------|--------------------|---------------------|----------------|
| `S20x20` | 20×20 см | 1:1 | 2:1 | 412×200мм |
| `S20x30` | 20×30 см | 2:3 | 4:3 | 412×300мм |
| `S25x25` | 25×25 см | 1:1 | 2:1 | 512×250мм |
| `S30x30` | 30×30 см | 1:1 | 2:1 | 612×300мм |

### Обложка (SpreadKind.COVER)

Разворот с `index=0, kind=COVER` — обложка фотокниги. Рендерится как **единый горизонтальный canvas**: задняя сторона | корешок | лицевая сторона.

- **cellIndex=0** — фото лицевой стороны
- **cellIndex=10** — фото задней стороны
- **Корешок** — фиксированные 12мм. Текст корешка хранится как `BookTextElement` с `x=-1` (sentinel)
- **Направляющие** (bleed 3мм, safe zone 5мм, границы корешка) — переключаются кнопкой в canvas
- Canvas preview в списке проектов (`index.vue`): берётся `thumbKey` из placement с `cellIndex=0 COVER spread` → `coverThumbUrl` в ответе `GET /projects`

### REST-эндпоинты

| Эндпоинт | Защита | Описание |
|----------|--------|---------|
| `GET /api/book-layout/templates` | публичный | 11 шаблонов компоновки (1–8 ячеек) |
| `GET /api/book-layout/projects` | auth | список проектов пользователя |
| `POST /api/book-layout/projects` | auth | создать проект (title, size) |
| `GET /api/book-layout/projects/:id` | auth | полный проект (фото + развороты + расстановка) |
| `PATCH /api/book-layout/projects/:id` | auth | обновить title / orderNumber |
| `DELETE /api/book-layout/projects/:id` | auth | удалить проект + файлы |
| `GET /api/book-layout/projects/share/:token` | публичный | read-only просмотр по shareToken |
| `POST /api/book-layout/projects/:id/photos` | auth | загрузить фото (multipart, up to 50 файлов) |
| `DELETE /api/book-layout/photos/:photoId` | auth | удалить фото |
| `POST /api/book-layout/projects/:id/spreads` | auth | добавить разворот |
| `DELETE /api/book-layout/spreads/:spreadId` | auth | удалить разворот (не обложку) |
| `PATCH /api/book-layout/spreads/:spreadId` | auth | сохранить компоновку, расстановку, тексты |
| `POST /api/book-layout/projects/:id/auto-layout` | auth | авто-расстановка (EXIF + опц. AI) |
| `GET /api/book-layout/files/originals/:key` | публичный | оригинал фото |
| `GET /api/book-layout/files/thumbs/:key` | публичный | превью 600px |
| `POST /api/book-layout/projects/:id/cover/generate` | auth | запустить генерацию обложки Тревелбук → {jobId} |
| `GET /api/book-layout/cover/generate/status/:jobId` | auth | опросить статус (proxies enhance-service) |
| `POST /api/book-layout/projects/:id/cover/apply` | auth | применить результат: сохранить BookPhoto + поставить в cellIndex=0 + текстовые слои |

### Компоновки (layout-templates.ts)

44 статичных шаблона трёх видов. Возвращаются клиенту через `GET /templates`.

Поля `LayoutTemplate`:
- `kind: 'PHOTO' | 'TEXT' | 'MIXED'` — тип компоновки
- `cells` — количество ячеек в CSS grid (photo + text)
- `photoSlots` — сколько ячеек для фото
- `cellKinds?: ('photo' | 'text')[]` — вид каждой ячейки; не задано = все 'photo'
- `textSlots?: { x,y,w,h,fontSize,placeholder }[]` — дефолтные позиции/размеры для текстовых блоков
- `gridPadding?: string` — CSS padding для грида (например '7%' для шаблона «с полями»)
- `category: string` — группировка в панели (напр. «1 фото», «Смешанные», «Текст»)

Категории: «1 фото», «2 фото», «3 фото», «4 фото», «5 фото», «6 фото», «7 фото», «8 фото», «Смешанные» (11), «Текст» (8), «Обложка» (3).

**Ячейка 'text'** в spread canvas: рендерится как блок с заголовком/плейсхолдером (amber фон), клик → открывает модалку текста. Текстовые элементы хранятся в `textElements` по индексу слота (`textSlotIndex`).

**Smart template switching**: при смене шаблона фото переносятся по порядку в photo-ячейки нового шаблона (не просто фильтрация по cellIndex).

### Авто-расстановка

1. Сортировка фото по EXIF `DateTimeOriginal → uploadedAt` (надёжно, без AI).
2. Опциональный шаг AI: `VisionClient` адаптер из `vision.adapter.ts`. При отсутствии `VISION_API_KEY` деградирует до `ExifOnlyVisionClient`.
3. Группировка по чанкам ≤8 фото → выбор шаблона → создание `BookSpread` + `BookPlacement`.
4. Обложка (index=0) сохраняется, все `SPREAD`-развороты пересоздаются.

### Файловое хранилище

Папки: `uploads/books/` (оригиналы) и `uploads/books/thumbs/` (превью 600px via sharp).  
Сервис создаёт директории при первом запуске. После фото-upload: EXIF читается через `exifr`.

### Модели Prisma

```
User → BookProject (1:N)
BookProject → BookPhoto (1:N)
BookProject → BookSpread (1:N)
BookSpread → BookPlacement (1:N)
BookSpread → BookTextElement (1:N)
BookPlacement → BookPhoto (N:1)
```

### Frontend

- `frontend/composables/useBookLayout.ts` — типизированный API-клиент (без orval)
- `frontend/pages/book-layout/index.vue` — список проектов, создание
- `frontend/pages/book-layout/[id].vue` — полный редактор: 5-шаговый онбординг, загрузка с прогрессом (XHR per-file, 3 concurrent), нижние табы Галерея/Шаблоны/ИИ/Ещё, режим разворота/обзора, DnD+tap-to-place, photo edit modal (rotate/scale/pan), text modal (S/M/L/XL + цвета + шрифты)
- `frontend/pages/book-layout/share/[token].vue` — read-only просмотр

Drag & drop: HTML5 DnD (desktop) + tap-to-select-then-tap-cell (любая платформа).  
Auto-save: debounce 2s после любого изменения разворота, `beforeunload` предупреждение.  
shareToken: уникальная ссылка `/book-layout/share/{token}` без авторизации.

### BookPlacement поля (добавлено 2026-06-20)

`scale: Float @default(1)` — масштаб фото в ячейке (1.0–2.5).  
`panX: Float @default(50)` — горизонтальное смещение кадрирования (0–100, CSS object-position %).  
`panY: Float @default(50)` — вертикальное смещение.  
CSS в ячейке: `object-fit: cover; object-position: {panX}% {panY}%; transform: rotate(Xdeg) scale(Y)`.

### Оценка качества печати (добавлено 2026-06-20)

`GET /api/book-layout/photos/:photoId/quality?bookSize=S20x20&templateId=2h&cellIndex=0` — возвращает `QualityResult`:
- `effectiveDpi` — минимум(photoW / cellWidthInches, photoH / cellHeightInches)
- `level` — `excellent`(≥280) / `good`(≥200) / `fair`(≥150) / `poor`(≥100) / `very_poor`(<100)
- `levelLabel`, `levelColor`, `recommendation` — человекочитаемые метки
- `photoPixels`, `requiredPixels`, `cellCm` — размеры для отображения пользователю

Утилита: `backend/src/book-layout/quality.util.ts`. Фракции ячеек для 11 шаблонов прошиты статически.

### Улучшение фото (обновлено 2026-06-21)

**Async pipeline (основной):** `POST /api/book-layout/photos/:photoId/enhance/start` `{ bookSize, templateId, cellIndex }` → `{ jobId }`.  
Клиент поллит `GET /api/book-layout/photos/:photoId/enhance/job/:jobId` → `{ status, progress, message, photo? }`.  
По завершении (`status='done'`) в ответе есть `photo` с новыми `enhancedKey/enhancedThumbKey/width/height`.

**AI пайплайн (enhance-service, порт 8001):**
1. **GFPGAN** на оригинальном изображении — восстановление лиц (fidelity=0.85). Запускается первым, пока RAM свободна.
2. **Real-ESRGAN ×2** (первый проход) — апскейл после GFPGAN.
3. **Real-ESRGAN ×2** (второй проход) — если нужный масштаб >2.5× (например, большая ячейка).
4. Ресайз до точного target (target = 300 DPI для конкретной ячейки по `calculatePrintQuality()`).
5. Unsharp mask (sigma=0.7, strength=0.4), save JPEG q95.

**Target-aware:** бэкенд вычисляет `requiredPixels` из `calculatePrintQuality()` и передаёт `target_w/target_h` в Python-сервис. Python сам определяет нужный масштаб и количество проходов.

**Оригинал никогда не удаляется.** Улучшенная версия = отдельный файл.

**Память и производительность:**  
- GFPGAN модели: GFPGANv1.4.pth (333MB) + facexlib detection (111MB) + facexlib parsing (80MB).  
- ESRGAN модель: RealESRGAN_x2plus.pth (63MB, ~200MB RSS в PyTorch).  
- Пайплайн: GFPGAN освобождается до ESRGAN (`del restorer; gc.collect(); malloc_trim(0)`).  
- Пик RSS: ~1100–1150MB (второй ESRGAN проход на 1562×2560).  
- PM2 `max-memory-restart=1500M`. Swap 2GB обязателен.  
- Время для 781×1280 → 2362×3543: ~450s (7.5 мин). NestJS timeout: 660s.  
- axios timeout для поллинга статуса: 30s (torch.load держит GIL до 15с).

**Fallback:** если enhance-service недоступен → `SharpEnhanceClient` (sharpen + normalise, без апскейла). NestJS переключается на AI клиент при следующем запросе (после рестарта enhance-service).

`POST /api/book-layout/photos/:photoId/enhance/apply` `{ apply: boolean }` — переключает `useEnhanced` в БД.

Адаптер: `backend/src/book-layout/enhance.adapter.ts` — `AiEnhanceClient`, `SharpEnhanceClient`, фабрика `createEnhanceClient()`.  
`enrichPhoto()` в сервисе отдаёт enhanced-URL когда `useEnhanced=true`.

**Переменные окружения enhance-service:**
- `ENABLE_GFPGAN=true` — включить GFPGAN
- `GFPGAN_FIDELITY=0.85` — степень восстановления лиц (0=оригинал, 1=полный AI)

### Переменные окружения

| Переменная | Назначение |
|-----------|-----------|
| `VISION_API_KEY` | Ключ AI-провайдера для авто-анализа фото (TBD; при отсутствии — только EXIF) |
| `IMAGE_ENHANCE_API_KEY` | Ключ AI-апскейлера (TBD; при отсутствии — sharp sharpen/normalise) |

---

## Prisma-схема (сводка)

```
User → Message (1:N)
User → ChatMember (1:N)
User → GendirAccessGrant (1:1, GrantedTo)
User → BookProject (1:N)
Chat → ChatMember (1:N)
Chat → Message (1:N)
Message → Attachment (1:N)
Message → Mention (1:N)
Message → MessageRead (1:N)
VkCabinet → AdSnapshot (1:N)
VkCabinet → HourlyStat (1:N)
BookProject → BookPhoto (1:N)
BookProject → BookSpread (1:N)
BookSpread → BookPlacement (1:N)
BookSpread → BookTextElement (1:N)
VkConversation → VkMessage (1:N)
VkConversation → VkClient (1:1)
```

---

## assistant / ИИ-ассистент (полный модуль)

Страница `/assistant` — родительский layout с левым меню (8 вкладок). Весь раздел под `JwtAuthGuard`.

### Вкладки и маршруты

| Маршрут | Описание |
|---------|---------|
| `/assistant/clients` | Список VK-клиентов с CRM-статусом, тегами, поиском, пагинацией 30/50/100/500/1000 |
| `/assistant/orders` | Заказы вручную: CRUD, привязка к клиенту и статусу заказа, архив вместо удаления |
| `/assistant/messenger` | 3-колоночный VK-мессенджер с быстрыми фразами (⚡) |
| `/assistant/phrases` | Быстрые фразы по категориям, вставка в мессенджер |
| `/assistant/directories` | Справочники: CRM-статусы, Теги, Статусы заказов (CRUD + цвет + порядок + архив) |
| `/assistant/broadcasts` | Рассылки VK: сегмент → предпросмотр → запуск с паузой/отменой, прогресс |
| `/assistant/ai-settings` | Системный промпт + параметры модели + база знаний (AiKnowledgeEntry) |
| `/assistant/settings` | Заглушка «Скоро» |

### Backend-модули (NestJS)

| Модуль | Файлы | Эндпоинты |
|--------|-------|-----------|
| `assistant` | `backend/src/assistant/` | `/api/assistant/conversations`, `…/messages`, `…/send`, `…/clients/:peerId`, `sync`, `token-health` |
| `directories` | `backend/src/directories/` | `/api/directories/crm-statuses`, `…/tags`, `…/order-statuses` — CRUD (GET/POST/PATCH) |
| `clients` | `backend/src/clients/` | `/api/clients` — список с фильтрами; `/api/clients/:id` — карточка + PATCH |
| `orders` | `backend/src/orders/` | `/api/orders` — CRUD + DELETE (архивация); пагинация + фильтры |
| `phrases` | `backend/src/phrases/` | `/api/phrases` — сгруппированные фразы; `/phrases/categories`, `/phrases/phrases` — CRUD |
| `broadcasts` | `backend/src/broadcasts/` | `/api/broadcasts` — CRUD кампаний; `…/segment-preview`; `…/:id/start/pause/cancel` |
| `ai-settings` | `backend/src/ai-settings/` | `/api/ai-settings` — GET/PATCH настроек; `/api/ai-settings/knowledge` — CRUD |

### Prisma-модели (добавлены 2026-06-21)

**Расширение VkClient:** firstName, lastName, vkUrl, avatar, firstContactAt, crmStatusId (FK→CrmStatus), tagLinks (M2M)

| Модель | Ключевые поля |
|--------|--------------|
| `CrmStatus` | id, name, color, order, archived |
| `Tag` | id, name, color, archived |
| `ClientTag` | clientId + tagId (M2M join) |
| `OrderStatus` | id, name, color, order, archived |
| `Order` | id, number (autoincrement), clientId, orderStatusId, amount, items, comment, archived |
| `PhraseCategory` | id, name, order, archived |
| `QuickPhrase` | id, categoryId, title, text, hotkey?, order, archived |
| `Campaign` | id, name, channel, messageText, segmentFilter(json), status(enum), scheduledAt, totalCount, sentCount, errorCount |
| `CampaignRecipient` | id, campaignId, peerId, clientName, status(enum PENDING/SENT/ERROR/SKIPPED), sentAt, error |
| `AiSettings` | singleton id="default", systemPrompt, provider, model, temperature, draftMode |
| `AiKnowledgeEntry` | id, category, title, content, enabled, order |

### Адаптер VkMessengerClient (assistant/vk-messenger.client.ts)
Переиспользуется в `BroadcastsModule` для `sendMessage(peerId, text)`. Все методы VK API только здесь.
`sendMessage(peerId, text, attachment?)` — `attachment` это comma-separated VK attachment string (`photo-12_34,video-12_34`).

### Утилита VK-вложений (assistant/vk-attachments.util.ts)
- `parseVkMarkers(text, clientName?)` — заменяет `[Имя]` именем клиента, извлекает маркеры `[type<owner>_<id>]` в строку `attachment`, удаляет их из текста.
- `extractMarkerFromUrl(url, type)` — из VK URL извлекает маркер `[type-owner_id]`.
- Маркеры в тексте фраз: `[photo...]`, `[video...]`, `[clip...]`, `[audio...]`, `[audio_message...]`, `[doc...]`.

### Seed быстрых фраз
- Файл данных: `backend/seed/quick_phrases_seed.json` (297 фраз, 15 категорий).
- Скрипт: `npm run seed:phrases` (→ `backend/prisma/seed-phrases.ts`).
- Idempotent: upsert по stable-id `seed_cat_*` / `seed_ph_*`; не удаляет данные.
- При первом запуске заполняет `AiSettings.systemPrompt` бизнес-контекстом ИЗИБУК.

### Рассылки — защита от блокировок VK
- Пауза 1100мс между сообщениями (≈54/мин)
- Дневной лимит 10 000 в `BroadcastsService.DAILY_LIMIT`
- Отправка только клиентам с реальным VK-диалогом (`conversation: { isNot: null }`)
- Асинхронная (фоновый `runSend`), не блокирует сайт
- Пауза/отмена через обновление статуса кампании в БД

### Справочники — дефолты
При `DirectoriesService.onModuleInit()` — idempotent upsert дефолтных CRM-статусов и статусов заказов. Теги — только вручную.

### Frontend composable
- `frontend/composables/useAssistantModule.ts` — API для всех 6 новых модулей
- `frontend/composables/useAssistant.ts` — API VK-мессенджера (прежний, без изменений)

### Переменные окружения

| Переменная | Описание |
|-----------|---------|
| `VK_GROUP_TOKEN` | Community access token с правом messages |
| `VK_GROUP_ID` | ID сообщества |
| `AI_API_KEY` | Ключ ИИ-провайдера (TBD, для будущей генерации ответов) |

### Важные детали

- VK token: при протухании — красный баннер на `/assistant/messenger`
- `from_id = -group_id` → исходящее (OUT) от сообщества
- CRM-поле `crmStatus` в `VkConversation` — устаревшее (string), новое — `VkClient.crmStatusId` (FK)
- Schema обновляется через `prisma db push` (не migrate deploy) — без миграционных файлов
