# Деплой

## Реквизиты

| Параметр | Значение |
|----------|---------|
| Сервер | `72.56.234.73` |
| Пользователь | `deploy` |
| Доступ | SSH-ключ (пароль отключён) |
| Путь на сервере | `/opt/maxmazunin-cabinet/` |
| Домен | `maxmazunin.ru` |
| TLS | Let's Encrypt (certbot) |

## Стек в prod

`docker-compose.prod.yml` запускает 5 сервисов:

| Сервис | Образ/Dockerfile | Порт | Зависит от |
|--------|-----------------|------|-----------|
| `postgres` | postgres:16-alpine | внутренний | — |
| `backend` | ./backend/Dockerfile | 3001 (внутренний) | postgres healthy |
| `frontend` | ./frontend/Dockerfile | 3000 (внутренний) | backend healthy |
| `nginx` | nginx:1.25-alpine | 80, 443 | backend, frontend |
| `certbot` | certbot/certbot | — | — |

## nginx

```
HTTP:80  → 301 HTTPS (кроме /.well-known/acme-challenge/)
HTTPS www → 301 apex
HTTPS maxmazunin.ru:
  /api/  → http://backend:3001  (прокси)
  /      → http://frontend:3000 (SSR, WebSocket upgrade)
```

`client_max_body_size 20M` — для загрузки файлов.

## Let's Encrypt

Первый сертификат: `certbot certonly --standalone` на хосте (до поднятия nginx).  
Или через `scripts/deploy.sh` — там есть автоматический webroot-flow (временно ставит `nginx-init.conf`).

Продление: certbot-контейнер в docker-compose.prod.yml делает `certbot renew --webroot` каждые 12 ч.

Монтирует `/etc/letsencrypt` с хоста → nginx читает сертификаты через volume.

## ⚠️ РЕАЛЬНЫЙ деплой (PM2, не docker-compose)

**ВНИМАНИЕ:** CLAUDE.md упоминает docker-compose, но приложение реально запускается через **PM2** на нативном Postgres. docker-compose.prod.yml устарел и не используется.

### Путь на сервере: `/home/deploy/maxmazunin/` (не `/opt/...`)

### Полный цикл с локальной машины:

```bash
# 1. Rsync изменённых файлов
rsync -avz --exclude node_modules --exclude dist --exclude .nuxt --exclude .output \
  -e "ssh -i ~/.ssh/id_ed25519" \
  /Users/maksim/Mazunin_progs/maxmazunin-cabinet/backend/src/ \
  deploy@72.56.234.73:/home/deploy/maxmazunin/backend/src/

rsync -avz --exclude node_modules --exclude .nuxt --exclude .output \
  -e "ssh -i ~/.ssh/id_ed25519" \
  /Users/maksim/Mazunin_progs/maxmazunin-cabinet/frontend/ \
  deploy@72.56.234.73:/home/deploy/maxmazunin/frontend/

# 2. Запустить безопасный PM2-редеплой на сервере
ssh -i ~/.ssh/id_ed25519 deploy@72.56.234.73 \
  "bash /home/deploy/maxmazunin/scripts/pm2-redeploy.sh"
```

### pm2-redeploy.sh делает:
1. `scripts/backup-db.sh` → pg_dump → `/home/deploy/backups/cabinet_DATE.sql.gz`
2. `npx prisma db push --accept-data-loss` (НИКОГДА не --force-reset)
3. `npm run build` + `pm2 restart cabinet-backend`
4. `npm run build` + `pm2 restart cabinet-frontend`
5. Health check

### ЗАПРЕЩЕНО при любом деплое:
- `prisma migrate reset` / `prisma migrate dev` / `--force-reset`
- `DROP TABLE` / `DROP SCHEMA` / пересоздание БД
- Удаление volume Postgres (данные в `/var/lib/postgresql/16/main/`)
- Удаление `uploads/` без явного указания владельца

### Восстановление из бэкапа:
```bash
# Список дампов:
ls -lh /home/deploy/backups/

# Восстановить:
PGPASSWORD=$DB_PASSWORD gunzip -c /home/deploy/backups/cabinet_DATE.sql.gz \
  | psql -U cabinet -h localhost cabinet

# Пересоздать только если БД пуста:
# createdb -U cabinet cabinet  # только если БД не существует
```

### Создание/восстановление админа (без удаления других пользователей):
```bash
ssh deploy@72.56.234.73 "
  set -a && source /home/deploy/maxmazunin/.env && set +a
  cd /home/deploy/maxmazunin/backend
  ADMIN_EMAIL=maxkud59@gmail.com ADMIN_PASSWORD=Maxkud59 npm run admin:create
"
```

## Шаги редеплоя docker-compose (УСТАРЕЛО — не использовать)

~~docker compose -f docker-compose.prod.yml up -d --build~~

## Первый деплой

Запустить `scripts/deploy.sh` на сервере — он автоматически:
1. Стартует postgres
2. Получает TLS-сертификат (если его нет)
3. Собирает и поднимает все сервисы
4. Дожидается бэкенда и запускает `prisma migrate deploy`
5. Создаёт первого ADMIN (`npm run admin:create`)
6. HTTPS health-check

Требует переменную `LETSENCRYPT_EMAIL` в `.env`.

## .env на сервере

Файл `/opt/maxmazunin-cabinet/.env` (секреты только там, не в git):

```env
DB_NAME=cabinet
DB_USER=cabinet
DB_PASSWORD=<сильный пароль>
DATABASE_URL=postgresql://cabinet:<DB_PASSWORD>@postgres:5432/cabinet
JWT_SECRET=<минимум 32 символа>
JWT_EXPIRES_IN=7d
PORT=3001
FRONTEND_URL=https://maxmazunin.ru
ADMIN_EMAIL=admin@maxmazunin.ru
ADMIN_PASSWORD=<сильный пароль>
NUXT_PUBLIC_API_BASE=https://maxmazunin.ru
LETSENCRYPT_EMAIL=<email для certbot>
MESSENGER_TEST_MODE=false
VK_API_PLATFORM=new
VK_ACCESS_TOKEN=<токен из ads.vk.com>
POLL_INTERVAL_MINUTES=5
```

## Известные грабли

### Кэш ассетов Nuxt

После деплоя браузер может показывать старые JS/CSS — если nginx кэширует `/_nuxt/*` без правильных заголовков.

Решение: добавить в nginx-блок для frontend:
```nginx
location /_nuxt/ {
    proxy_pass http://frontend:3000;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
location / {
    proxy_pass http://frontend:3000;
    add_header Cache-Control "no-cache, no-store, must-revalidate";
}
```
Текущий `nginx.conf` этого не делает — если проблема появится, применить этот фикс.

### Certbot и nginx рестарт

После продления сертификата nginx нужно перезагрузить. Certbot-контейнер сам не перезагружает nginx.  
Cron на хосте или `docker compose exec nginx nginx -s reload` по расписанию — TBD.

### uploads/ в prod

Директория `uploads/` создаётся в main.ts, но не примонтирована как Docker volume в `docker-compose.prod.yml`. При пересборке контейнера файлы **потеряются**. Нужно добавить volume (TBD).

### Первый сертификат

Перед запуском nginx с HTTPS-конфигом сертификат уже должен быть. `scripts/deploy.sh` решает это через временный `nginx-init.conf`. При ручном деплое — сначала `certbot --standalone`, потом compose up.
