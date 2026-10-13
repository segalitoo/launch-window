"""Night grade preview, the same 2D steps the engine will run.

Art is rendered in neutral daylight. The engine darkens and tints it for night,
then multiplies in a light layer (lamp pools). This script previews that, and can
draw the gameplay overlay (a guard's sight cone and a selection ring) on top, to
test readability in the real context.

Usage:
  python3 tools/grade_night.py assets/raw/blockout/yard_B_day.png [--hud]
Reads the render's sidecar JSON (yard_B.json) and the map JSON next to it.
Writes yard_B_night.png, and yard_B_night_hud.png with --hud.
"""

import argparse
import json
import math
import os

from PIL import Image, ImageChops, ImageDraw, ImageFilter

# Night tint per look: multiplier per channel for the base, as the engine will use
NIGHT = {
    "A": (0.30, 0.33, 0.50),
    "B": (0.24, 0.30, 0.44),
    "C": (0.42, 0.44, 0.52),
}
LAMP_COLOR = (1.0, 0.78, 0.50)
LAMP_RADIUS_TILES = 3.2
LAMP_GAIN = 1.25
CONE_COLOR = (255, 181, 71)  # same flat amber as the game overlay
SQUAD_BLUE = (108, 196, 255)
FOV = math.radians(70)
CONE_LEN = 6.5


def load(path):
    with open(path) as f:
        return json.load(f)


def to_px(meta, x, y, z_px=0.0):
    ss = meta["supersample"]
    ox, oy = meta["origin_px"]
    return (ox + (x - y) * 32 * ss, oy + (x + y) * 16 * ss - z_px * ss)


def light_layer(meta, size, tint):
    """Ambient tint everywhere plus a warm elliptical pool under the lamp."""
    w, h = size
    ss = meta["supersample"]
    cx, cy = meta["lamp_ground_px"]
    rx = LAMP_RADIUS_TILES * 32 * ss * 1.4
    ry = rx / 2
    layer = Image.new("RGB", size, tuple(int(c * 255) for c in tint))
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    steps = 24
    for i in range(steps):
        k = 1 - i / steps
        v = int(255 * (1 - k) ** 1.6)
        d.ellipse((cx - rx * k, cy - ry * k, cx + rx * k, cy + ry * k), fill=v)
    mask = mask.filter(ImageFilter.GaussianBlur(radius=8 * ss))
    warm = Image.new("RGB", size, tuple(int(min(1, c * LAMP_GAIN) * 255) for c in LAMP_COLOR))
    return Image.composite(warm, layer, mask)


def lamp_glow(meta, img):
    ss = meta["supersample"]
    lx, ly = meta["lamp_px"]
    glow = Image.new("RGB", img.size, (0, 0, 0))
    d = ImageDraw.Draw(glow)
    r = 10 * ss
    d.ellipse((lx - r, ly - r, lx + r, ly + r), fill=(255, 210, 150))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=6 * ss))
    return ImageChops.add(img, glow)


def blocks_sight(md, x, y):
    if x < 0 or y < 0 or x >= md["cols"] or y >= md["rows"]:
        return True
    return md["cells"][y * md["cols"] + x] in "#BcDGLT"


def cast(md, x0, y0, ang, max_len):
    """Grid DDA, same as src/sim/vision.ts castRay."""
    dx, dy = math.cos(ang), math.sin(ang)
    tx, ty = math.floor(x0), math.floor(y0)
    sx = 1 if dx > 0 else -1
    sy = 1 if dy > 0 else -1
    tdx = abs(1 / dx) if dx else math.inf
    tdy = abs(1 / dy) if dy else math.inf
    tmx = ((tx + 1 - x0) if dx > 0 else (x0 - tx)) / abs(dx) if dx else math.inf
    tmy = ((ty + 1 - y0) if dy > 0 else (y0 - ty)) / abs(dy) if dy else math.inf
    for _ in range(200):
        if tmx < tmy:
            t = tmx
            tmx += tdx
            tx += sx
        else:
            t = tmy
            tmy += tdy
            ty += sy
        if t >= max_len:
            return max_len
        if blocks_sight(md, tx, ty):
            return t
    return max_len


def draw_hud(meta, md, img):
    """Yard guard's cone (facing 120 degrees, as in the sim) and Yoav's selection ring."""
    ss = meta["supersample"]
    over = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(over)
    gx, gy, face = 18.5, 23.5, math.radians(120)
    for frac, alpha in ((1.0, 60), (0.5, 60)):
        pts = [to_px(meta, gx, gy)]
        for i in range(29):
            a = face - FOV / 2 + FOV * i / 28
            r = min(cast(md, gx, gy, a, CONE_LEN), CONE_LEN * frac)
            pts.append(to_px(meta, gx + math.cos(a) * r, gy + math.sin(a) * r))
        d.polygon(pts, fill=(*CONE_COLOR, alpha))
    ux, uy = 16.6, 28.4
    cx, cy = to_px(meta, ux, uy)
    rx, ry = 17 * ss, 8.5 * ss
    d.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), outline=(*SQUAD_BLUE, 255), width=2 * ss)
    return Image.alpha_composite(img.convert("RGBA"), over).convert("RGB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("day")
    ap.add_argument("--hud", action="store_true")
    a = ap.parse_args()
    base = a.day[: -len("_day.png")]
    meta = load(base + ".json")
    md = load(os.path.join(os.path.dirname(a.day), "map.json"))
    day = Image.open(a.day).convert("RGB")
    tint = NIGHT[meta["look"]]
    night = ImageChops.multiply(day, light_layer(meta, day.size, tint))
    night = lamp_glow(meta, night)
    night.save(base + "_night.png")
    print("wrote", base + "_night.png")
    if a.hud:
        draw_hud(meta, md, night).save(base + "_night_hud.png")
        draw_hud(meta, md, day).save(base + "_day_hud.png")
        print("wrote", base + "_night_hud.png")


if __name__ == "__main__":
    main()
