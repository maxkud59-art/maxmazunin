# Соглашения и паттерны

## Паттерн добавления фичи

1. **Prisma** — добавь модель в `backend/prisma/schema.prisma`
   ```bash
   cd backend && npm run db:migrate
   ```

2. **NestJS** — создай `src/<feature>/`:
   - `feature.module.ts` — импортирует PrismaModule, регистрирует controller + service
   - `feature.service.ts` — бизнес-логика через PrismaService
   - `feature.controller.ts` — HTTP-роуты с декораторами swagger:
     - `@ApiTags('feature')`
     - `@ApiOperation({ summary: '...' })`
     - `@ApiResponse({ status: 200, type: FeatureDto })`
     - `@ApiBearerAuth()` + `@UseGuards(JwtAuthGuard)`
     - Для ADMIN: `@UseGuards(RolesGuard)` + `@Roles(Role.ADMIN)`
   - `dto/feature.dto.ts` — классы с `@ApiProperty()`

3. **Регистрация в app.module.ts** — добавь `FeatureModule` в imports

4. **Перегенерить клиент**
   ```bash
   cd frontend && npm run api:generate
   ```
   Зафиксировать `openapi.json` (скопируй из http://localhost:3001/api/docs-json)

5. **Nuxt** — добавь `pages/<feature>.vue`:
   ```ts
   definePageMeta({ middleware: ['auth'] })  // или ['auth', 'admin']
   ```
   Используй сгенерированные функции: `import { getFeature } from '~/app/api/generated/feature/feature'`

## Именование

| Что | Конвенция | Пример |
|-----|----------|--------|
| NestJS модули | PascalCase | `MessengerModule` |
| Файлы Nest | kebab-case | `messenger.service.ts` |
| DTO классы | PascalCase + Dto | `SendMessageDto` |
| Nuxt pages | kebab-case | `vk-ads.vue` |
| Stores Pinia | camelCase + use-prefix | `useMessengerStore` |
| Composables | camelCase + use-prefix | `useApi` |
| API-тэг Swagger | kebab-case | `@ApiTags('vk-ads')` |
| Nuxt middleware | kebab-case файл | `middleware/auth.ts` |
| Env-переменные | SCREAMING_SNAKE_CASE | `JWT_SECRET` |

## Структура NestJS-модуля

```
src/<feature>/
├── dto/
│   └── <thing>.dto.ts        # ApiProperty-декорированные классы
├── <feature>.controller.ts   # маршруты, swagger-декораторы, минимум логики
├── <feature>.service.ts      # бизнес-логика, работа с Prisma
└── <feature>.module.ts       # регистрация
```

## Защита маршрутов (backend)

```ts
// Все аутентифицированные
@UseGuards(JwtAuthGuard)

// Только ADMIN
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)

// Получить текущего пользователя
@CurrentUser() user: { sub: string; email: string; role: string }
```

## Защита страниц (frontend)

```ts
// auth-guard
definePageMeta({ middleware: ['auth'] })

// admin-guard (перенаправляет на / если не ADMIN)
definePageMeta({ middleware: ['auth', 'admin'] })
```

## Работа с API на frontend

```ts
// Получить функции по тэгу
const { featureControllerGetList } = getFeature()

// Вызвать — возвращает Promise (axios)
const items = await featureControllerGetList({ param: value })
```

## WebSocket (мессенджер)

Клиент подключается через `plugins/socket.client.ts`, токен передаётся в `handshake.auth.token`.
Gateway (`/messenger` namespace) автоматически подключает сокет к комнатам `chat:<id>` для всех чатов пользователя.

События (emit → subscribe):
- `chat:join` — вступить в комнату чата
- `typing:start` / `typing:stop` — статус набора
- `read:mark` — отметить прочитанным

События от сервера:
- `message:new`, `message:edit`, `message:delete`
- `user:online`, `user:offline`
- `typing:start`, `typing:stop`, `read:update`
