# Переменные окружения

Секреты только в `.env` на сервере. В репозитории — только `.env.example` и `.env.prod.example`.

## Backend (`backend/.env`)

| Переменная | Обязательная | Описание |
|-----------|:---:|---------|
| `DATABASE_URL` | да | PostgreSQL DSN: `postgresql://user:pass@host:5432/db` |
| `CRM_DATABASE_URL` | нет | DSN для CRM-БД (read-only, модуль crm). Локально: `postgresql://maksim@localhost:5432/crm_explorer` |
| `JWT_SECRET` | да | Секрет подписи JWT, минимум 32 символа |
| `JWT_EXPIRES_IN` | нет | TTL токена (default: `7d`) |
| `PORT` | нет | Порт бэкенда (default: `3001`) |
| `FRONTEND_URL` | нет | Для CORS (default: `http://localhost:3000`) |
| `ADMIN_EMAIL` | да | Email первого ADMIN (для `npm run admin:create`) |
| `ADMIN_PASSWORD` | да | Пароль первого ADMIN |
| `MESSENGER_TEST_MODE` | нет | `true` → все ограничения мессенджера выключены (default: `true` в .env.example) |
| `GENDIR_EMAIL` | нет | Email кому дать роль GEN_DIRECTOR при seed |
| `VK_API_PLATFORM` | нет | `new` (ads.vk.com) или `old` (vk.com API) (default: `new`) |
| `VK_ADS_TOKEN` | нет | Токен рекламного кабинета VK с правом **ads** (ads.vk.com → API). НЕ путать с VK_GROUP_TOKEN — это разные токены! |
| `VK_ACCESS_TOKEN` | нет | Устаревшее: используйте `VK_ADS_TOKEN`. Читается как fallback если `VK_ADS_TOKEN` не задан. |
| `VK_ACCOUNT_ID` | нет | ID аккаунта VK (только для `VK_API_PLATFORM=old`; при `new` аккаунты загружаются через /sync-accounts) |
| `POLL_INTERVAL_MINUTES` | нет | Интервал сбора снимков VK в минутах (default: `5`) |
| `REDIS_ENABLED` | нет | `true` чтобы включить Redis (default: `false`) |
| `REDIS_URL` | нет | Redis DSN (нужен только при `REDIS_ENABLED=true`) |
| `VK_GROUP_TOKEN` | нет | Community access token с правом messages (ИИ-ассистент) |
| `VK_GROUP_ID` | нет | Числовой ID сообщества VK (ИИ-ассистент) |
| `BANK_API_TOKEN` | нет | API-токен банка для импорта выписок (Finance модуль). Только на сервере, не в коде/гите. |
| `CDEK_CLIENT_ID` | нет | Client ID СДЭК API (Finance модуль). Только на сервере. |
| `CDEK_CLIENT_SECRET` | нет | Client Secret СДЭК API (Finance модуль). Только на сервере. |

## Prod docker-compose (`docker-compose.prod.yml`)

Эти переменные читаются из `.env` в корне проекта (не `backend/.env`):

| Переменная | Описание |
|-----------|---------|
| `DB_NAME` | Имя БД (default: `cabinet`) |
| `DB_USER` | Пользователь PostgreSQL (default: `cabinet`) |
| `DB_PASSWORD` | Пароль PostgreSQL — обязателен |
| `NUXT_PUBLIC_API_BASE` | Base URL API для frontend (default: `https://maxmazunin.ru`) |
| `LETSENCRYPT_EMAIL` | Email для certbot (нужен при первом деплое через `scripts/deploy.sh`) |

## Frontend (`frontend/.env`)

| Переменная | Описание |
|-----------|---------|
| `NUXT_PUBLIC_API_BASE` | URL бэкенда (dev: `http://localhost:3001`, prod: из docker env) |

## Где живут значения

| Окружение | Файл |
|----------|------|
| Dev (локально) | `backend/.env` + `frontend/.env` |
| Prod | `/opt/maxmazunin-cabinet/.env` на сервере |
| Docker prod | переменные из `/opt/maxmazunin-cabinet/.env` пробрасываются в контейнеры через `env_file: .env` |

## ANTHROPIC_API_KEY

| Переменная | Значение | Описание |
|-----------|---------|---------|
| `ANTHROPIC_API_KEY` | — | Ключ Anthropic Claude API. Без ключа → MockClaudeClient (советы-заглушки, без сетевых вызовов). Получить: console.anthropic.com → API Keys. |
