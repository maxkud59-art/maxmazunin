"""
AI Photo Enhancement Service
- Real-ESRGAN x2 upscaling (tile mode, CPU-friendly)
- GFPGAN v1.4 face restoration (applied AFTER x2 for sharper small faces)
- Target-aware upscaling: upscales to exact print DPI, not fixed ×2
- Single-worker queue (no parallel jobs to protect RAM)
- FastAPI on port 8001
"""
# ── Compatibility shim for torchvision >= 0.17 (removed functional_tensor) ──
try:
    import torchvision.transforms.functional_tensor  # noqa: F401
except (ImportError, ModuleNotFoundError):
    import types, sys
    import torchvision.transforms.functional as _F
    _ft = types.ModuleType("torchvision.transforms.functional_tensor")
    _ft.rgb_to_grayscale = _F.rgb_to_grayscale  # type: ignore
    sys.modules["torchvision.transforms.functional_tensor"] = _ft
    import torchvision.transforms as _T
    _T.functional_tensor = _ft  # type: ignore

import asyncio
import gc
import logging
import os
import shutil
import threading
import time
import uuid
from pathlib import Path
from typing import Optional
import cv2
import numpy as np
import torch
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("enhance")

app = FastAPI(title="Enhance Service", version="2.0.0")

WORK_DIR = Path(os.getenv("ENHANCE_WORK_DIR", "/tmp/enhance"))
MODEL_DIR = Path(os.getenv("ENHANCE_MODEL_DIR", "/home/deploy/enhance-models"))
WORK_DIR.mkdir(parents=True, exist_ok=True)
MODEL_DIR.mkdir(parents=True, exist_ok=True)

ESRGAN_TILE = 256          # tile size (low memory mode)
# Max output side in pixels — prevents excessive memory on huge targets
MAX_OUTPUT_PX = 7200

# GFPGAN: enable with swap (2GB swap added 2026-06-21 — now safe)
ENABLE_GFPGAN = os.getenv("ENABLE_GFPGAN", "false").lower() == "true"
# How strongly to restore faces: 0=original, 1=fully AI. 0.85 = strong but not plastic.
GFPGAN_FIDELITY = float(os.getenv("GFPGAN_FIDELITY", "0.85"))

# In-memory job store
jobs: dict[str, dict] = {}
_processing = False


class JobStatus(BaseModel):
    job_id: str
    status: str   # pending | processing | done | error
    progress: int
    message: str
    width: Optional[int] = None
    height: Optional[int] = None
    output_file: Optional[str] = None


@app.get("/health")
def health():
    return {"status": "ok", "jobs": len(jobs), "gfpgan": ENABLE_GFPGAN}


@app.post("/enhance/start")
async def enhance_start(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    target_w: Optional[int] = Form(None),
    target_h: Optional[int] = Form(None),
):
    """Accept image + optional target size, return job_id immediately."""
    job_id = str(uuid.uuid4()).replace("-", "")
    input_path = WORK_DIR / f"{job_id}_input.jpg"
    output_path = WORK_DIR / f"{job_id}_output.jpg"

    with open(input_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    jobs[job_id] = {
        "status": "pending",
        "progress": 0,
        "message": "В очереди",
        "input": str(input_path),
        "output": str(output_path),
        "target_w": target_w,
        "target_h": target_h,
        "created": time.time(),
    }

    background_tasks.add_task(run_enhance_job, job_id)
    return {"job_id": job_id}


@app.get("/enhance/status/{job_id}", response_model=JobStatus)
def enhance_status(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    j = jobs[job_id]
    return JobStatus(
        job_id=job_id,
        status=j["status"],
        progress=j["progress"],
        message=j["message"],
        width=j.get("width"),
        height=j.get("height"),
        output_file=j.get("output") if j["status"] == "done" else None,
    )


@app.get("/enhance/result/{job_id}")
def enhance_result(job_id: str):
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    j = jobs[job_id]
    if j["status"] != "done":
        raise HTTPException(400, f"Job not done: {j['status']}")
    path = j["output"]
    if not Path(path).exists():
        raise HTTPException(500, "Output file missing")
    return FileResponse(path, media_type="image/jpeg")


async def run_enhance_job(job_id: str):
    global _processing

    while _processing:
        await asyncio.sleep(0.5)

    _processing = True
    j = jobs[job_id]
    try:
        j["status"] = "processing"
        j["progress"] = 5
        j["message"] = "Запуск..."

        result = await asyncio.get_event_loop().run_in_executor(
            None, _sync_enhance, job_id, j["input"], j["output"],
            j.get("target_w"), j.get("target_h"),
        )
        j.update(result)
        j["status"] = "done"
        j["progress"] = 100
        j["message"] = "Готово"
    except Exception as e:
        log.error(f"Job {job_id} failed: {e}", exc_info=True)
        j["status"] = "error"
        j["message"] = f"Ошибка: {str(e)[:200]}"
        j["progress"] = 0
    finally:
        _processing = False
        try:
            Path(j["input"]).unlink(missing_ok=True)
        except Exception:
            pass


def _update_progress(job_id: str, progress: int, message: str):
    if job_id in jobs:
        jobs[job_id]["progress"] = progress
        jobs[job_id]["message"] = message


def _sync_enhance(
    job_id: str,
    input_path: str,
    output_path: str,
    target_w: Optional[int],
    target_h: Optional[int],
) -> dict:
    """
    Pipeline (memory-safe for 2GB RAM server):
      1. GFPGAN face restoration on ORIGINAL image — runs first while RAM is free.
         GFPGAN crops each face to 512×512 internally, so input resolution doesn't
         affect face quality; running on original halves inference memory vs post-ESRGAN.
      2. Real-ESRGAN ×2 pass on GFPGAN output — GFPGAN already freed at this point.
      3. If target requires >2.5× of original: second ESRGAN ×2 pass.
      4. Resize to exact target.
      5. Light unsharp mask for print crispness.
      6. Save JPEG quality 95.
    """
    start_ts = time.time()
    log.info(f"[{job_id}] Start enhance — target: {target_w}×{target_h}")
    _update_progress(job_id, 8, "Загрузка изображения...")

    img_bgr = cv2.imread(input_path)
    if img_bgr is None:
        raise ValueError("Не удалось открыть изображение")

    orig_h, orig_w = img_bgr.shape[:2]
    log.info(f"[{job_id}] Input: {orig_w}×{orig_h}  target: {target_w}×{target_h}")

    # ── Determine needed scale ─────────────────────────────────────────────────
    needed_scale = 2.0  # default: ×2
    if target_w and target_h:
        needed_scale = max(target_w / orig_w, target_h / orig_h)
        # Cap target to MAX_OUTPUT_PX to protect memory
        max_scale = MAX_OUTPUT_PX / max(orig_w, orig_h)
        needed_scale = min(needed_scale, max_scale)
        log.info(f"[{job_id}] Needed scale: {needed_scale:.2f}×")

    do_pass2 = needed_scale > 2.5   # second ESRGAN pass for ×4 range
    do_esrgan = needed_scale > 1.1  # skip upscale if already big enough

    # ── Step 1: GFPGAN face restoration on ORIGINAL image ────────────────────
    # Run FIRST while process RAM is at baseline (~300MB), before ESRGAN loads.
    # GFPGAN peak: baseline + models (550MB) + inference on small image ≈ 900MB total.
    # After _gfpgan_enhance returns, restorer is deleted and gc.collect() called.
    if ENABLE_GFPGAN:
        _update_progress(job_id, 12, "Восстановление лиц (GFPGAN)…")
        img_bgr = _gfpgan_enhance(job_id, img_bgr)
        log.info(f"[{job_id}] GFPGAN done: {img_bgr.shape[1]}×{img_bgr.shape[0]}")
    else:
        _update_progress(job_id, 12, "GFPGAN отключён, пропуск...")

    # ── Step 2: Real-ESRGAN ×2 (GFPGAN freed; ESRGAN peak ≈ 500MB) ──────────
    esrgan_model = None
    if do_esrgan or ENABLE_GFPGAN:
        _update_progress(job_id, 20, "Апскейл ×2 (Real-ESRGAN)…")
        img_bgr, esrgan_model = _realesrgan_pass(job_id, img_bgr, progress_start=20, progress_end=70)
        log.info(f"[{job_id}] After ×2: {img_bgr.shape[1]}×{img_bgr.shape[0]}")
    else:
        _update_progress(job_id, 20, "Фото достаточного разрешения, пропускаю апскейл...")

    # ── Step 3: Second pass for large targets (>2.5× of original) ────────────
    if do_pass2:
        _update_progress(job_id, 72, "Апскейл ×2 (второй проход для большой ячейки)…")
        img_bgr, esrgan_model = _realesrgan_pass(job_id, img_bgr, progress_start=72, progress_end=90, model=esrgan_model)
        log.info(f"[{job_id}] After ×4: {img_bgr.shape[1]}×{img_bgr.shape[0]}")

    # Release ESRGAN model
    if esrgan_model is not None:
        del esrgan_model
        gc.collect()

    # ── Step 4: Resize to exact target (keep aspect) ──────────────────────────
    out_h, out_w = img_bgr.shape[:2]
    if target_w and target_h:
        img_bgr = _resize_to_target(img_bgr, target_w, target_h)
        out_h, out_w = img_bgr.shape[:2]
        log.info(f"[{job_id}] Resized to target: {out_w}×{out_h}")

    # ── Step 5: Light unsharp mask for print crispness ───────────────────────
    _update_progress(job_id, 92, "Финальная обработка…")
    img_bgr = _unsharp_mask(img_bgr, sigma=0.7, strength=0.4)

    _update_progress(job_id, 96, "Сохранение…")
    cv2.imwrite(output_path, img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 95])

    elapsed = round(time.time() - start_ts, 1)
    log.info(f"[{job_id}] Done: {out_w}×{out_h} in {elapsed}s")
    return {"width": out_w, "height": out_h}


def _realesrgan_pass(
    job_id: str,
    img_bgr: np.ndarray,
    progress_start: int = 15,
    progress_end: int = 55,
    model=None,
) -> tuple[np.ndarray, object]:
    """Run one Real-ESRGAN ×2 pass. Returns (output_img, model_handle)."""
    try:
        from basicsr.archs.rrdbnet_arch import RRDBNet
        from realesrgan import RealESRGANer

        model_path = MODEL_DIR / "RealESRGAN_x2plus.pth"
        if not model_path.exists():
            log.warning(f"[{job_id}] ESRGAN model not found, skipping")
            return img_bgr, None

        if model is None:
            rrdb = RRDBNet(num_in_ch=3, num_out_ch=3, num_feat=64, num_block=23, num_grow_ch=32, scale=2)
            model = RealESRGANer(
                scale=2,
                model_path=str(model_path),
                model=rrdb,
                tile=ESRGAN_TILE,
                tile_pad=10,
                pre_pad=0,
                half=False,
            )

        # Progress ticker
        stop_evt = threading.Event()
        def _ticker():
            t0 = time.time()
            est = 90.0
            while not stop_evt.is_set():
                frac = min((time.time() - t0) / est, 0.97)
                pct = int(progress_start + frac * (progress_end - progress_start))
                elapsed = int(time.time() - t0)
                _update_progress(job_id, pct, f"Апскейл ×2 (Real-ESRGAN)… {elapsed}с")
                time.sleep(3)
        th = threading.Thread(target=_ticker, daemon=True)
        th.start()
        try:
            output, _ = model.enhance(img_bgr, outscale=2)
        finally:
            stop_evt.set()

        return output, model

    except Exception as e:
        log.warning(f"[{job_id}] Real-ESRGAN failed ({e}), returning unchanged")
        return img_bgr, None


def _gfpgan_enhance(job_id: str, img_bgr: np.ndarray) -> np.ndarray:
    """Detect and restore faces with GFPGAN. Run on original-size image to save RAM."""
    try:
        from gfpgan import GFPGANer
        import ctypes

        model_path = MODEL_DIR / "GFPGANv1.4.pth"
        if not model_path.exists():
            log.warning(f"[{job_id}] GFPGAN model not found, skipping")
            return img_bgr

        restorer = GFPGANer(
            model_path=str(model_path),
            upscale=1,          # output same size — ESRGAN handles upscaling
            arch="clean",
            channel_multiplier=2,
            bg_upsampler=None,
        )

        _, _, restored = restorer.enhance(
            img_bgr,
            has_aligned=False,
            only_center_face=False,
            paste_back=True,
            weight=GFPGAN_FIDELITY,
        )

        del restorer
        gc.collect()
        # Release glibc allocator pages back to OS so ESRGAN can load without OOM.
        try:
            ctypes.CDLL("libc.so.6").malloc_trim(0)
        except Exception:
            pass

        if restored is not None:
            log.info(f"[{job_id}] GFPGAN: face restoration done (fidelity={GFPGAN_FIDELITY})")
            return restored
        return img_bgr

    except Exception as e:
        log.warning(f"[{job_id}] GFPGAN failed ({e}), continuing without face restoration")
        return img_bgr


def _resize_to_target(img: np.ndarray, target_w: int, target_h: int) -> np.ndarray:
    """Resize to fill target dimensions, preserving aspect ratio (crop if needed)."""
    h, w = img.shape[:2]
    if w == target_w and h == target_h:
        return img

    # Scale to fill the target box (cover), preserving aspect
    scale_w = target_w / w
    scale_h = target_h / h
    scale = max(scale_w, scale_h)

    if scale < 0.99:
        # Downscale: use area interpolation (best quality for downscale)
        new_w = int(round(w * scale))
        new_h = int(round(h * scale))
        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
    elif scale > 1.01:
        # Minor upscale: lanczos
        new_w = int(round(w * scale))
        new_h = int(round(h * scale))
        img = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)

    # Center-crop to exact target
    h2, w2 = img.shape[:2]
    if w2 != target_w or h2 != target_h:
        x0 = max(0, (w2 - target_w) // 2)
        y0 = max(0, (h2 - target_h) // 2)
        img = img[y0:y0 + target_h, x0:x0 + target_w]

    return img


def _unsharp_mask(img: np.ndarray, sigma: float = 0.7, strength: float = 0.4) -> np.ndarray:
    """Gentle unsharp mask — improves perceived sharpness without halos."""
    try:
        blurred = cv2.GaussianBlur(img, (0, 0), sigma)
        return cv2.addWeighted(img, 1.0 + strength, blurred, -strength, 0)
    except Exception:
        return img


# ─────────────────────────────────────────────────────────────────────────────
# COVER GENERATION  (Travelbook feature — unchanged)
# ─────────────────────────────────────────────────────────────────────────────

from cover_generator import generate_cover, PALETTES, LOCATION_TYPES, get_silhouette_type, external_api_available, generate_via_external_api  # noqa: E402


class CoverGenerateRequest(BaseModel):
    location: str = "Италия"
    style: str = "минимал"
    book_size: str = "S20x30"
    seed: Optional[int] = None


cover_jobs: dict[str, dict] = {}


@app.post("/cover/generate")
async def cover_generate(req: CoverGenerateRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4()).replace("-", "")
    output_path = WORK_DIR / f"cover_{job_id}.jpg"
    cover_jobs[job_id] = {
        "status": "pending", "progress": 0, "message": "В очереди...",
        "output": str(output_path), "location": req.location, "style": req.style,
        "book_size": req.book_size, "seed": req.seed, "width": None, "height": None,
        "created": time.time(),
    }
    background_tasks.add_task(_run_cover_job, job_id, req)
    return {"job_id": job_id}


@app.get("/cover/status/{job_id}")
def cover_status(job_id: str):
    if job_id not in cover_jobs:
        raise HTTPException(404, "Job not found")
    j = cover_jobs[job_id]
    return {
        "job_id": job_id, "status": j["status"], "progress": j["progress"],
        "message": j["message"], "width": j.get("width"), "height": j.get("height"),
        "has_result": j["status"] == "done",
    }


@app.get("/cover/result/{job_id}")
def cover_result(job_id: str):
    if job_id not in cover_jobs:
        raise HTTPException(404, "Job not found")
    j = cover_jobs[job_id]
    if j["status"] != "done":
        raise HTTPException(400, f"Job not done: {j['status']}")
    path = j["output"]
    if not Path(path).exists():
        raise HTTPException(500, "Output file missing")
    return FileResponse(path, media_type="image/jpeg")


@app.get("/cover/locations")
def cover_locations():
    return {
        "locations": sorted(LOCATION_TYPES.keys()),
        "styles": list(PALETTES.keys()),
        "external_api": external_api_available(),
    }


async def _run_cover_job(job_id: str, req: CoverGenerateRequest):
    j = cover_jobs[job_id]
    try:
        j["status"] = "processing"
        j["progress"] = 10
        j["message"] = "Создаю иллюстрацию..."
        output_path = j["output"]
        start = time.time()

        if external_api_available():
            j["progress"] = 20
            j["message"] = "Генерирую через AI сервис..."
            result = await generate_via_external_api(req.location, req.style, req.book_size, output_path)
            if result:
                j["width"], j["height"] = result
                j["status"] = "done"
                j["progress"] = 100
                j["message"] = f"Готово ({int(time.time() - start)}с)"
                return

        j["progress"] = 30
        j["message"] = "Рисую постер..."
        w, h = await asyncio.get_event_loop().run_in_executor(
            None, generate_cover, req.location, req.style, req.book_size, output_path, req.seed,
        )
        elapsed = round(time.time() - start, 1)
        j["width"] = w
        j["height"] = h
        j["status"] = "done"
        j["progress"] = 100
        j["message"] = f"Готово ({elapsed}с)"
        log.info(f"[cover/{job_id}] Done: {w}×{h} in {elapsed}s — {req.location}/{req.style}")

    except Exception as e:
        log.error(f"[cover/{job_id}] Failed: {e}", exc_info=True)
        j["status"] = "error"
        j["message"] = f"Ошибка: {str(e)[:200]}"
        j["progress"] = 0


@app.on_event("startup")
async def startup():
    log.info(f"Enhance service v2 started. Work: {WORK_DIR}, Models: {MODEL_DIR}")
    log.info(f"  GFPGAN: {'ENABLED (fidelity={})'.format(GFPGAN_FIDELITY) if ENABLE_GFPGAN else 'disabled'}")
    for m in ["GFPGANv1.4.pth", "RealESRGAN_x2plus.pth"]:
        p = MODEL_DIR / m
        exists = "✓" if p.exists() else "✗ MISSING"
        sz = f" ({p.stat().st_size // 1024 // 1024}MB)" if p.exists() else ""
        log.info(f"  Model {m}: {exists}{sz}")
    log.info(f"  Cover: Pillow | External API: {'✓' if external_api_available() else '✗'}")
