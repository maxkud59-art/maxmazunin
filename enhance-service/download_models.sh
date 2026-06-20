#!/bin/bash
# Скачивает модели для enhance-service в /home/deploy/enhance-models/
# Запуск: bash enhance-service/download_models.sh
# Вес модели хранится на сервере в именованной директории, не в git.
set -euo pipefail

MODEL_DIR="/home/deploy/enhance-models"
mkdir -p "$MODEL_DIR"
cd "$MODEL_DIR"

echo "=== Скачиваю модели AI улучшения фото ==="
echo "Директория: $MODEL_DIR"
echo ""

# ── Real-ESRGAN x2plus ────────────────────────────────────────────────────────
if [ ! -f "RealESRGAN_x2plus.pth" ]; then
  echo "[1/2] Скачиваю RealESRGAN_x2plus.pth (~67MB)..."
  wget -q --show-progress -O RealESRGAN_x2plus.pth \
    "https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.1/RealESRGAN_x2plus.pth"
  echo "  ✓ RealESRGAN_x2plus.pth"
else
  echo "[1/2] RealESRGAN_x2plus.pth уже есть ($(du -sh RealESRGAN_x2plus.pth | cut -f1))"
fi

# ── GFPGAN v1.4 ───────────────────────────────────────────────────────────────
if [ ! -f "GFPGANv1.4.pth" ]; then
  echo "[2/2] Скачиваю GFPGANv1.4.pth (~332MB)..."
  wget -q --show-progress -O GFPGANv1.4.pth \
    "https://github.com/TencentARC/GFPGAN/releases/download/v1.3.4/GFPGANv1.4.pth"
  echo "  ✓ GFPGANv1.4.pth"
else
  echo "[2/2] GFPGANv1.4.pth уже есть ($(du -sh GFPGANv1.4.pth | cut -f1))"
fi

echo ""
echo "=== Модели готовы ==="
ls -lh "$MODEL_DIR"
