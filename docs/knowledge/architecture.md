# Архитектура

## Стек

| Слой | Технология | Версия |
|------|-----------|--------|
| Backend | NestJS | 11 |
| ORM | Prisma | 6 |
| БД | PostgreSQL | 16 (docker) |
| Auth | JWT + passport-jwt | — |
| API-docs | @nestjs/swagger | 8 |
| WebSocket | Socket.IO (@nestjs/platform-socket.io) | 4 |
| Scheduler | @nestjs/schedule | 4 |
| File upload | multer | 1.4.x |
| Frontend | Nuxt 3 (SSR) | 3.14 |
| State | Pinia | 3 |
| CSS | TailwindCSS | 4 (via @tailwindcss/vite) |
| UI-компоненты | reka-ui | 2 |
| Валидация форм | vee-validate + zod | 4 + 3 |
| Графики | Chart.js + vue-chartjs | 4 + 5 |
| HTTP-клиент (frontend) | axios | 1.7 |
| API-генератор | orval | 7 |

## Структура папок

```
maxmazunin-cabinet/
├── CLAUDE.md                        ← точка входа для Claude
├── docs/knowledge/                  ← база знаний
├── README.md                        ← быстрый старт
├── docker-compose.yml               ← dev: только postgres:5432
├── docker-compose.prod.yml          ← prod: postgres + backend + frontend + nginx + certbot
├── nginx/
│   ├── nginx.conf                   ← основной: HTTP→HTTPS, /api/ → backend, / → frontend
│   └── nginx-init.conf              ← временный HTTP-only конфиг (для первого certbot)
├── scripts/deploy.sh                ← полный скрипт деплоя (запускать на сервере)
├── .env.prod.example                ← шаблон .env для prod
│
├── backend/
│   ├── Dockerfile
│   ├── prisma/
│   │   ├── schema.prisma            ← единственная модель данных
│   │   ├── seed.ts                  ← создание первого ADMIN
│   │   └── seed-cabinets.ts         ← создание VkCabinet-записей
│   └── src/
│       ├── main.ts                  ← bootstrap: порт 3001, CORS, Swagger, ValidationPipe
│       ├── app.module.ts            ← корневой модуль (ConfigModule, ScheduleModule, ...)
│       ├── prisma/                  ← PrismaService
│       ├── auth/                    ← login, /me, JWT, RolesGuard
│       ├── users/                   ← CRUD пользователей (только ADMIN)
│       ├── health/                  ← GET /api/health → { status: 'ok' }
│       ├── vk-ads/                  ← сбор снимков, rollup, эндпоинты статистики
│       └── messenger/               ← чаты, сообщения, файлы, Socket.IO gateway
│
└── frontend/
    ├── Dockerfile
    ├── openapi.json                 ← зафиксированный контракт (синхронизируй с бэком!)
    ├── orval.config.ts
    ├── app/api/generated/           ← TS-клиент (генерируется orval, не редактировать вручную)
    ├── composables/useApi.ts        ← axios instance + orval mutator
    ├── plugins/
    │   ├── api.client.ts            ← устанавливает baseURL из runtimeConfig
    │   ├── socket.client.ts         ← Socket.IO клиент для мессенджера
    │   └── chart.client.ts          ← регистрация компонентов Chart.js
    ├── stores/
    │   ├── auth.ts                  ← Pinia: token (localStorage), user, role
    │   └── messenger.ts             ← Pinia: chats, messages, online, typing
    ├── middleware/
    │   ├── auth.ts                  ← редирект на /login без токена
    │   └── admin.ts                 ← редирект на / если не ADMIN
    └── pages/
        ├── login.vue                ← публичная
        ├── index.vue                ← рабочий стол (auth)
        ├── users.vue                ← управление пользователями (admin)
        ├── vk-ads.vue               ← аналитика VK Ads (auth)
        └── messenger.vue            ← мессенджер (auth)
```

## Цепочка API-контракта

```
backend/src/**/*.controller.ts
  → @nestjs/swagger decorators (@ApiTags, @ApiResponse, @ApiProperty ...)
  → GET http://localhost:3001/api/docs-json  (OpenAPI JSON)
  → frontend/openapi.json  (зафиксированный snapshot)
  → orval (npm run api:generate)
  → frontend/app/api/generated/<tag>/<tag>.ts  (axios-функции)
  → страницы и компоненты Nuxt
```

После изменения бэкенда: `npm run api:generate` в `frontend/`.

## Порты (dev)

| Сервис | Порт |
|--------|------|
| Backend (NestJS) | 3001 |
| Frontend (Nuxt SSR) | 3000 |
| PostgreSQL | 5432 |
| Swagger UI | http://localhost:3001/api/docs |
| OpenAPI JSON | http://localhost:3001/api/docs-json |
| WebSocket (мессенджер) | ws://localhost:3001/messenger |

## Хранение файлов

Multer сохраняет загрузки в папку `uploads/` в корне проекта на бэкенде (создаётся в `main.ts` при старте). В prod эта папка монтируется через Docker volume (TBD: проверить docker-compose.prod.yml — volume для uploads не прописан явно, данные остаются внутри контейнера).
