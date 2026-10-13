"""Silhouette test for the squad: can you tell the three operators apart at game scale?

Cuts the three figures out of a lineup image (flat background), keeps their relative
heights (the tallest becomes --tallest px), and writes for each lineup:
  - flat black silhouettes on white at 1x and 3x
  - the figures with the unit night grade, standing on the night yard at 1x and 3x

Usage: python3 tools/squad_silhouette_test.py <scene_night.png> <scene.json> <out.png> <lineup.jpg> [...]
"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

TALLEST_PX = 48  # Itai, 188 cm; Yoav 180 cm lands near 44 px
UNIT_NIGHT = (0.62, 0.68, 0.82)


def cut(path, n=3):
    im = Image.open(path).convert("RGB")
    a = np.asarray(im).astype(np.int32)
    border = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    mask = np.abs(a - bg).sum(axis=2) > 38
    mask = ndimage.binary_opening(mask, iterations=2)
    mask = ndimage.binary_closing(mask, iterations=4)
    mask = ndimage.binary_fill_holes(mask)
    lab, k = ndimage.label(mask)
    sizes = ndimage.sum(mask, lab, range(1, k + 1))
    keep = [i + 1 for i in np.argsort(sizes)[::-1][:n]]
    figs = []
    for j in keep:
        ys, xs = np.where(lab == j)
        alpha = Image.fromarray(((lab == j) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
        f = im.copy()
        f.putalpha(alpha)
        figs.append((xs.min(), f.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))))
    figs.sort(key=lambda t: t[0])
    return [f for _, f in figs]


def tint(fig, t):
    r, g, b, a = fig.split()
    return Image.merge("RGBA", (r.point(lambda v: v * t[0]), g.point(lambda v: v * t[1]), b.point(lambda v: v * t[2]), a))


def main():
    scene_path, meta_path, out_path, *lineups = sys.argv[1:]
    scene = Image.open(scene_path).convert("RGBA")
    meta = json.load(open(meta_path))
    ss = meta["supersample"]
    ox, oy = meta["origin_px"]
    to_px = lambda x, y: (ox + (x - y) * 32 * ss, oy + (x + y) * 16 * ss)
    spots = [(15.6, 28.4), (16.6, 28.5), (17.6, 28.6)]  # three tiles outside the yard gate
    font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 15)
    rows = []
    for p in lineups:
        figs = cut(p)
        tallest = max(f.height for f in figs)
        scaled = [f.resize((max(1, round(f.width * TALLEST_PX * ss / tallest)), round(f.height * TALLEST_PX * ss / tallest)), Image.LANCZOS) for f in figs]
        # silhouettes at 1x
        sil = Image.new("RGB", (150, 64), (255, 255, 255))
        x = 8
        for f in scaled:
            f1 = f.resize((max(1, f.width // ss), max(1, f.height // ss)), Image.LANCZOS)
            black = Image.new("RGBA", f1.size, (0, 0, 0, 255))
            black.putalpha(f1.split()[3])
            sil.paste(black, (x, 60 - f1.height), black)
            x += f1.width + 12
        # on the night yard
        sc = scene.copy()
        for f, (sx, sy) in zip(scaled, spots):
            fx, fy = to_px(sx, sy)
            sh = Image.new("RGBA", sc.size, (0, 0, 0, 0))
            ImageDraw.Draw(sh).ellipse((fx - 8 * ss, fy - 4 * ss, fx + 14 * ss, fy + 4 * ss), fill=(0, 0, 0, 110))
            sc = Image.alpha_composite(sc, sh)
            g = tint(f, UNIT_NIGHT)
            sc.alpha_composite(g, (int(fx - g.width / 2), int(fy - g.height + 2 * ss)))
        cx, cy = to_px(16.6, 28.5)
        cw, ch = 150, 90
        yard = sc.crop((int(cx - cw * ss / 2), int(cy - ch * ss * 0.7), int(cx + cw * ss / 2), int(cy + ch * ss * 0.3))).convert("RGB").resize((cw, ch), Image.LANCZOS)
        row = Image.new("RGB", (cw * 3 + 150 * 3 + 40, ch * 3 + 30), (18, 20, 21))
        d = ImageDraw.Draw(row)
        d.text((8, 6), p.split("/")[-1].rsplit(".", 1)[0] + "   silhouettes (3x) | on the night yard (3x of 100% zoom)", font=font, fill=(236, 228, 211))
        row.paste(sil.resize((450, 192), Image.NEAREST), (8, 28 + 50))
        row.paste(yard.resize((cw * 3, ch * 3), Image.NEAREST), (150 * 3 + 24, 28))
        rows.append(row)
    out = Image.new("RGB", (rows[0].width, sum(r.height + 8 for r in rows)), (18, 20, 21))
    y = 0
    for r in rows:
        out.paste(r, (0, y))
        y += r.height + 8
    out.save(out_path)
    print("wrote", out_path)


main()
