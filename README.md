# maxmazunin.ru — Личный кабинет

Приватный рабочий кабинет. Вход только по логину/паролю. Регистрации нет — пользователей заводит ADMIN.

## Стек

| Слой | Технологии |
|------|------------|
| Backend | NestJS 11, Prisma 6, PostgreSQL, Swagger/OpenAPI, JWT, @nestjs/schedule |
| API-контракт | `@nestjs/swagger` → `/api/docs-json` → orval → TS-клиент |
| Frontend | Nuxt 3, Vue 3, Pinia, TailwindCSS 4, reka-ui, vee-validate+zod, chart.js + vue-chartjs |

## Роли

| Роль | Доступ |
|------|--------|
| `ADMIN` | Все страницы + управление пользователями (`/users`) + ручной poll VK Ads |
| `USER` | Рабочий стол (`/`) + аналитика VK Ads (`/vk-ads`) |

---

## Модуль VK Ads (`/vk-ads`)

Почасовая аналитика рекламных кабинетов VK. Данные собираются каждые N минут
(снимок накопленных дневных показателей), дельты вычисляются автоматически.

### Алгоритм снимок → дельта

1. Каждые `POLL_INTERVAL_MINUTES` минут бэкенд запрашивает статистику из VK Ads API.
2. Накопленные за день значения сохраняются как `AdSnapshot`.
3. Каждый час (и сразу после каждого poll) вычисляются дельты:  
   `delta = конечный_снимок – базовый_снимок_до_начала_часа`.
4. При полуночном сбросе (VK обнуляет счётчики в 21:00 UTC = 00:00 МСК)  
   детектируется автоматически: `if end.spend < baseline.spend`.

### Метрики

| Метрика | Формула |
|---------|---------|
| CPL | spend / leads |
| CPM | spend / impressions × 1000 |
| CPC | spend / clicks |

Страница `/vk-ads` показывает:
- Таблицу и bar-chart CPL по часам МСК за выбранный день
- Самый дешёвый час подсвечен зелёным `★`
- Профиль часа суток (avg CPL за период) для поиска оптимального времени показа

### Начальная настройка VK Ads

```bash
# 1. Добавить в /home/deploy/maxmazunin/.env на сервере:
VK_API_PLATFORM=new
VK_ACCESS_TOKEN=ваш_токен_из_ads.vk.com
POLL_INTERVAL_MINUTES=5

# 2. Применить новую схему БД:
cd /home/deploy/maxmazunin/backend
npx prisma db push

# 3. Создать записи кабинетов:
npm run seed:cabinets

# 4. Активировать нужный кабинет (через psql или Prisma Studio):
# UPDATE "VkCabinet" SET "isActive" = true WHERE "externalAccountId" = 'easybook';

# 5. Перезапустить backend:
pm2 restart maxmazunin-backend
```

> **Платформы:** `VK_API_PLATFORM=new` → новый кабинет `ads.vk.com/api/v2` (токен Bearer, без account_id).  
> `VK_API_PLATFORM=old` → старый `vk.com API`, требует `VK_ACCOUNT_ID`.

---

## Быстрый старт (dev)

### 1. Переменные окружения

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

В `backend/.env` обязательно заполни:
- `JWT_SECRET` — длинная случайная строка
- `ADMIN_EMAIL` + `ADMIN_PASSWORD` — для первого администратора

### 2. База данных

```bash
docker compose up -d      # PostgreSQL на порту 5432
```

### 3. Бэкенд

```bash
cd backend
npm install
npm run db:migrate        # создать таблицы (первый раз и при новых миграциях)
npm run admin:create      # создать первого ADMIN из .env
npm run start:dev         # http://localhost:3001
```

Swagger UI: http://localhost:3001/api/docs  
OpenAPI JSON: http://localhost:3001/api/docs-json

### 4. Фронтенд

```bash
cd frontend
npm install
npm run api:generate      # генерировать TS-клиент из openapi.json
npm run dev               # http://localhost:3000
```

> **Первая генерация** работает из локального `openapi.json`.  
> После запуска бэкенда переключи в `orval.config.ts`:  
> `target: 'http://localhost:3001/api/docs-json'`

---

## Структура

```
maxmazunin-cabinet/
├── docker-compose.yml            # dev: только PostgreSQL
├── docker-compose.prod.yml       # prod: backend + frontend + nginx + certbot
├── nginx/nginx.conf              # HTTP→HTTPS redirect + proxy
├── backend/
│   ├── Dockerfile
│   ├── prisma/
│   │   ├── schema.prisma         # User { id, email, passwordHash, role, createdAt }
│   │   └── seed.ts               # скрипт создания первого ADMIN
│   └── src/
│       ├── main.ts               # bootstrap, CORS, Swagger, ValidationPipe
│       ├── app.module.ts
│       ├── prisma/               # PrismaService
│       ├── auth/                 # login + /me + JwtStrategy + JwtAuthGuard + RolesGuard
│       │   └── decorators/       # @Roles()
│       ├── users/                # CRUD пользователей (только ADMIN)
│       ├── health/               # GET /api/health → { status: 'ok' }
│       └── common/decorators/    # @CurrentUser()
└── frontend/
    ├── Dockerfile
    ├── openapi.json              # зафиксированный контракт (синхронизируй с бэком!)
    ├── orval.config.ts
    ├── composables/useApi.ts     # axios + orval mutator
    ├── plugins/api.client.ts     # baseURL из runtimeConfig
    ├── stores/auth.ts            # Pinia: token, user, role
    ├── middleware/auth.ts        # редирект на /login без токена
    ├── middleware/admin.ts       # редирект на / если не ADMIN
    ├── pages/login.vue           # форма входа (vee-validate + zod)
    ├── pages/index.vue           # рабочий стол (auth guard)
    ├── pages/users.vue           # управление пользователями (admin guard)
    └── components/ui/            # Button, Card, Input (reka-ui)
```

---

## Перегенерировать API-клиент

```bash
cd frontend
npm run api:generate
```

Запускать после каждого изменения бэкенда (новые эндпоинты, DTO).

---

## Как добавить фичу

1. **Prisma:** добавь модель в `backend/prisma/schema.prisma`  
   ```bash
   cd backend && npm run db:migrate
   ```

2. **NestJS:** создай `src/<feature>/feature.module/service/controller.ts`  
   - `@ApiTags`, `@ApiOperation`, `@ApiResponse` + DTO с `@ApiProperty`  
   - Защита: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles(Role.ADMIN)` где нужно

3. **Перегенерить клиент:**  
   ```bash
   cd frontend && npm run api:generate
   ```

4. **Nuxt:** добавь `pages/<feature>.vue` с `definePageMeta({ middleware: ['auth'] })`,  
   используй сгенерированные функции из `~/app/api/generated/<tag>/`.

---

## Деплой на сервер (maxmazunin.ru)

> ⚠️ **Выполняй вручную** — эти шаги не запускались автоматически.

### Сервер: `72.56.234.73`, пользователь: `deploy`

### 0. Требования к серверу (Ubuntu 22.04+)

```bash
# Вход по SSH-ключу (не паролю)
ssh deploy@72.56.234.73

# Установить Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker deploy

# Firewall
sudo ufw allow 22 && sudo ufw allow 80 && sudo ufw allow 443
sudo ufw enable

# Fail2ban (защита SSH)
sudo apt install fail2ban -y && sudo systemctl enable fail2ban --now

# Отключить парольный вход SSH
sudo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl reload sshd
```

### 1. Настроить DNS

У регистратора домена:  
**A-запись:** `maxmazunin.ru` → `72.56.234.73`  
Подождать распространения (до 24 ч).

### 2. Загрузить проект на сервер

```bash
# С твоей машины:
rsync -avz --exclude=node_modules --exclude=.nuxt --exclude=dist --exclude=.output \
  /Users/maksim/Mazunin_progs/maxmazunin-cabinet/ \
  deploy@72.56.234.73:/opt/maxmazunin-cabinet/
```

Или через git:
```bash
git init && git add . && git commit -m "init"
git remote add origin git@github.com:maksim/maxmazunin-cabinet.git
git push -u origin main

# На сервере:
git clone git@github.com:maksim/maxmazunin-cabinet.git /opt/maxmazunin-cabinet
```

### 3. Настроить переменные окружения на сервере

```bash
cd /opt/maxmazunin-cabinet
cp backend/.env.example .env
nano .env   # заполни DB_PASSWORD, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
```

`.env` для `docker-compose.prod.yml`:
```env
DB_NAME=cabinet
DB_USER=cabinet
DB_PASSWORD=СИЛЬНЫЙ_ПАРОЛЬ
DATABASE_URL=postgresql://cabinet:СИЛЬНЫЙ_ПАРОЛЬ@postgres:5432/cabinet
JWT_SECRET=ДЛИННАЯ_СЛУЧАЙНАЯ_СТРОКА_МИН_32_СИМВОЛА
JWT_EXPIRES_IN=7d
PORT=3001
FRONTEND_URL=https://maxmazunin.ru
ADMIN_EMAIL=admin@maxmazunin.ru
ADMIN_PASSWORD=СИЛЬНЫЙ_ПАРОЛЬ_ADMIN
REDIS_ENABLED=false
NUXT_PUBLIC_API_BASE=https://maxmazunin.ru
```

### 4. Получить SSL-сертификат (Let's Encrypt)

Первый запуск через certbot напрямую (до поднятия nginx в Docker):

```bash
# Установить certbot на хост
sudo apt install certbot -y

# Получить сертификат (HTTP challenge)
sudo certbot certonly --standalone -d maxmazunin.ru

# Сертификаты появятся в /etc/letsencrypt/live/maxmazunin.ru/
```

### 5. Поднять prod-окружение

```bash
cd /opt/maxmazunin-cabinet

# Собрать и запустить
docker compose -f docker-compose.prod.yml up -d --build

# Создать первого ADMIN (после того как backend запустится)
docker compose -f docker-compose.prod.yml exec backend \
  sh -c "ADMIN_EMAIL=$ADMIN_EMAIL ADMIN_PASSWORD=$ADMIN_PASSWORD \
         npx ts-node -r tsconfig-paths/register prisma/seed.ts"
```

### 6. Проверить

```
https://maxmazunin.ru          → страница входа
https://maxmazunin.ru/api/docs → Swagger UI
https://maxmazunin.ru/api/health → { "status": "ok" }
```

### Обновление (следующие деплои)

```bash
cd /opt/maxmazunin-cabinet
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

### Автопродление сертификата

Certbot-контейнер в `docker-compose.prod.yml` продлевает каждые 12 ч автоматически.  
Убедись, что nginx монтирует `/etc/letsencrypt` с хоста (уже настроено в `docker-compose.prod.yml`).

---

## Безопасность — чеклист

- [x] Вход только по SSH-ключу (`PasswordAuthentication no`)
- [x] UFW: открыты только 22, 80, 443
- [x] Fail2ban активен
- [x] `JWT_SECRET` — минимум 32 случайных символа
- [x] Реальные секреты только в `.env` на сервере, не в git
- [x] `ADMIN_PASSWORD` — сильный пароль
- [x] Публичной регистрации нет; пользователей создаёт только ADMIN

---

## Redis (опционально)

Раскомментировать `redis:` в `docker-compose.prod.yml` и задать:
```env
REDIS_ENABLED=true
REDIS_URL=redis://:ПАРОЛЬ@redis:6379
```
