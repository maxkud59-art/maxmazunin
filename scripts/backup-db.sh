#!/bin/bash
# Резервная копия БД cabinet (PostgreSQL, нативный postgres на сервере)
# Запуск: bash scripts/backup-db.sh
# Переменные берёт из /home/deploy/maxmazunin/.env (или из окружения).
set -euo pipefail

ENV_FILE="/home/deploy/maxmazunin/.env"
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a && source "$ENV_FILE" && set +a
fi

: "${DB_NAME:?DB_NAME not set}"
: "${DB_USER:?DB_USER not set}"
: "${DB_PASSWORD:?DB_PASSWORD not set}"

BACKUP_DIR="/home/deploy/backups"
mkdir -p "$BACKUP_DIR"

DATE=$(date +%Y%m%d_%H%M%S)
FILE="$BACKUP_DIR/cabinet_${DATE}.sql.gz"

echo "[$(date)] Starting pg_dump → $FILE"
PGPASSWORD="$DB_PASSWORD" pg_dump \
  -U "$DB_USER" \
  -h localhost \
  "$DB_NAME" \
  | gzip -9 > "$FILE"

SIZE=$(du -sh "$FILE" | cut -f1)
echo "[$(date)] Backup complete: $FILE ($SIZE)"

# Удалить дампы старше 30 дней
find "$BACKUP_DIR" -name "cabinet_*.sql.gz" -mtime +30 -delete 2>/dev/null || true

echo "[$(date)] Done. Files in $BACKUP_DIR:"
ls -lh "$BACKUP_DIR"/cabinet_*.sql.gz 2>/dev/null | tail -10 || echo "  (none)"
