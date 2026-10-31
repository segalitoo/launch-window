"""Builds the desert drawn around the playable map (Phase 6, Ran: no black around the map, and
no visibly repeating tile).

One large image, not a tile. It is splatted from many patches of open sand sampled from the
approved paintings: each patch gets a random place and flip and a soft round edge, so no pattern
repeats. Patches with structures, roads or strong lines are rejected by an edge test. A broad,
gentle light/dark variation goes on top, the colour is matched to the paintings' own sand at the
map's edge, and the night tint is baked in (the engine grades paintings the same way).

The image covers the map's screen rectangle plus the camera's pan margin and is drawn at
1 / SCALE world px per image px under everything (src/render/MapScene.ts).

Usage:
  python3 tools/make_backdrop.py assets/build/backdrop_sand.jpg
"""
import json
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

OUT = sys.argv[1]
SEED = 7
SCALE = 0.75  # image px per world px
# the map's screen rectangle (src/render/iso.ts mapBounds for 46 x 30, top margin 80) plus 2 x 160 px
COLS, ROWS, TOP, PAD = 46, 30, 80, 320
LEFT, RIGHT = -ROWS * 32, COLS * 32
W_WORLD, H_WORLD = RIGHT - LEFT + 2 * PAD, (COLS + ROWS) * 16 + TOP + 2 * PAD
SOURCES = ["desert_n", "desert_s", "court", "south", "tels"]
PATCH = 220  # source px (painting px, 2x world)

rng = np.random.default_rng(SEED)


def load(name):
    im = np.asarray(Image.open(f"assets/build/{name}/{name}_day.jpg").convert("RGB")).astype(np.float32)
    meta = json.load(open(f"assets/build/{name}/{name}.json"))
    return im, meta


def clean_patches():
    """Open sand windows: low structure (few strong edges), sand coloured, not too dark."""
    out = []
    for name in SOURCES:
        im, _ = load(name)
        g = ndimage.gaussian_gradient_magnitude(im.mean(2), 1.5)
        H, W = g.shape
        for _ in range(900):
            y, x = rng.integers(0, H - PATCH), rng.integers(0, W - PATCH)
            win = im[y : y + PATCH, x : x + PATCH]
            gw = g[y : y + PATCH, x : x + PATCH]
            mean = win.reshape(-1, 3).mean(0)
            sat = mean.max() - mean.min()
            if np.percentile(gw, 99) < 9 and 150 < mean.mean() < 215 and sat < 26:
                out.append(win)
            if len(out) > 60 * (SOURCES.index(name) + 1):
                break
    if len(out) < 40:
        sys.exit(f"only {len(out)} clean sand patches found")
    return out


def edge_sand_colour():
    """The paintings' sand right at the map border (the backdrop must continue it)."""
    vals = []
    for name in ["desert_n", "desert_s"]:
        im, m = load(name)
        ox, oy = m["origin_px"]
        ss = m["supersample"]
        for t in np.linspace(0.5, ROWS - 0.5, 40):
            for (tx, ty) in ((-0.3, t), (t * 0.4, -0.3)):
                px, py = ox + (tx - ty) * 32 * ss, oy + (tx + ty) * 16 * ss
                if 8 <= px < im.shape[1] - 8 and 8 <= py < im.shape[0] - 8:
                    vals.append(im[int(py) - 6 : int(py) + 6, int(px) - 6 : int(px) + 6].reshape(-1, 3).mean(0))
    return np.median(np.array(vals), 0), m["night_tint"]


patches = clean_patches()
target, tint = edge_sand_colour()
W, H = int(W_WORLD * SCALE), int(H_WORLD * SCALE)
size = int(PATCH / 2 * SCALE * 1.0)  # painting px are 2x world px
acc = np.zeros((H, W, 3), np.float32)
wsum = np.zeros((H, W), np.float32)
yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
r = np.hypot(xx - size / 2, yy - size / 2) / (size / 2)
blob = np.clip(1 - r, 0, 1) ** 1.2  # soft round edge
step = size * 0.45
for gy in np.arange(-size / 2, H, step):
    for gx in np.arange(-size / 2, W, step):
        p = patches[rng.integers(len(patches))]
        p = np.asarray(Image.fromarray(p.astype(np.uint8)).resize((size, size), Image.LANCZOS)).astype(np.float32)
        if rng.random() < 0.5:
            p = p[:, ::-1]
        p = p * (target / p.reshape(-1, 3).mean(0))  # every patch on the edge sand's colour
        x0 = int(gx + rng.uniform(-step / 2, step / 2))
        y0 = int(gy + rng.uniform(-step / 2, step / 2))
        xa, ya, xb, yb = max(0, x0), max(0, y0), min(W, x0 + size), min(H, y0 + size)
        if xa >= xb or ya >= yb:
            continue
        b = blob[ya - y0 : yb - y0, xa - x0 : xb - x0]
        acc[ya:yb, xa:xb] += p[ya - y0 : yb - y0, xa - x0 : xb - x0] * b[..., None]
        wsum[ya:yb, xa:xb] += b
img = acc / np.maximum(wsum, 1e-3)[..., None]
# broad, gentle light/dark variation: no two places look alike from far away
noise = ndimage.gaussian_filter(rng.standard_normal((H // 8, W // 8)), 6)
noise = np.asarray(Image.fromarray(noise.astype(np.float32)).resize((W, H), Image.BICUBIC))
noise = noise / (np.abs(noise).max() + 1e-6)
img = img * (1 + 0.07 * noise[..., None])
img = img * np.array(tint, np.float32)
Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(OUT, quality=86)
print(OUT, W, H, "patches", len(patches), "edge sand", target.round(1), "scale", SCALE)
