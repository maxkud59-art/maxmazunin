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

---

## finance — Финансы (ДДС + ПНЛ) [добавлен 2026-06-21]

**Файлы:** `backend/src/finance/`, `frontend/pages/finance.vue`, `frontend/pages/finance/`, `frontend/composables/useFinance.ts`

### Методология

- **ДДС** (кассовый метод) — фактическое движение денег по счетам. Не разделяет P&L/non-P&L.
- **ПНЛ** (метод начисления) — выручка признаётся в момент перехода заказа `FinOrder` в статус `SHIPPED` (выдача в СДЭК), а не при получении оплаты. Авансы, тело кредита, переводы, депозиты = не выручка. Расходы — операции с `isPnl=true`.
- Суммы хранятся в **копейках (Int)** — нет ошибок округления Float.

### Сущности

| Модель | Назначение |
|--------|-----------|
| `FinAccount` | Счёт (банк, наличные, копилка). `currentBalance` = `openingBalance` + сумма всех операций |
| `FinCategory` / `FinSubcategory` | Статьи ДДС (type=income/expense/..., group, isPnl) |
| `FinOperation` | Операция: дата, счёт, сумма, статья, проект, контрагент, комментарий, тип, isPnl, источник (MANUAL/BANK_IMPORT/CDEK_IMPORT). Уникальный индекс (source, externalId) — идемпотентный импорт |
| `FinOrder` | Заказ для ПНЛ. Статус: PREPAY → PAID_50 → SHIPPED → DELIVERED / REFUNDED |
| `AccrualEntry` | Начисление: создаётся при SHIPPED (REVENUE) и REFUNDED (REFUND). Основа ПНЛ-отчёта |

### Seed по умолчанию (OnModuleInit, idempotent)

5 счетов: Основной (BANK), Счёт 4658 (BANK), Счёт ИзиБук (BANK), Копилка (SAVINGS), Копилка 2 (SAVINGS).
~25 категорий по группам: Доходы от EasyBook, Доходы от EasyNeon, Доходы от ИзиБаня, Маркетинг, Операционные расходы, Персонал, Налоги.

### API (все под JwtAuthGuard)

| Группа | Эндпоинты |
|--------|----------|
| Счета | `GET/POST /api/finance/accounts`, `PATCH /api/finance/accounts/:id` |
| Статьи | `GET/POST /api/finance/categories`, `PATCH …/:id`, `POST …/:id/subcategories`, `PATCH /api/finance/subcategories/:id` |
| Операции | `GET/POST /api/finance/operations`, `PATCH/DELETE …/:id` |
| Заказы ПНЛ | `GET/POST /api/finance/orders`, `PATCH/DELETE …/:id` |
| Отчёты | `GET /api/finance/reports/dashboard`, `.../cashflow`, `.../pnl` |
| Импорт | `POST /api/finance/import/bank`, `.../cdek` |
| Здоровье | `GET /api/finance/integrations/health` |

### Адаптеры (заглушки)

- `bank.adapter.ts` — `fetchTransactions(from, to)`. Реализовать: вставить банковский API-код, токен — `BANK_API_TOKEN` в `.env`.
- `cdek.adapter.ts` — `fetchDeliveries(from, to)`, `fetchByTrackNumber(track)`. Токены — `CDEK_CLIENT_ID` + `CDEK_CLIENT_SECRET`.

### Frontend

- `/finance/dashboard` — KPI-дашборд (ДДС + ПНЛ за период, остатки по счетам)
- `/finance/operations` — CRUD операций с фильтрами и пагинацией
- `/finance/cashflow` — отчёт ДДС (остатки по счетам + разбивка по статьям)
- `/finance/pnl` — П&Л: чистая выручка, расходы по группам, чистая прибыль, рентабельность, начисления
- `/finance/orders` — управление заказами (PREPAY→SHIPPED признаёт выручку)
- `/finance/accounts` — CRUD счетов
- `/finance/categories` — CRUD статей и подстатей
- `/finance/ai-finance` — AI-финансист (очередь, аналитика, прогноз, аномалии, правила)

### AI-финансист (`finance/ai-finance`) [добавлен 2026-06-27]

Полная документация: [docs/knowledge/ai-finance.md](ai-finance.md)

Краткая схема:
1. Незакатегоризированные операции → правило или Claude → PROPOSED
2. Менеджер подтверждает → CONFIRMED + upsert CategorizationRule
3. Аналитика: ДДС + ПНЛ за период с AI-комментарием
4. Прогноз: cashflow (90д история → недели) + PNL (пайплайн заказов), `estimate:true`
5. Аномалии: дубли, 3σ-выбросы, бэклог

### Проекты

`FinProject` enum: `EASYBOOK | EASYNEON | IZIBANYA | GENERAL`

---

---

## crm — CRM-данные (read-only) [добавлен 2026-06-23]

**Файлы:** `backend/src/crm/`, `frontend/pages/crm.vue`

### Назначение

Read-only доступ к данным production CRM (EasyBook) через отдельную Prisma-клиентскую библиотеку. Данные в отдельной БД (`CRM_DATABASE_URL`). Локально — база `crm_explorer`, восстановленная из дампа.

### Второй Prisma-клиент

`backend/prisma/crm.prisma` с `output = "../node_modules/@prisma/crm-client"`.  
Сервис: `PrismaCrmService extends PrismaClient` (из `@prisma/crm-client`).  
Генерация: `npm run db:generate:crm` → `npx prisma generate --schema=prisma/crm.prisma`.

Причина двух клиентов: схемы конфликтуют (разные типы `User.id`: cuid vs autoincrement). Подробнее в `decisions.md` (2026-06-23).

### Эндпоинты (все под JwtAuthGuard)

| Эндпоинт | Описание |
|----------|---------|
| `GET /api/crm/deals` | Список сделок (пагинация, поиск, фильтры) |
| `GET /api/crm/deals/statuses` | Уникальные статусы сделок |
| `GET /api/crm/deals/groups` | Группы (команды) |
| `GET /api/crm/deals/workspaces` | Воркспейсы |

Query-параметры `GET /api/crm/deals`: `page`, `limit` (max 200), `search`, `status`, `groupId`, `workSpaceId`, `periodFrom` (YYYY-MM), `periodTo` (YYYY-MM).

### Frontend

`frontend/pages/crm.vue` — таблица сделок с поиском, фильтрами, пагинацией. Использует `useNuxtApp().$api` (axios с JWT Bearer).

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

Страница `/assistant` — родительский layout с левым меню (9 вкладок). Весь раздел под `JwtAuthGuard`.

### Вкладки и маршруты

| Маршрут | Описание |
|---------|---------|
| `/assistant/clients` | Список VK-клиентов с CRM-статусом, тегами, коллапсируемой панелью фильтров (2 вкладки: по клиентам / по заказам), пагинацией 30/50/100/500/1000 |
| `/assistant/orders` | Заказы вручную: CRUD, привязка к клиенту и статусу заказа, архив вместо удаления |
| `/assistant/messenger` | 3-колоночный VK-мессенджер с быстрыми фразами (⚡) |
| `/assistant/phrases` | Быстрые фразы по категориям, вставка в мессенджер |
| `/assistant/bots` | Визуальный конструктор VK-ботов (правила + сценарии) |
| `/assistant/directories` | Справочники: CRM-статусы, Теги, Статусы заказов (CRUD + цвет + порядок + архив) |
| `/assistant/broadcasts` | Рассылки VK: сегмент → предпросмотр → запуск с паузой/отменой, прогресс |
| `/assistant/ai-settings` | Системный промпт + параметры модели + база знаний (AiKnowledgeEntry) |
| `/assistant/settings` | Заглушка «Скоро» |

### Backend-модули (NestJS)

| Модуль | Файлы | Эндпоинты |
|--------|-------|-----------|
| `assistant` | `backend/src/assistant/` | `/api/assistant/conversations`, `…/messages`, `…/send`, `…/clients/:peerId`, `sync`, `token-health` |
| `directories` | `backend/src/directories/` | `/api/directories/crm-statuses`, `…/tags`, `…/order-statuses` — CRUD (GET/POST/PATCH) |
| `clients` | `backend/src/clients/` | `/api/clients` — список с расширенными фильтрами (search, phone, city, vkUrl, email, crmStatusIds, tagIds+tagMatch, dateRanges, peerIds, ids, orderFilters); `/api/clients/:id` — карточка + PATCH |
| `orders` | `backend/src/orders/` | `/api/orders` — CRUD + DELETE (архивация); пагинация + фильтры |
| `phrases` | `backend/src/phrases/` | `/api/phrases` — сгруппированные фразы; `/phrases/categories`, `/phrases/phrases` — CRUD |
| `broadcasts` | `backend/src/broadcasts/` | `/api/broadcasts` — CRUD кампаний; `…/segment-preview`; `…/:id/start/pause/cancel` |
| `ai-settings` | `backend/src/ai-settings/` | `/api/ai-settings` — GET/PATCH настроек; `/api/ai-settings/knowledge` — CRUD |
| `bots` | `backend/src/bots/` | `/api/bots` — CRUD ботов и блоков; `/api/bots/:id/logs`; `/api/bots/scenario/add-client` |

### Модуль Боты (добавлен 2026-06-21)

**Два режима:**
- **RULE** — правило «условия → действия». При каждом VK-событии проверяются триггеры; если совпали — выполняются блоки-действия по порядку.
- **SCENARIO** — воронка с шагами. Клиент «попадает» в сценарий по триггеру и проходит шаги; состояние хранится в `ClientScenarioState` и переживает рестарт.

**Компоненты:**
- `BotsService` — CRUD ботов, шагов, дублирование с ремаппингом nextStepId/branches, reorder.
- `BotEngineService` — движок исполнения. Обрабатывает VkEvent, матчит триггеры, исполняет шаги, управляет состоянием сценариев. `@Cron('* * * * *')` — каждую минуту возобновляет отложенные шаги (DELAY).
- `VkBotLongPollService` — `OnModuleInit` запускает асинхронный цикл Long Poll (groups.getLongPollServer → poll {server}). Events: `message_new`, `message_event`, `message_allow`, `message_deny`. Экспоненциальный back-off при ошибках. Отключается если `VK_GROUP_TOKEN`/`VK_GROUP_ID` не заданы.

**Типы блоков (BotStepType):**
`TRIGGER | SEND_MESSAGE | SET_CRM_STATUS | SET_TAGS | SET_ORDER_STATUS | MARK_IMPORTANT | EXTRACT_FIELD | SET_REMINDER | ASSIGN_MANAGER | NOTIFY_MANAGER | LOG_STAT | CONDITION | DELAY | END_SCENARIO | UNSUBSCRIBE | GOTO_STEP`

**Конфиг блоков хранится как JSON** (`BotStep.config`). Гибко — добавление новых типов не требует миграции.

**Клавиатура VK:** inline / нижняя, кнопки text/callback/open_link, цвета primary/secondary/positive/negative. Конструктор в UI. Keyboard JSON сохраняется в `SEND_MESSAGE.config.keyboard` и передаётся как `keyboard` param в `messages.send`.

**Подстановка переменных:** `[Имя]`, `[Фамилия]`, `[Телефон]`, `[Город]`, `[Статус]`, `[startParam]`, `[customVar]` (из vars сценария).

**Вложения:** `[photo123_456]`, `[video789_012]` в тексте → разбираются в attachment-строку VK.

**Идемпотентность:** processedIds Set (500 записей) — дедупликация событий при повторной доставке (failed ts=1).

**Задержки:** DELAY-блок → `ClientScenarioState.scheduledAt = now() + ms`, `status = WAITING_DELAY`. Cron каждую минуту находит просроченные состояния и возобновляет.

**Лимиты VK:** Long Poll wait=25s, экспоненциальный retry до 60s, не блокирует event loop.

### Prisma-модели (добавлены 2026-06-21)

**VkClient поля:** firstName, lastName, fio, vkUrl, avatar, phone, email, city, country, source, note, birthDate, firstContactAt, nextContactDate, lastContactAt, crmStatusId (FK→CrmStatus), tagLinks (M2M). Индексы: firstContactAt, nextContactDate, crmStatusId, phone.

| Модель | Ключевые поля |
|--------|--------------|
| `CrmStatus` | id, name, color, order, archived |
| `Tag` | id, name, color, archived |
| `ClientTag` | clientId + tagId (M2M join) |
| `OrderStatus` | id, name, color, order, archived |
| `Order` | id, number (autoincrement), clientId, orderStatusId, amount, items, comment, archived |
| `PhraseCategory` | id, name, order, archived |
| `QuickPhrase` | id, categoryId, title, text, hotkey?, order, archived |
| `Campaign` | id, name, channel, messageText, attachments(json), audienceType(vkIds\|clientIds\|filter), audienceConfig(json), segmentFilter(json), description, status(enum), scheduledAt, totalCount, sentCount, errorCount, archived |
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

### Рассылки (BroadcastsModule) — эндпоинты

| Эндпоинт | Описание |
|----------|---------|
| `GET /api/broadcasts` | Список кампаний (без архивных) |
| `GET /api/broadcasts/daily-limit` | Дневной лимит `{limit, sentToday, remaining, vkConfigured, groupId}` |
| `GET /api/broadcasts/:id` | Кампания с получателями (до 200) |
| `POST /api/broadcasts` | Создать кампанию |
| `PATCH /api/broadcasts/:id` | Обновить (только DRAFT/PAUSED/FAILED) |
| `DELETE /api/broadcasts/:id` | Архивировать (archived=true, данные не удаляются) |
| `POST /api/broadcasts/audience-preview` | Предпросмотр аудитории для всех 3 типов |
| `POST /api/broadcasts/:id/start` | Запустить → создаёт CampaignRecipient + фоновый runSend |
| `POST /api/broadcasts/:id/pause` | Поставить на паузу |
| `POST /api/broadcasts/:id/cancel` | Отменить (статус FAILED) |

### Рассылки — типы аудитории

| `audienceType` | `audienceConfig` | `segmentFilter` |
|---|---|---|
| `vkIds` | `{ vkPeerIds: number[] }` | не используется |
| `clientIds` | `{ clientIds: string[] }` | не используется |
| `filter` | `{}` | CRM-фильтры (crmStatusId, tagId, dateFrom, dateTo, search, city, source, ...) |

При `audienceType=filter` — `buildClientWhere(segmentFilter)` фильтрует только клиентов с VK-диалогом.

### Рассылки — защита от блокировок VK
- Пауза 1100мс между сообщениями (≈54/мин); настраивается через `BROADCAST_DAILY_LIMIT` env
- Дневной лимит 10 000 (default); настраивается через `BROADCAST_DAILY_LIMIT` env
- Отправка только клиентам с реальным VK-диалогом (`conversation: { isNot: null }`)
- Асинхронная (фоновый `runSend`), не блокирует сайт
- Пауза/отмена через обновление статуса кампании в БД
- `parseVkMarkers` применяется при отправке → `[Имя]` подставляется + вложения передаются отдельным полем

### Рассылки — кнопка из Клиентов
- `clients.vue` → кнопка «📢 Создать рассылку» в footer
- Передаёт текущие фильтры как `?fromFilter=<json>` в `/assistant/broadcasts`
- `broadcasts.vue` читает `route.query.fromFilter`, открывает форму с audienceType=filter и предзаполненными фильтрами, автоматически показывает предпросмотр аудитории

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

---

## dialog-analysis

**Файлы:** `backend/src/dialog-analysis/`

| Эндпоинт | Метод | Описание |
|----------|-------|---------|
| `POST /api/dialog-analysis/run` | ADMIN | Запустить пакетную разметку (limit=200) |
| `GET /api/dialog-analysis/stats` | ADMIN | Статистика разметки по этапам |

**Cron:** каждые 10 минут — `analysis.worker.ts` обрабатывает пачку из 50 диалогов без `DialogAnalysis`.

**LLM-стратегия:**
- `LLM_MODE=mock` (default) → MockLLM, детерминирован по sha256(conversationId)
- `LLM_MODE=anthropic` + `ANTHROPIC_API_KEY` → AnthropicLLM stub (готов к реализации)
- Автофоллбек на mock если ключ отсутствует
- `DAILY_LLM_BUDGET` (default 1000) — счётчик в LlmBudgetLog
- `QA_SAMPLE_PCT` (default 3) — % диалогов, которые всегда идут в LLM несмотря на prefilter

**Prefilter (без LLM):**
- 0 клиентских сообщений → `CONTACT`
- 0 ответов менеджера → `CONTACT`
- Нет ценовых ключевых слов + < 3 клиентских сообщения → `REPLIED`

---

## experiments

**Файлы:** `backend/src/experiments/`

| Эндпоинт | Метод | Описание |
|----------|-------|---------|
| `POST /api/experiments` | Создать DRAFT эксперимент |
| `GET /api/experiments` | Список |
| `GET /api/experiments/:id` | Один эксперимент + снапшоты |
| `GET /api/experiments/:id/results` | Текущие результаты (live) |
| `POST /api/experiments/:id/start` | DRAFT → RUNNING |
| `POST /api/experiments/:id/stop` | → STOPPED |
| `POST /api/experiments/:id/decide` | **Только человек** → DECIDED + winnerVariantId |
| `POST /api/experiments/:id/assign` | Назначить вариант сделке |
| `GET /api/experiments/:id/bias-check` | Проверка перекоса по менеджерам |
| `POST /api/experiments/:id/snapshot` | Ручной снапшот (cron делает в полночь) |

**Правила значимости:** `nMatured ≥ minSamplePerVariant` AND `p < pThreshold` AND знак z стабилен ≥ 3 дня.

**Smoke test:** `npm run smoke:experiments` — 29 проверок без API-ключей.

---

## analytics

**Файлы:** `backend/src/analytics/`

| Эндпоинт | Параметры | Описание |
|----------|-----------|---------|
| `GET /api/analytics/funnel` | `from`, `to`, `managerId` | Воронка по `DialogAnalysis` |

Возвращает: этапы (count/conv%), возражения, CTA-влияние, день-в-день, breakdown по менеджерам.

---

## audience

**Файлы:** `backend/src/audience/`

| Эндпоинт | Описание |
|----------|---------|
| `POST /api/audience/events` | Принять рекламное событие (идемпотентно по dedupeKey) |
| `GET /api/audience/funnel` | Воронка: counts по 9 этапам + конверсии + biggest drop |
| `GET /api/audience` | Список сегментов с memberCount и статусом последнего синка |
| `POST /api/audience` | Создать сегмент |
| `GET /api/audience/:id` | Один сегмент + история синков |
| `POST /api/audience/:id/sync` | Синхронизировать сегмент с VK Ads |
| `POST /api/audience/lal/build` | Собрать LaL-сид из плательщиков и синхронизировать |

**Переменные:** `VK_SYNC_ENABLED` (false=DRY_RUN), `VK_ADS_TOKEN`, `SILENT_FOLLOWUP_MINUTES` (30), `SILENT_FOLLOWUP_TEXT`.

**Cron:** followup молчунов каждые 10 мин, custom audience sync каждые 6 ч, LaL refresh в 03:00.

**Хуки в BotEngine:** `message_allow` → `DIALOG_ALLOWED`, `message_new` → `FIRST_MESSAGE` (fire-and-forget).

## ai-assistant

**Файлы:** `backend/src/ai-assistant/`

| Эндпоинт | Описание |
|----------|---------|
| `GET /api/ai-assistant/conversations` | Список диалогов с lifecycleStage |
| `GET /api/ai-assistant/conversations/:id/panel` | Полная панель: сообщения, SLA, действия, заметки |
| `PATCH /api/ai-assistant/conversations/:id/stage` | Сменить стадию жизненного цикла (только менеджер) |
| `POST /api/ai-assistant/conversations/:id/coach` | Получить AI-советы (без автоотправки) |
| `GET /api/ai-assistant/conversations/:id/actions` | Ожидающие AI-предложения |
| `PATCH /api/ai-assistant/actions/:id/review` | Принять/отклонить AI-предложение (human-in-the-loop) |
| `GET /api/ai-assistant/conversations/:id/notes` | Внутренние заметки |
| `POST /api/ai-assistant/conversations/:id/notes` | Добавить заметку |
| `GET /api/ai-assistant/conversations/:id/sla` | SLA-трекеры |

**Переменная:** `ANTHROPIC_API_KEY` (без ключа → MockClaudeClient, детерминированные советы-заглушки).

**Guardrails:**
- AI НИКОГДА не пишет клиенту и не меняет стадию самостоятельно
- НЕ авто-меняем стадию OPLACHENO через AI
- Фильтрация манипулятивных формулировок в suggestions

**SLA-политики** (seed: `prisma/seed-sla-policies.ts`):
- NEW_LEAD → PRICE_SENT: 4 рабочих часа
- PRICE_SENT → OFORMLENO: 24 ч
- OFORMLENO → OPLACHENO: 48 ч (главный SLA)
- IN_PRODUCTION → READY_TO_SHIP: 72 ч
- Cron каждые 15 мин — помечает просроченные трекеры `isBreached=true`

**Модели Prisma:** `LifecycleStage` (enum, поле `VkConversation.lifecycleStage`), `SlaPolicy`, `SlaTracker`, `AiAction`, `InternalNote`.

**Frontend:** `components/ai-assistant/AiAssistantPanel.vue`, `components/ai-assistant/SlaBadge.vue`, страница `/assistant/ai-panel`.
