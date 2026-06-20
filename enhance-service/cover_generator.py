"""
Travel book cover poster generator.
Produces vintage travel-poster style images using Pillow — no ML model required.
Text is intentionally NOT rendered into the image (frontend adds text layers on top).

Output: portrait (900×1350) for 20×30, square (1000×1000) for all square sizes.
"""

from __future__ import annotations
import math
import os
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

# ─── Palette presets ────────────────────────────────────────────────────────

PALETTES: dict[str, dict] = {
    "закат": {
        "bg_top":    (255, 195, 90),
        "bg_mid":    (238, 95, 40),
        "bg_bottom": (170, 35, 28),
        "sky":       (255, 220, 140),
        "shape":     (45, 18, 12),
        "accent":    (255, 240, 185),
        "line":      (200, 85, 28),
    },
    "минимал": {
        "bg_top":    (252, 248, 240),
        "bg_mid":    (242, 235, 220),
        "bg_bottom": (228, 218, 200),
        "sky":       (248, 244, 235),
        "shape":     (58, 42, 25),
        "accent":    (162, 128, 85),
        "line":      (128, 96, 60),
    },
    "ночь": {
        "bg_top":    (8, 14, 45),
        "bg_mid":    (18, 28, 70),
        "bg_bottom": (28, 42, 98),
        "sky":       (12, 20, 58),
        "shape":     (6, 11, 36),
        "accent":    (212, 178, 88),
        "line":      (175, 142, 58),
    },
    "пастель": {
        "bg_top":    (238, 226, 248),
        "bg_mid":    (222, 238, 228),
        "bg_bottom": (208, 238, 222),
        "sky":       (240, 228, 250),
        "shape":     (95, 80, 125),
        "accent":    (182, 162, 210),
        "line":      (138, 112, 168),
    },
    "тропики": {
        "bg_top":    (22, 188, 215),
        "bg_mid":    (14, 158, 182),
        "bg_bottom": (8, 125, 152),
        "sky":       (28, 200, 225),
        "shape":     (5, 75, 95),
        "accent":    (248, 148, 95),
        "line":      (238, 115, 68),
    },
}

# ─── Location → silhouette type ─────────────────────────────────────────────

LOCATION_TYPES: dict[str, str] = {
    # Mountains
    "Швейцария": "mountains", "Австрия": "mountains", "Норвегия": "mountains",
    "Исландия": "mountains", "Непал": "mountains", "Перу": "mountains",
    "Аргентина": "mountains", "Чили": "mountains", "Грузия": "mountains",
    "Армения": "mountains", "Кавказ": "mountains", "Альпы": "mountains",
    "Доломиты": "mountains", "Патагония": "mountains", "Новая Зеландия": "mountains",
    "Канада": "mountains",

    # Paris / Eiffel
    "Франция": "eiffel", "Париж": "eiffel",

    # Russia / Kremlin
    "Россия": "kremlin", "Москва": "kremlin", "Санкт-Петербург": "kremlin",

    # Japan / Fuji
    "Япония": "fuji", "Токио": "fuji", "Киото": "fuji", "Осака": "fuji",

    # Egypt / Pyramids
    "Египет": "pyramids", "Каир": "pyramids",

    # Mosque / Middle East
    "Турция": "mosque", "Стамбул": "mosque", "ОАЭ": "mosque", "Дубай": "mosque",
    "Иран": "mosque", "Марокко": "mosque", "Саудовская Аравия": "mosque",

    # Italy / Colosseum
    "Италия": "colosseum", "Рим": "colosseum",

    # Beach / Mediterranean
    "Греция": "beach", "Кипр": "beach", "Испания": "beach", "Португалия": "beach",
    "Хорватия": "beach", "Черногория": "beach", "Вьетнам": "beach",
    "Шри-Ланка": "beach", "Камбоджа": "beach", "Куба": "beach",

    # Palm / Tropical
    "Таиланд": "palm", "Бали": "palm", "Индонезия": "palm", "Мальдивы": "palm",
    "Мексика": "palm", "Гавайи": "palm", "Карибы": "palm", "Сейшелы": "palm",
    "Маврикий": "palm", "Занзибар": "palm", "Доминикана": "palm",

    # Forest / Scandinavia
    "Финляндия": "forest", "Швеция": "forest",

    # Generic city skyline
    "Нью-Йорк": "skyline", "Сингапур": "skyline", "Гонконг": "skyline",
    "Шанхай": "skyline", "Лондон": "skyline", "Берлин": "skyline",
    "Амстердам": "skyline", "Барселона": "skyline",
}


def get_silhouette_type(location: str) -> str:
    return LOCATION_TYPES.get(location, "skyline")


# ─── Canvas dimensions by book size ─────────────────────────────────────────

def canvas_size(book_size: str) -> tuple[int, int]:
    """Return (width, height) in pixels appropriate for the front cover zone."""
    portrait_sizes = {"S20x30"}
    if book_size in portrait_sizes:
        return (900, 1350)
    return (1000, 1000)


# ─── Main generator ─────────────────────────────────────────────────────────

def generate_cover(
    location: str,
    style: str,
    book_size: str,
    output_path: str,
    seed: int | None = None,
) -> tuple[int, int]:
    """
    Generate a vintage travel poster background image.
    Text is NOT added here — it's rendered by the frontend as a separate layer.
    Returns (width, height) of the generated image.
    """
    if seed is not None:
        random.seed(seed)

    palette_key = style if style in PALETTES else "минимал"
    palette = PALETTES[palette_key]
    shape_type = get_silhouette_type(location)
    w, h = canvas_size(book_size)

    img = Image.new("RGB", (w, h), palette["bg_top"])
    draw = ImageDraw.Draw(img)

    _draw_background(img, draw, w, h, palette)
    _draw_horizon(draw, w, h, palette)
    _draw_silhouette(draw, shape_type, w, h, palette)
    _draw_decorations(draw, w, h, palette)

    img.save(output_path, "JPEG", quality=93, optimize=True)
    return (w, h)


# ─── Background ─────────────────────────────────────────────────────────────

def _lerp_color(c1: tuple, c2: tuple, t: float) -> tuple:
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def _draw_background(img: Image.Image, draw: ImageDraw.ImageDraw, w: int, h: int, p: dict):
    """Draw a three-stop gradient background."""
    sky_zone = int(h * 0.65)
    for y in range(sky_zone):
        t = y / sky_zone
        if t < 0.5:
            col = _lerp_color(p["bg_top"], p["bg_mid"], t * 2)
        else:
            col = _lerp_color(p["bg_mid"], p["bg_bottom"], (t - 0.5) * 2)
        draw.line([(0, y), (w, y)], fill=col)
    for y in range(sky_zone, h):
        draw.line([(0, y), (w, y)], fill=p["bg_bottom"])


def _draw_horizon(draw: ImageDraw.ImageDraw, w: int, h: int, p: dict):
    """Draw subtle horizon glow band."""
    hy = int(h * 0.62)
    glow_h = int(h * 0.06)
    for i in range(glow_h):
        t = 1 - abs(i - glow_h // 2) / (glow_h // 2)
        blend = _lerp_color(p["bg_mid"], p["sky"], t * 0.4)
        draw.line([(0, hy - glow_h // 2 + i), (w, hy - glow_h // 2 + i)], fill=blend)


# ─── Decorations ────────────────────────────────────────────────────────────

def _draw_decorations(draw: ImageDraw.ImageDraw, w: int, h: int, p: dict):
    """Draw vintage poster decorative elements: border, lines, dots."""
    bw = max(3, int(w * 0.006))
    pad = int(w * 0.025)

    # Outer border
    draw.rectangle([pad, pad, w - pad, h - pad], outline=p["accent"], width=bw)
    # Inner thin line
    inner = int(pad * 1.7)
    draw.rectangle([inner, inner, w - inner, h - inner], outline=p["accent"], width=max(1, bw // 2))

    # Horizontal decorative lines (poster-style rule lines near top and bottom)
    lpad = int(w * 0.08)
    top_y = int(h * 0.06)
    draw.line([(lpad, top_y), (w - lpad, top_y)], fill=p["accent"], width=bw)
    draw.line([(lpad, top_y + int(h * 0.015)), (w - lpad, top_y + int(h * 0.015))], fill=p["accent"], width=max(1, bw // 2))

    bot_y = int(h * 0.91)
    draw.line([(lpad, bot_y), (w - lpad, bot_y)], fill=p["accent"], width=bw)
    draw.line([(lpad, bot_y - int(h * 0.015)), (w - lpad, bot_y - int(h * 0.015))], fill=p["accent"], width=max(1, bw // 2))

    # Corner ornaments: small diamond at each corner
    c_pad = int(w * 0.055)
    ds = int(w * 0.018)  # diamond half-size
    for cx, cy in [(c_pad, c_pad), (w - c_pad, c_pad), (c_pad, h - c_pad), (w - c_pad, h - c_pad)]:
        pts = [(cx, cy - ds), (cx + ds, cy), (cx, cy + ds), (cx - ds, cy)]
        draw.polygon(pts, fill=p["accent"])

    # Centered compass star at very top (vintage travel motif)
    sx, sy = w // 2, int(h * 0.055)
    star_r = int(w * 0.025)
    _draw_star4(draw, sx, sy, star_r, p["accent"])


def _draw_star4(draw: ImageDraw.ImageDraw, cx: int, cy: int, r: int, color: tuple):
    """Draw a 4-pointed star."""
    inner = r // 3
    pts = []
    for i in range(8):
        angle = math.pi / 4 * i - math.pi / 2
        rad = r if i % 2 == 0 else inner
        pts.append((cx + int(rad * math.cos(angle)), cy + int(rad * math.sin(angle))))
    draw.polygon(pts, fill=color)


# ─── Silhouette dispatcher ───────────────────────────────────────────────────

def _draw_silhouette(draw: ImageDraw.ImageDraw, shape_type: str, w: int, h: int, p: dict):
    fn = {
        "mountains": _draw_mountains,
        "eiffel":    _draw_eiffel,
        "kremlin":   _draw_kremlin,
        "fuji":      _draw_fuji,
        "pyramids":  _draw_pyramids,
        "mosque":    _draw_mosque,
        "colosseum": _draw_colosseum,
        "beach":     _draw_beach,
        "palm":      _draw_palm,
        "forest":    _draw_forest,
        "skyline":   _draw_skyline,
    }.get(shape_type, _draw_skyline)
    fn(draw, w, h, p)


def _S(pts: list[tuple[float, float]], w: int, h: int) -> list[tuple[int, int]]:
    """Scale normalised (0-1) points to pixel coords."""
    return [(int(x * w), int(y * h)) for x, y in pts]


# ─── Mountains ───────────────────────────────────────────────────────────────

def _draw_mountains(draw, w, h, p):
    ground_y = 0.88
    pts = [
        (0.0, ground_y), (0.0, 0.62), (0.08, 0.50), (0.16, 0.62),
        (0.25, 0.38), (0.34, 0.57), (0.42, 0.44), (0.50, 0.30),
        (0.58, 0.44), (0.66, 0.52), (0.74, 0.40), (0.82, 0.54),
        (0.90, 0.46), (1.0, 0.58), (1.0, ground_y),
    ]
    draw.polygon(_S(pts, w, h), fill=p["shape"])
    # Snow caps
    snow = _lerp_color(p["bg_top"], (255, 255, 255), 0.7)
    for apex_x, apex_y in [(0.25, 0.38), (0.50, 0.30), (0.74, 0.40)]:
        cap = [
            (apex_x, apex_y), (apex_x - 0.06, apex_y + 0.08),
            (apex_x, apex_y + 0.04), (apex_x + 0.06, apex_y + 0.08),
        ]
        draw.polygon(_S(cap, w, h), fill=snow)
    # Ground band
    draw.rectangle(_S([(0, ground_y), (1, 1.0)], w, h)[0:2], fill=p["shape"])


# ─── Eiffel Tower ────────────────────────────────────────────────────────────

def _draw_eiffel(draw, w, h, p):
    # Solid silhouette approximation of Eiffel Tower + Parisian skyline
    ground_y = 0.88
    # Background skyline
    skyline = [
        (0.0, ground_y), (0.0, 0.72), (0.06, 0.72), (0.06, 0.68),
        (0.12, 0.68), (0.12, 0.75), (0.18, 0.75), (0.18, 0.70),
        (0.24, 0.70), (0.24, 0.74), (0.30, 0.74),
        (0.30, ground_y), (0.70, ground_y),
        (0.70, 0.74), (0.76, 0.74), (0.76, 0.70),
        (0.82, 0.70), (0.82, 0.75), (0.88, 0.75),
        (0.88, 0.68), (0.94, 0.68), (0.94, 0.72), (1.0, 0.72),
        (1.0, ground_y),
    ]
    draw.polygon(_S(skyline, w, h), fill=p["shape"])

    # Eiffel Tower (centre)
    tower = [
        (0.50, 0.10),  # apex/antenna tip
        (0.485, 0.24), (0.465, 0.36),
        # first floor ledge
        (0.37, 0.445), (0.40, 0.46), (0.385, 0.52),
        # left leg
        (0.32, 0.70), (0.30, ground_y),
        (0.36, ground_y), (0.40, 0.60), (0.43, 0.53),
        # center notch
        (0.465, 0.50), (0.50, 0.49), (0.535, 0.50),
        # right side
        (0.57, 0.53), (0.60, 0.60), (0.64, ground_y),
        (0.70, ground_y), (0.68, 0.70), (0.615, 0.52),
        (0.60, 0.46), (0.63, 0.445),
        # right upper
        (0.535, 0.36), (0.515, 0.24),
    ]
    draw.polygon(_S(tower, w, h), fill=p["shape"])
    # Accent highlight on antenna
    ant = [(0.498, 0.10), (0.502, 0.10), (0.503, 0.24), (0.497, 0.24)]
    draw.polygon(_S(ant, w, h), fill=p["accent"])
    _draw_ground(draw, w, h, p, ground_y)


# ─── Kremlin ─────────────────────────────────────────────────────────────────

def _draw_kremlin(draw, w, h, p):
    ground_y = 0.88
    # Kremlin wall (crenelated)
    wall_y_top = 0.66
    wall_h = ground_y - wall_y_top
    draw.rectangle(_S([(0.05, wall_y_top), (0.95, ground_y)], w, h)[0:2], fill=p["shape"])
    # Battlements (merlons)
    merlon_w = 0.025
    merlon_h = 0.05
    merlon_gap = 0.015
    x = 0.06
    while x < 0.94:
        draw.rectangle(_S([(x, wall_y_top - merlon_h), (x + merlon_w, wall_y_top)], w, h)[0:2], fill=p["shape"])
        x += merlon_w + merlon_gap

    # Main Spasskaya tower (center)
    tower_pts = [
        (0.42, ground_y), (0.42, 0.42), (0.45, 0.42), (0.45, 0.35),
        (0.44, 0.35), (0.44, 0.32), (0.48, 0.25), (0.50, 0.18),
        (0.52, 0.25), (0.56, 0.32), (0.56, 0.35), (0.55, 0.35),
        (0.55, 0.42), (0.58, 0.42), (0.58, ground_y),
    ]
    draw.polygon(_S(tower_pts, w, h), fill=p["shape"])
    # Onion dome / star
    cx, cy = int(0.5 * w), int(0.20 * h)
    r = int(0.022 * w)
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=p["accent"])
    _draw_star4(draw, cx, cy, r, p["line"])

    # Side towers
    for tx in [0.20, 0.80]:
        t_pts = [
            (tx - 0.05, ground_y), (tx - 0.05, 0.52),
            (tx - 0.02, 0.52), (tx - 0.02, 0.46),
            (tx, 0.40), (tx + 0.02, 0.46),
            (tx + 0.02, 0.52), (tx + 0.05, 0.52),
            (tx + 0.05, ground_y),
        ]
        draw.polygon(_S(t_pts, w, h), fill=p["shape"])
        # Small onion
        cx2, cy2 = int(tx * w), int(0.39 * h)
        r2 = int(0.014 * w)
        draw.ellipse([cx2 - r2, cy2 - r2, cx2 + r2, cy2 + r2], fill=p["shape"])

    _draw_ground(draw, w, h, p, ground_y)


# ─── Fuji ────────────────────────────────────────────────────────────────────

def _draw_fuji(draw, w, h, p):
    ground_y = 0.88
    # Perfect cone (Fuji)
    fuji_pts = [
        (0.0, ground_y), (0.5, 0.25), (1.0, ground_y)
    ]
    draw.polygon(_S(fuji_pts, w, h), fill=p["shape"])
    # Snow cap
    snow = _lerp_color(p["bg_top"], (255, 255, 255), 0.75)
    snow_pts = [
        (0.50, 0.25), (0.40, 0.42), (0.44, 0.40), (0.48, 0.44),
        (0.50, 0.41), (0.52, 0.44), (0.56, 0.40), (0.60, 0.42),
    ]
    draw.polygon(_S(snow_pts, w, h), fill=snow)
    # Distant lower hills
    hills = [
        (0.0, ground_y), (0.0, 0.78), (0.15, 0.70), (0.35, 0.76),
        (0.55, 0.72), (0.70, 0.75), (0.85, 0.70), (1.0, 0.76),
        (1.0, ground_y),
    ]
    hill_col = _lerp_color(p["shape"], p["bg_bottom"], 0.3)
    draw.polygon(_S(hills, w, h), fill=hill_col)
    # Foreground horizon lake (accent band)
    draw.rectangle(_S([(0.0, 0.80), (1.0, 0.86)], w, h)[0:2], fill=_lerp_color(p["accent"], p["bg_bottom"], 0.5))
    _draw_ground(draw, w, h, p, ground_y)


# ─── Pyramids ────────────────────────────────────────────────────────────────

def _draw_pyramids(draw, w, h, p):
    ground_y = 0.86
    # Three pyramids, largest center
    configs = [
        (0.50, 0.22, 0.36, 0.78),   # x_apex, y_apex, half_base_w, base_y
        (0.22, 0.40, 0.20, 0.78),
        (0.78, 0.40, 0.20, 0.78),
    ]
    for ix, (ax, ay, hw, by) in enumerate(configs):
        pts = [(ax - hw, by), (ax, ay), (ax + hw, by)]
        col = _lerp_color(p["shape"], p["bg_bottom"], ix * 0.15)
        draw.polygon(_S(pts, w, h), fill=col)
        # Highlight edge (one bright side)
        edge = [(ax, ay), (ax + hw, by)]
        edge_col = _lerp_color(p["shape"], p["accent"], 0.25)
        draw.line(_S(edge, w, h), fill=edge_col, width=max(2, int(w * 0.004)))

    # Desert ground
    draw.rectangle(_S([(0, ground_y), (1, 1)], w, h)[0:2], fill=p["shape"])
    # Horizon glow
    sand = _lerp_color(p["accent"], p["bg_bottom"], 0.5)
    draw.rectangle(_S([(0, ground_y - 0.04), (1, ground_y)], w, h)[0:2], fill=sand)


# ─── Mosque ──────────────────────────────────────────────────────────────────

def _draw_mosque(draw, w, h, p):
    ground_y = 0.88
    col = p["shape"]

    # Main dome body (ellipse)
    cx, cy = w // 2, int(0.52 * h)
    rx, ry = int(0.18 * w), int(0.16 * h)
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=col)

    # Dome base wall
    draw.rectangle(_S([(0.32, 0.52), (0.68, ground_y)], w, h)[0:2], fill=col)

    # Two minarets
    for mx in [0.22, 0.78]:
        minaret = [
            (mx - 0.025, ground_y), (mx - 0.025, 0.32),
            (mx, 0.24), (mx + 0.025, 0.32),
            (mx + 0.025, ground_y),
        ]
        draw.polygon(_S(minaret, w, h), fill=col)
        # Minaret top crescent
        cr_x, cr_y = int(mx * w), int(0.22 * h)
        cr = int(0.015 * w)
        draw.ellipse([cr_x - cr, cr_y - cr, cr_x + cr, cr_y + cr], fill=p["accent"])

    # Small side domes
    for sdx in [0.38, 0.62]:
        scx, scy = int(sdx * w), int(0.58 * h)
        srx, sry = int(0.06 * w), int(0.06 * h)
        draw.ellipse([scx - srx, scy - sry, scx + srx, scy + sry], fill=col)

    # Crescent on main dome
    cr_size = int(0.04 * w)
    cr_cx, cr_cy = cx, cy - ry - cr_size // 2
    draw.ellipse([cr_cx - cr_size, cr_cy - cr_size, cr_cx + cr_size, cr_cy + cr_size], fill=p["accent"])

    _draw_ground(draw, w, h, p, ground_y)


# ─── Colosseum ───────────────────────────────────────────────────────────────

def _draw_colosseum(draw, w, h, p):
    ground_y = 0.88
    # Main oval outline
    cx, cy = w // 2, int(0.63 * h)
    rx, ry = int(0.36 * w), int(0.20 * h)
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=p["shape"])
    # Hollow interior (lighter oval)
    inner_col = _lerp_color(p["shape"], p["bg_mid"], 0.4)
    draw.ellipse([cx - int(rx * 0.72), cy - int(ry * 0.68), cx + int(rx * 0.72), cy + int(ry * 0.68)],
                 fill=inner_col)
    # Arch windows (as small filled rectangles on the ring)
    n_arches = 12
    arch_col = _lerp_color(p["bg_bottom"], p["shape"], 0.5)
    for i in range(n_arches):
        angle = 2 * math.pi * i / n_arches
        ax = cx + int(rx * 0.86 * math.cos(angle))
        ay = cy + int(ry * 0.86 * math.sin(angle))
        aw, ah = int(w * 0.025), int(h * 0.05)
        draw.ellipse([ax - aw // 2, ay - ah // 2, ax + aw // 2, ay + ah // 2], fill=arch_col)
    # Ground
    _draw_ground(draw, w, h, p, ground_y)


# ─── Beach ───────────────────────────────────────────────────────────────────

def _draw_beach(draw, w, h, p):
    ground_y = 0.88
    # Sun
    sun_col = _lerp_color(p["accent"], (255, 255, 200), 0.4)
    sx, sy = int(0.70 * w), int(0.28 * h)
    sr = int(0.09 * w)
    draw.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=sun_col)
    # Rays
    for angle in range(0, 360, 30):
        rad = math.radians(angle)
        x1 = sx + int((sr + 5) * math.cos(rad))
        y1 = sy + int((sr + 5) * math.sin(rad))
        x2 = sx + int((sr + int(w * 0.025)) * math.cos(rad))
        y2 = sy + int((sr + int(w * 0.025)) * math.sin(rad))
        draw.line([(x1, y1), (x2, y2)], fill=sun_col, width=max(2, int(w * 0.004)))

    # Sea (waves)
    sea_col = _lerp_color(p["shape"], p["bg_mid"], 0.4)
    sea_top = 0.58
    draw.rectangle(_S([(0, sea_top), (1, ground_y)], w, h)[0:2], fill=sea_col)
    # Wave crests
    for i in range(3):
        wy = sea_top + 0.04 + i * 0.06
        pts = []
        steps = 30
        for step in range(steps + 1):
            x = step / steps
            y = wy + 0.018 * math.sin(x * 2 * math.pi * 2 + i * 0.7)
            pts.append((int(x * w), int(y * h)))
        wave_col = _lerp_color(sea_col, p["bg_top"], 0.3)
        draw.line(pts, fill=wave_col, width=max(2, int(h * 0.005)))

    # Beach
    beach_col = _lerp_color(p["accent"], (255, 245, 210), 0.4)
    beach_pts = [
        (0, ground_y), (0, 0.80), (0.5, 0.76), (1, 0.80), (1, ground_y)
    ]
    draw.polygon(_S(beach_pts, w, h), fill=beach_col)
    _draw_ground(draw, w, h, p, ground_y)


# ─── Palm ────────────────────────────────────────────────────────────────────

def _draw_palm(draw, w, h, p):
    ground_y = 0.88
    # Ocean background
    ocean = _lerp_color(p["shape"], p["bg_mid"], 0.35)
    draw.rectangle(_S([(0, 0.65), (1, ground_y)], w, h)[0:2], fill=ocean)

    # Palm trunk (curved, slightly leaning right)
    trunk_col = _lerp_color(p["shape"], p["accent"], 0.2)
    for trunk_x, trunk_lean in [(0.35, 0.04), (0.65, -0.03)]:
        for i in range(int(h * 0.48)):
            t = i / (h * 0.48)
            tx = trunk_x + trunk_lean * t
            ty = 0.88 - t * 0.48
            tw = max(2, int(w * 0.014 * (1 - t * 0.5)))
            draw.ellipse([int((tx - tw / (2 * w)) * w), int(ty * h), int((tx + tw / (2 * w)) * w), int(ty * h + tw)], fill=trunk_col)

    # Palm fronds
    frond_col = _lerp_color(p["shape"], (30, 80, 30), 0.5)
    for trunk_x, trunk_lean in [(0.35, 0.04), (0.65, -0.03)]:
        tip_x = trunk_x + trunk_lean
        tip_y = 0.40
        for angle in range(0, 360, 40):
            rad = math.radians(angle)
            frond_len = 0.15 + 0.05 * math.cos(rad)
            ex = tip_x + frond_len * math.cos(rad)
            ey = tip_y + frond_len * math.sin(rad) * 0.6
            draw.line([
                (int(tip_x * w), int(tip_y * h)),
                (int(ex * w), int(ey * h)),
            ], fill=frond_col, width=max(2, int(w * 0.010)))

    _draw_ground(draw, w, h, p, ground_y)


# ─── Forest ──────────────────────────────────────────────────────────────────

def _draw_forest(draw, w, h, p):
    ground_y = 0.88
    tree_col = p["shape"]
    for tx_frac, scale in [
        (0.08, 1.0), (0.20, 0.85), (0.32, 1.1), (0.44, 0.95), (0.56, 1.0),
        (0.68, 0.9), (0.80, 1.05), (0.92, 0.88),
    ]:
        bx = tx_frac
        base_y = ground_y
        # Three stacked triangles (classic fir tree)
        for layer, (tier_y, tier_hw) in enumerate(
            [(0.20, 0.10), (0.34, 0.14), (0.48, 0.18)]
        ):
            pts = [
                (bx, (tier_y + 0.02 * scale) * scale + (1 - scale) * 0.55),
                (bx - tier_hw * scale, base_y - (layer * 0.04)),
                (bx + tier_hw * scale, base_y - (layer * 0.04)),
            ]
            shade = _lerp_color(tree_col, p["bg_bottom"], layer * 0.1)
            draw.polygon(_S(pts, w, h), fill=shade)
        # Trunk
        draw.rectangle([
            int((bx - 0.012 * scale) * w), int(0.80 * h),
            int((bx + 0.012 * scale) * w), int(ground_y * h),
        ], fill=_lerp_color(tree_col, p["accent"], 0.2))

    _draw_ground(draw, w, h, p, ground_y)


# ─── Skyline ─────────────────────────────────────────────────────────────────

def _draw_skyline(draw, w, h, p):
    ground_y = 0.88
    bldg_col = p["shape"]
    rng = random.Random(42)
    x = 0.02
    while x < 0.98:
        bw = rng.uniform(0.04, 0.12)
        bh = rng.uniform(0.18, 0.48)
        top_y = ground_y - bh
        # Main body
        draw.rectangle(_S([(x, top_y), (min(x + bw, 0.98), ground_y)], w, h)[0:2], fill=bldg_col)
        # Antenna / spire
        if rng.random() < 0.3:
            ax = (x + x + bw) / 2
            ah = rng.uniform(0.06, 0.10)
            aw = 0.008
            draw.rectangle(_S([(ax - aw, top_y - ah), (ax + aw, top_y)], w, h)[0:2], fill=bldg_col)
        # Windows (accent dots)
        if bw > 0.07:
            for wx in [x + bw * 0.25, x + bw * 0.75]:
                for wyi in range(3):
                    wy = top_y + 0.04 + wyi * 0.06
                    if wy < ground_y - 0.04:
                        ws = int(w * 0.008)
                        draw.rectangle([int(wx * w), int(wy * h), int(wx * w) + ws, int(wy * h) + ws],
                                       fill=p["accent"])
        x += bw + rng.uniform(0.005, 0.02)

    _draw_ground(draw, w, h, p, ground_y)


# ─── Ground helper ───────────────────────────────────────────────────────────

def _draw_ground(draw, w, h, p, ground_y: float = 0.88):
    draw.rectangle(_S([(0, ground_y), (1, 1.0)], w, h)[0:2], fill=p["shape"])
    # Thin accent strip at horizon
    strip_col = _lerp_color(p["accent"], p["bg_bottom"], 0.6)
    draw.rectangle(_S([(0, ground_y), (1, ground_y + 0.012)], w, h)[0:2], fill=strip_col)


# ─── External API adapter ────────────────────────────────────────────────────

def external_api_available() -> bool:
    return bool(os.getenv("COVER_IMAGE_API_KEY"))


async def generate_via_external_api(
    location: str, style: str, book_size: str, output_path: str
) -> tuple[int, int] | None:
    """
    Call an external image generation API (Stability AI / generic OpenAI-compatible).
    Returns (w, h) or None if not configured / failed.
    """
    try:
        import httpx

        api_key = os.getenv("COVER_IMAGE_API_KEY", "")
        api_url = os.getenv("COVER_IMAGE_API_URL", "https://api.stability.ai/v2beta/stable-image/generate/core")
        provider = os.getenv("COVER_IMAGE_API_PROVIDER", "stability")
        w, h = canvas_size(book_size)

        palette_desc = {
            "закат":   "warm orange golden sunset palette, dramatic sky",
            "минимал": "minimal earth tones, ivory beige, elegant",
            "ночь":    "deep navy night, gold accents, moonlit",
            "пастель": "soft pastel colors, gentle romantic tones",
            "тропики": "turquoise tropical ocean, vibrant coral, lush",
        }.get(style, "classic vintage colors")

        prompt = (
            f"vintage retro travel poster, {location}, flat vector illustration, "
            f"recognizable landmark silhouette, {palette_desc}, limited color palette, "
            f"art deco style, no text, no letters, high quality print poster"
        )

        negative_prompt = "text, letters, words, typography, watermark, blurry, photo, realistic"

        if provider == "stability":
            async with httpx.AsyncClient(timeout=90) as client:
                resp = await client.post(
                    api_url,
                    headers={"Authorization": f"Bearer {api_key}", "Accept": "image/*"},
                    data={
                        "prompt": prompt,
                        "negative_prompt": negative_prompt,
                        "output_format": "jpeg",
                        "aspect_ratio": "2:3" if h > w else "1:1",
                    },
                )
                if resp.status_code != 200:
                    return None
                with open(output_path, "wb") as f:
                    f.write(resp.content)
                img = Image.open(output_path)
                return img.size
        return None

    except Exception as e:
        import logging
        logging.getLogger("cover").warning(f"External API failed: {e}")
        return None
