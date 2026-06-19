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
| `read:mark` | `user:online`, `user:offline` |
| | `typing:start`, `typing:stop` |
| | `read:update` |

### Profile gate (frontend)

При первом входе в мессенджер, если `profile.isComplete === false`, показывается модалка с заполнением профиля (firstName, lastName, nickname обязательны). Без заполненного профиля функции мессенджера недоступны.

### Типы сообщений (`MessageType`)

`TEXT`, `FILE`, `IMAGE`, `VIDEO`, `SYSTEM`

Soft-delete: `deletedAt` устанавливается, `body` очищается; запись в БД остаётся.

---

## Prisma-схема (сводка)

```
User → Message (1:N)
User → ChatMember (1:N)
User → GendirAccessGrant (1:1, GrantedTo)
Chat → ChatMember (1:N)
Chat → Message (1:N)
Message → Attachment (1:N)
Message → Mention (1:N)
Message → MessageRead (1:N)
VkCabinet → AdSnapshot (1:N)
VkCabinet → HourlyStat (1:N)
```
