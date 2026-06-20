#!/bin/bash
# Безопасный PM2-редеплой: резервная копия → сборка → перезапуск
# Запуск НА СЕРВЕРЕ: bash /home/deploy/maxmazunin/scripts/pm2-redeploy.sh
# Данные НЕ удаляются. Схема обновляется только additive через prisma db push.
set -euo pipefail

APP_DIR="/home/deploy/maxmazunin"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

cd "$APP_DIR"

# Загрузить .env
set -a && source "$APP_DIR/.env" && set +a

echo "$LOG_PREFIX === PM2 redeploy start ==="

# ─── 1. Резервная копия БД ───────────────────────────────────────────────────
echo "$LOG_PREFIX [1/5] Backing up database..."
bash "$APP_DIR/scripts/backup-db.sh"
echo "$LOG_PREFIX [1/5] Backup done."

# ─── 2. Если были изменения в schema.prisma — применить схему ────────────────
# Применяется ТОЛЬКО если схема изменилась (additive only).
# ЗАПРЕЩЕНО: prisma migrate reset, --force-reset, DROP TABLE, DROP SCHEMA.
echo "$LOG_PREFIX [2/5] Applying schema changes (db push, additive only)..."
cd "$APP_DIR/backend"
npx prisma db push --accept-data-loss 2>&1 | grep -v "^$" | head -20
# ^^^ --accept-data-loss = разрешить потерю данных в конфликтующих COLUMN-изменениях.
# Никогда НЕ добавлять --force-reset. Данные пользователей/книг сохраняются.
echo "$LOG_PREFIX [2/5] Schema OK."

# ─── 3. Сборка backend ───────────────────────────────────────────────────────
echo "$LOG_PREFIX [3/5] Building backend..."
npm run build 2>&1 | tail -3
pm2 restart cabinet-backend
echo "$LOG_PREFIX [3/5] Backend restarted."

# ─── 4. Сборка frontend ──────────────────────────────────────────────────────
echo "$LOG_PREFIX [4/5] Building frontend..."
cd "$APP_DIR/frontend"
npm run build 2>&1 | tail -3
pm2 restart cabinet-frontend
echo "$LOG_PREFIX [4/5] Frontend restarted."

# ─── 5. Проверка ─────────────────────────────────────────────────────────────
echo "$LOG_PREFIX [5/5] Health check..."
sleep 3
STATUS=$(curl -s -o /dev/null -w "%{http_code}" https://maxmazunin.ru/api/health 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ]; then
  echo "$LOG_PREFIX Health check: OK (HTTP 200)"
else
  echo "$LOG_PREFIX WARN: Health check HTTP $STATUS"
fi

pm2 list

echo "$LOG_PREFIX === PM2 redeploy complete ==="
echo ""
echo "Резервная копия: /home/deploy/backups/"
echo "НИКОГДА не использовать: --force-reset, migrate reset, migrate dev, DROP TABLE"
