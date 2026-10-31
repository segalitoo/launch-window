"""Builds the desert drawn around the playable map (Phase 6, Ran: no black around the map, no
visibly repeating tile, and as crisp and detailed as the paintings next to it).

One large image, not a tile. It is a patchwork of open-ground patches taken from the approved
paintings, so it carries their own pebbles, scrub, tyre tracks and grain:

- Patches may hold small dark details (stones, scrub, tracks) but no structures: a patch is
  rejected when much of it differs from the painting's sand colour, or when any one region of
  it does (a wall, a road, a shadow).
- Each pixel takes its colour from the nearest patch centre; patches only blend across a narrow
  seam, so detail is not averaged away (an earlier version blended 4 to 5 soft patches at every
  point and came out as grey haze).
- Each patch is flipped at random and matched to the colour of the paintings' sand at the map
  edge; a broad, gentle light/dark variation goes on top; the night tint is baked in (the engine
  grades the paintings with the same tint).

The image covers the map's screen rectangle plus the camera's pan margin, one image px per
world px, and is drawn under everything (src/render/MapScene.ts).

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
# the map's screen rectangle (src/render/iso.ts mapBounds for 46 x 30, top margin 80) plus 2 x 160 px
COLS, ROWS, TOP, PAD = 46, 30, 80, 320
W = (COLS + ROWS) * 32 + 2 * PAD
H = (COLS + ROWS) * 16 + TOP + 2 * PAD
SOURCES = ["desert_n", "desert_s", "court", "south", "tels"]
CELL = 120  # world px between patch centres
PATCH = 2 * CELL + 80  # world px; covers the farthest point of its cell plus the seam (painting px are 2 x world px)
SEAM = 18  # world px over which two neighbouring patches blend
# never sample the landing zone's rotor-wash rings: they are one place and the eye spots a repeat
AVOID = {"desert_s": (200, 520, 1000, 1000)}  # painting px: x0, y0, x1, y1
# scrub and brush cut from the paintings (painting px), scattered over the patchwork as stamps;
# the patches alone have stones and tracks but nothing larger to catch the eye from far away
STAMPS = [
    ("desert_n", 520, 590, 850, 800, 2),  # bush cluster (big, so rare)
    ("desert_s", 1070, 5, 1200, 110, 10),  # grass tuft
    ("desert_s", 1715, 360, 1800, 450, 10),  # tuft
    ("desert_s", 0, 770, 170, 910, 8),  # dry brush
    ("desert_s", 200, 620, 300, 700, 10),  # dry tuft
]

rng = np.random.default_rng(SEED)


def load(name):
    im = np.asarray(Image.open(f"assets/build/{name}/{name}_day.jpg").convert("RGB")).astype(np.float32)
    meta = json.load(open(f"assets/build/{name}/{name}.json"))
    return im, meta


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


def ground_patches(sand):
    """Plain sand windows: grain only, no strong edges (details are scattered separately)."""
    out = []
    size = PATCH * 2  # in painting px
    for name in SOURCES:
        im, _ = load(name)
        g = ndimage.gaussian_gradient_magnitude(im.mean(2), 1.5)
        H0, W0 = g.shape
        found = 0
        for _ in range(3000):
            y, x = rng.integers(0, H0 - size), rng.integers(0, W0 - size)
            win = im[y : y + size, x : x + size]
            if np.percentile(g[y : y + size, x : x + size], 99) > 9:
                continue
            if abs(win.reshape(-1, 3).mean(0) - sand).max() > 22:
                continue
            out.append(win)
            found += 1
            if found >= 60:
                break
        print(name, found, "sand patches")
    if len(out) < 30:
        sys.exit(f"only {len(out)} sand patches found")
    return out


def pebbles(sand):
    """Every small dark stone lying alone on sand in the desert paintings, cut out one by one."""
    lum0 = sand.mean()
    out = []
    for name in ["desert_n", "desert_s", "tels", "south"]:
        im, _ = load(name)
        lum = im.mean(2)
        dark = lum < lum0 - 45
        sandy = np.abs(im - sand).max(2) < 30
        lab, n = ndimage.label(dark)
        for i, sl in enumerate(ndimage.find_objects(lab)):
            h, w = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            area = (lab[sl] == i + 1).sum()
            if not (4 <= area <= 160 and h <= 18 and w <= 22):
                continue
            y0, y1 = max(0, sl[0].start - 4), sl[0].stop + 4
            x0, x1 = max(0, sl[1].start - 4), sl[1].stop + 4
            if sandy[y0:y1, x0:x1].mean() < 0.55:  # not alone on sand: part of a wall, a crate, a track
                continue
            win = im[y0:y1, x0:x1]
            a = np.clip((lum0 - win.mean(2) - 12) / 40, 0, 1)
            a = np.maximum(a, ndimage.gaussian_filter(a, 1.0))
            out.append((win, a))
        print(name, "stones so far", len(out))
    return out


target, tint = edge_sand_colour()
patches = ground_patches(target)

# patch centres on a jittered grid; every pixel belongs to its nearest centre (a Voronoi
# patchwork), with a soft blend only within SEAM px of a border
gy, gx = np.mgrid[-1 : H // CELL + 2, -1 : W // CELL + 2]
cy = (gy * CELL + rng.uniform(-0.35, 0.35, gy.shape) * CELL).ravel()
cx = (gx * CELL + rng.uniform(-0.35, 0.35, gx.shape) * CELL).ravel()
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
best = np.full((H, W), np.inf, np.float32)
second = np.full((H, W), np.inf, np.float32)
acc = np.zeros((H, W, 3), np.float32)
wsum = np.zeros((H, W), np.float32)
# pass 1: nearest and second-nearest distance at every pixel
for i in range(len(cx)):
    x0, x1 = max(0, int(cx[i] - PATCH)), min(W, int(cx[i] + PATCH))
    y0, y1 = max(0, int(cy[i] - PATCH)), min(H, int(cy[i] + PATCH))
    if x0 >= x1 or y0 >= y1:
        continue
    d = np.hypot(xx[y0:y1, x0:x1] - cx[i], yy[y0:y1, x0:x1] - cy[i])
    b, s = best[y0:y1, x0:x1], second[y0:y1, x0:x1]
    second[y0:y1, x0:x1] = np.where(d < b, b, np.minimum(s, d))
    best[y0:y1, x0:x1] = np.minimum(b, d)
# pass 2: each patch weighs 1 inside its own cell, falling to 0 over the seam into the next
for i in range(len(cx)):
    half = PATCH // 2
    x0, x1 = int(cx[i]) - half, int(cx[i]) - half + PATCH
    y0, y1 = int(cy[i]) - half, int(cy[i]) - half + PATCH
    xa, ya, xb, yb = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    if xa >= xb or ya >= yb:
        continue
    d = np.hypot(xx[ya:yb, xa:xb] - cx[i], yy[ya:yb, xa:xb] - cy[i])
    w = np.clip(0.5 + (best[ya:yb, xa:xb] + SEAM - d) / (2 * SEAM), 0, 1)
    if not w.any():
        continue
    p = patches[rng.integers(len(patches))]
    p = np.asarray(Image.fromarray(p.astype(np.uint8)).resize((PATCH, PATCH), Image.LANCZOS)).astype(np.float32)
    if rng.random() < 0.5:
        p = p[:, ::-1]
    p = p * (target / np.median(p.reshape(-1, 3), 0))  # every patch on the edge sand's colour
    acc[ya:yb, xa:xb] += p[ya - y0 : yb - y0, xa - x0 : xb - x0] * w[..., None]
    wsum[ya:yb, xa:xb] += w
img = acc / np.maximum(wsum, 1e-3)[..., None]


def cut_stamp(name, x0, y0, x1, y1):
    """A plant and its shadow off the sand around it: alpha where it differs from the sand."""
    im, _ = load(name)
    win = im[y0:y1, x0:x1]
    edge = np.concatenate([win[0], win[-1], win[:, 0], win[:, -1]])
    sand = np.median(edge, 0)
    a = ndimage.binary_dilation(np.abs(win - sand).max(2) > 22, iterations=2)
    a = ndimage.gaussian_filter(a.astype(np.float32), 1.5)
    return win * (target / sand), np.clip(a * 1.2, 0, 1)


stones = pebbles(target)


def put(rgb, al, x, y):
    h, w = al.shape
    if x < 0 or y < 0 or x + w > W or y + h > H:
        return
    img[y : y + h, x : x + w] = img[y : y + h, x : x + w] * (1 - al[..., None]) + rgb * al[..., None]


def stone_at(x, y):
    win, a = stones[rng.integers(len(stones))]
    k = rng.uniform(0.4, 0.6)
    w, h = max(1, int(win.shape[1] * k)), max(1, int(win.shape[0] * k))
    r = np.asarray(Image.fromarray(np.clip(win, 0, 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)).astype(np.float32)
    al = np.asarray(Image.fromarray((a * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)).astype(np.float32) / 255
    if rng.random() < 0.5:
        r, al = r[:, ::-1], al[:, ::-1]
    put(r, al, int(x), int(y))


# drifts: stones gather in loose, elongated patches the way the painter placed them, plus a
# thin scatter everywhere
for _ in range(230):
    cx0, cy0 = rng.uniform(0, W), rng.uniform(0, H)
    ang = rng.uniform(0, np.pi)
    sx, sy = rng.uniform(30, 110), rng.uniform(12, 40)
    for _ in range(int(rng.uniform(12, 70))):
        u, v = rng.normal(0, sx), rng.normal(0, sy)
        stone_at(cx0 + u * np.cos(ang) - v * np.sin(ang), cy0 + (u * np.sin(ang) + v * np.cos(ang)) * 0.6)
for _ in range(1500):
    stone_at(rng.uniform(0, W), rng.uniform(0, H))

for name, x0, y0, x1, y1, n in STAMPS:
    rgb, alpha = cut_stamp(name, x0, y0, x1, y1)
    for _ in range(n):
        k = rng.uniform(0.42, 0.58)  # painting px are 2 x world px, plus a little size variation
        w, h = max(2, int(rgb.shape[1] * k)), max(2, int(rgb.shape[0] * k))
        r = np.asarray(Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)).astype(np.float32)
        al = np.asarray(Image.fromarray((alpha * 255).astype(np.uint8)).resize((w, h), Image.LANCZOS)).astype(np.float32) / 255
        if rng.random() < 0.5:
            r, al = r[:, ::-1], al[:, ::-1]
        x, y = rng.integers(0, W - w), rng.integers(0, H - h)
        img[y : y + h, x : x + w] = img[y : y + h, x : x + w] * (1 - al[..., None]) + r * al[..., None]
# broad, gentle light/dark variation: no two places look alike from far away
noise = ndimage.gaussian_filter(rng.standard_normal((H // 8, W // 8)), 6)
noise = np.asarray(Image.fromarray(noise.astype(np.float32)).resize((W, H), Image.BICUBIC))
noise = noise / (np.abs(noise).max() + 1e-6)
img = img * (1 + 0.07 * noise[..., None])
img = img * np.array(tint, np.float32)
Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(OUT, quality=88)
print(OUT, W, H, "patches", len(patches), "edge sand", target.round(1))
