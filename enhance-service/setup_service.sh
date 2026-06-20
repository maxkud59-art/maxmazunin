#!/bin/bash
# Устанавливает enhance-service на сервере: venv + deps + модели + PM2
# Запуск НА СЕРВЕРЕ: bash /home/deploy/maxmazunin/enhance-service/setup_service.sh
set -euo pipefail

SERVICE_DIR="/home/deploy/maxmazunin/enhance-service"
VENV_DIR="/home/deploy/enhance-venv"
MODEL_DIR="/home/deploy/enhance-models"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

echo "$LOG_PREFIX === Установка enhance-service ==="

# ── 1. Python venv ────────────────────────────────────────────────────────────
echo "$LOG_PREFIX [1/4] Создаю Python venv: $VENV_DIR"
python3 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"

# Upgrade pip
pip install --upgrade pip setuptools wheel --quiet

# ── 2. PyTorch CPU + deps ─────────────────────────────────────────────────────
echo "$LOG_PREFIX [2/4] Устанавливаю Python deps (CPU torch, может занять 3-5 минут)..."
# Install torch CPU-only first (smaller, specific index)
pip install torch==2.5.1+cpu torchvision==0.20.1+cpu \
  --index-url https://download.pytorch.org/whl/cpu --quiet

# Other deps
pip install \
  fastapi==0.115.6 \
  "uvicorn[standard]==0.32.1" \
  python-multipart==0.0.12 \
  Pillow==11.0.0 \
  "numpy<2.0" \
  opencv-python-headless==4.10.0.84 \
  basicsr==1.4.2 \
  facexlib==0.3.0 \
  realesrgan==0.3.0 \
  gfpgan==1.3.8 \
  --quiet

echo "$LOG_PREFIX [2/4] Deps установлены."

# ── 3. Модели ─────────────────────────────────────────────────────────────────
echo "$LOG_PREFIX [3/4] Скачиваю AI-модели..."
bash "$SERVICE_DIR/download_models.sh"

# ── 4. PM2 ────────────────────────────────────────────────────────────────────
echo "$LOG_PREFIX [4/4] Регистрирую в PM2..."
pm2 delete enhance-service 2>/dev/null || true
pm2 start "$VENV_DIR/bin/uvicorn" \
  --name enhance-service \
  --interpreter none \
  -- main:app --host 127.0.0.1 --port 8001 --workers 1 \
  --cwd "$SERVICE_DIR"
pm2 save

echo "$LOG_PREFIX === enhance-service запущен ==="
pm2 list | grep enhance
echo ""
echo "Health check:"
sleep 2
curl -sf http://127.0.0.1:8001/health && echo " OK" || echo " FAILED (дай ещё 5 сек)"
