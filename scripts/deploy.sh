#!/bin/bash
# Production deployment script for maxmazunin.ru
# Run on server after rsync: cd ~/maxmazunin && bash scripts/deploy.sh
set -euo pipefail

DOMAIN="maxmazunin.ru"
COMPOSE="docker compose -f docker-compose.prod.yml"
CERT_PATH="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"

# ─── Pre-flight ───────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  echo "ERROR: .env not found."
  echo "  cp .env.prod.example .env && nano .env  # fill in secrets"
  exit 1
fi

# shellcheck disable=SC1091
source .env

: "${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL must be set in .env}"
: "${DB_PASSWORD:?DB_PASSWORD must be set in .env}"
: "${JWT_SECRET:?JWT_SECRET must be set in .env}"
: "${ADMIN_EMAIL:?ADMIN_EMAIL must be set in .env}"
: "${ADMIN_PASSWORD:?ADMIN_PASSWORD must be set in .env}"

# ─── Шаг 1: PostgreSQL ────────────────────────────────────────────────────────
echo "==> [1/6] Starting postgres..."
$COMPOSE up -d postgres

# ─── Шаг 2: Получение первого сертификата (если ещё нет) ─────────────────────
if [ ! -f "$CERT_PATH" ]; then
  echo "==> [2/6] Getting initial TLS certificate (webroot challenge)..."

  # Временно ставим HTTP-only конфиг (nginx стартует без SSL)
  cp nginx/nginx.conf nginx/nginx.conf.bak
  cp nginx/nginx-init.conf nginx/nginx.conf

  # Поднимаем nginx + certbot (создаёт общий volume certbot_www)
  $COMPOSE up -d nginx certbot
  sleep 3

  # Запрашиваем сертификат через webroot
  $COMPOSE run --rm --entrypoint certbot certbot \
    certonly --webroot -w /var/www/certbot \
    -d "$DOMAIN" -d "www.$DOMAIN" \
    --email "$LETSENCRYPT_EMAIL" \
    --agree-tos --no-eff-email

  # Возвращаем полный конфиг с HTTPS
  cp nginx/nginx.conf.bak nginx/nginx.conf
  $COMPOSE exec nginx nginx -s reload
  echo "==> Certificate obtained and nginx reloaded with HTTPS config."
else
  echo "==> [2/6] Certificate already exists, skipping initial issuance."
fi

# ─── Шаг 3: Сборка и запуск всех сервисов ────────────────────────────────────
echo "==> [3/6] Building and starting all services..."
$COMPOSE up -d --build

# ─── Шаг 4: Миграции ─────────────────────────────────────────────────────────
echo "==> [4/6] Waiting for backend health..."
for i in $(seq 1 40); do
  if $COMPOSE exec -T backend wget -qO- http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "    backend is up."
    break
  fi
  printf "    waiting... (%d/40)\r" "$i"
  sleep 5
done

echo "==> Running database migrations..."
$COMPOSE exec -T backend npx prisma migrate deploy

# ─── Шаг 5: Первый администратор ─────────────────────────────────────────────
echo "==> [5/6] Creating first admin (skips if already exists)..."
$COMPOSE exec -T backend npm run admin:create

# ─── Шаг 6: Проверка ─────────────────────────────────────────────────────────
echo "==> [6/6] Health check..."
if curl -sf "https://$DOMAIN/api/health" | grep -q '"status"'; then
  echo "    HTTPS health check: OK"
else
  echo "    WARN: HTTPS health check failed — DNS may not be propagated yet."
  echo "    Try: curl https://$DOMAIN/api/health"
fi

echo ""
echo "╔════════════════════════════════════╗"
echo "║   Deploy complete: https://$DOMAIN  ║"
echo "╚════════════════════════════════════╝"
