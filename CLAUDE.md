# maxmazunin.ru — личный кабинет

Приватный рабочий кабинет Максима Мазунина. Вход по логину/паролю, регистрации нет.
Домен: **maxmazunin.ru** · Сервер: **72.56.234.73** (deploy) · Ветка: **main**

## Стек (кратко)

| Слой | Технологии |
|------|-----------|
| Backend | NestJS 11, Prisma 6/PostgreSQL, JWT, @nestjs/swagger v8, Socket.IO |
| API-контракт | Nest swagger → `/api/docs-json` → orval → `frontend/app/api/generated/` |
| Frontend | Nuxt 3 SSR, Pinia, TailwindCSS 4, reka-ui, vue-chartjs, socket.io-client |
| Prod | docker-compose.prod.yml: postgres + backend + frontend + nginx + certbot |

## Роли

| Роль | Доступ |
|------|--------|
| `ADMIN` | Все страницы + `/users` CRUD + ручной poll VK Ads |
| `USER` | `/`, `/vk-ads`, `/messenger` |

## Протокол работы (обязательно)

**Перед задачей:** прочитай этот файл и нужные файлы из `docs/knowledge/`.

**После задачи:** если появилось новое решение, соглашение, модуль, переменная или граблю — обнови соответствующий файл в `docs/knowledge/` (кратко, без дублей; в `decisions.md` и `gotchas.md` — с датой 2026-MM-DD). Коммить базу знаний вместе с кодом.

**Секреты в базу знаний не писать.**

---

## База знаний (`docs/knowledge/`)

- [architecture.md](docs/knowledge/architecture.md) — стек, структура папок, цепочка API-контракта
- [conventions.md](docs/knowledge/conventions.md) — паттерн добавления фичи, именование, структура модулей
- [deploy.md](docs/knowledge/deploy.md) — шаги деплоя, nginx, Let's Encrypt, известные грабли
- [modules.md](docs/knowledge/modules.md) — описание всех модулей (auth, users, vk-ads, messenger)
- [decisions.md](docs/knowledge/decisions.md) — журнал архитектурных решений
- [gotchas.md](docs/knowledge/gotchas.md) — известные проблемы и их фиксы
- [env.md](docs/knowledge/env.md) — переменные окружения и их назначение
- [glossary.md](docs/knowledge/glossary.md) — доменные термины
- [ai-assistant.md](docs/knowledge/ai-assistant.md) — AI-ассистент: guardrails, SLA, LifecycleStage, стадии сделки
- [ai-finance.md](docs/knowledge/ai-finance.md) — AI-финансист: классификация операций, human-in-the-loop, прогноз, аномалии
