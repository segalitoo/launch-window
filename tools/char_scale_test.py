"""Puts character concept art at real game scale on a graded scene.

Cuts the figures out of a turnaround sheet (flat background), takes the front
view, scales it so the figure is --height px tall (about 45 px at 100% zoom),
and pastes it on a night-graded scene at a sim position. Writes a sheet with
every turnaround side by side at 1x and 2x zoom.

Usage: python3 tools/char_scale_test.py <scene_night.png> <scene.json> <out.png> <turnaround.jpg> [...]
"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage  # noqa: F401  (imported lazily below if present)

HEIGHT_PX = 44  # 1.8 m at 100% zoom (docs/visual-language.md)
NIGHT = (0.36, 0.43, 0.60)


def cut_figures(path):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.int32)
    h, w, _ = a.shape
    border = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    dist = np.abs(a - bg).sum(axis=2)
    mask = dist > 38
    mask = ndimage.binary_opening(mask, iterations=2)
    mask = ndimage.binary_closing(mask, iterations=4)
    mask = ndimage.binary_fill_holes(mask)
    lab, n = ndimage.label(mask)
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    keep = [i + 1 for i in np.argsort(sizes)[::-1][:3]]
    boxes = []
    for k in keep:
        ys, xs = np.where(lab == k)
        boxes.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1, k))
    boxes.sort(key=lambda b: b[0])  # left to right: front, side, back
    x0, y0, x1, y1, k = boxes[0]
    alpha = Image.fromarray(((lab == k) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    fig = im.copy()
    fig.putalpha(alpha)
    return fig.crop((x0, y0, x1, y1))


def grade(fig):
    r, g, b, a = fig.split()
    r = r.point(lambda v: v * NIGHT[0])
    g = g.point(lambda v: v * NIGHT[1])
    b = b.point(lambda v: v * NIGHT[2])
    return Image.merge("RGBA", (r, g, b, a))


def main():
    scene_path, meta_path, out_path, *sheets = sys.argv[1:]
    scene = Image.open(scene_path).convert("RGB")
    meta = json.load(open(meta_path))
    ss = meta["supersample"]
    ox, oy = meta["origin_px"]
    # Yoav's spot outside the yard gate, in sim tiles
    sx, sy = 16.6, 28.4
    fx, fy = ox + (sx - sy) * 32 * ss, oy + (sx + sy) * 16 * ss
    # crop around the gate at 100% zoom: 260 x 180 px
    cw, ch = 260, 180
    crop_box = (int(fx - cw * ss / 2), int(fy - ch * ss * 0.65), int(fx + cw * ss / 2), int(fy + ch * ss * 0.35))
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 15)
    tiles = []
    for p in sheets:
        fig = grade(cut_figures(p))
        th = HEIGHT_PX * ss
        tw = round(fig.width * th / fig.height)
        fig = fig.resize((tw, th), Image.LANCZOS)
        sc = scene.copy()
        shadow = Image.new("RGBA", sc.size, (0, 0, 0, 0))
        ImageDraw.Draw(shadow).ellipse((fx - 11 * ss + 3 * ss, fy - 4 * ss, fx + 11 * ss + 3 * ss, fy + 4 * ss), fill=(0, 0, 0, 110))
        sc = Image.alpha_composite(sc.convert("RGBA"), shadow)
        sc.alpha_composite(fig, (int(fx - tw / 2), int(fy - th + 2 * ss)))
        crop = sc.crop(crop_box).convert("RGB")
        at1 = crop.resize((cw, ch), Image.LANCZOS)  # 100% zoom
        at2 = at1.resize((cw * 2, ch * 2), Image.NEAREST)  # 2x zoom, pixels visible
        tile = Image.new("RGB", (cw * 3 + 24, ch * 2 + 30), (18, 20, 21))
        d = ImageDraw.Draw(tile)
        d.text((8, 6), p.split("/")[-1].rsplit(".", 1)[0] + "   (100% zoom | 2x zoom)", font=font, fill=(236, 228, 211))
        tile.paste(at1, (8, 28))
        tile.paste(at2, (cw + 16, 28))
        tiles.append(tile)
    out = Image.new("RGB", (tiles[0].width * 2 + 8, (tiles[0].height + 8) * ((len(tiles) + 1) // 2)), (18, 20, 21))
    for i, t in enumerate(tiles):
        out.paste(t, ((i % 2) * (t.width + 8), (i // 2) * (t.height + 8)))
    out.save(out_path)
    print("wrote", out_path)


main()
