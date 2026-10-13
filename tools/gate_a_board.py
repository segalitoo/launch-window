"""Builds the Gate A board: what Ran approves at Gate A (palette, light direction,
character scale), shown on the real style frame.

Usage: python3 tools/gate_a_board.py
Reads the graded style frame and the chosen turnarounds from assets/raw/gen/,
writes assets/raw/gen/GATE-A_board.png.
"""
import json
import math
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(__file__))
import grade_night as gn  # noqa: E402

GEN = "assets/raw/gen"
UNIT_NIGHT = (0.62, 0.68, 0.82)
SQUAD = [
    # name, turnaround, height in cm, sim position near the yard gate, squad colour
    ("Yoav", "CH-03_yoav_idf_helmet_1.jpg", 180, (16.6, 28.4), (108, 196, 255)),
    ("Noa", "CH-05_noa_3.jpg", 168, (15.3, 28.7), (142, 240, 208)),
    ("Itai", "CH-06_itai_2.jpg", 188, (17.9, 28.8), (201, 184, 255)),
]
PX_PER_CM = 44 / 180  # 1.8 m = 44 px at 100% zoom
INK = (236, 228, 211)
MUTED = (141, 152, 155)
BG = (18, 20, 21)
FONT = "/System/Library/Fonts/Helvetica.ttc"


def font(size):
    return ImageFont.truetype(FONT, size)


def cut_front(path):
    # reuse the figure cutter from the scale test
    src = open(os.path.join(os.path.dirname(__file__), "char_scale_test.py")).read().replace("\nmain()\n", "\n")
    ns = {}
    exec(compile(src, "char_scale_test", "exec"), ns)
    return ns["cut_figures"](path)


def tint(fig, t):
    r, g, b, a = fig.split()
    return Image.merge("RGBA", (r.point(lambda v: v * t[0]), g.point(lambda v: v * t[1]), b.point(lambda v: v * t[2]), a))


def scene_with_squad(base, meta, md, hud=True):
    ss = meta["supersample"]
    img = base.convert("RGBA")
    if hud:
        img = gn.draw_hud(meta, md, img.convert("RGB")).convert("RGBA")
    placed = []
    for name, sheet, cm, (sx, sy), col in SQUAD:
        fig = cut_front(os.path.join(GEN, sheet))
        h = round(cm * PX_PER_CM * ss)
        fig = fig.resize((round(fig.width * h / fig.height), h), Image.LANCZOS)
        placed.append((sx + sy, name, fig, sx, sy, col))
    for _, name, fig, sx, sy, col in sorted(placed):  # depth order: front-most last
        fx, fy = gn.to_px(meta, sx, sy)
        sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).ellipse((fx - 8 * ss, fy - 4 * ss, fx + 14 * ss, fy + 4 * ss), fill=(0, 0, 0, 110))
        img = Image.alpha_composite(img, sh)
        g = tint(fig, UNIT_NIGHT)
        img.alpha_composite(g, (int(fx - g.width / 2), int(fy - g.height + 2 * ss)))
    return img.convert("RGB")


def opaque_strip(fig):
    """Only the figure's own pixels, as a 1-row image, so transparency never enters the palette."""
    px = [p[:3] for p in fig.getdata() if p[3] > 220]
    strip = Image.new("RGB", (len(px), 1))
    strip.putdata(px)
    return strip


def palette(img, n=8):
    q = img.convert("RGB")
    if q.width * q.height > 400_000:
        q = q.resize((384, 216))
    q = q.quantize(colors=n, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[: n * 3]
    counts = sorted(q.getcolors(), reverse=True)
    cols = [tuple(pal[i * 3 : i * 3 + 3]) for _, i in counts]
    return sorted(cols, key=lambda c: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2])


def swatch_row(d, x, y, cols, label, w=56, h=40):
    d.text((x, y), label, font=font(16), fill=MUTED)
    y += 24
    for i, c in enumerate(cols):
        d.rectangle((x + i * (w + 6), y, x + i * (w + 6) + w, y + h), fill=c)
        d.text((x + i * (w + 6), y + h + 4), "#%02x%02x%02x" % c, font=font(11), fill=MUTED)
    return y + h + 24


def light_diagram(size=300):
    im = Image.new("RGB", (size, size), (34, 38, 40))
    d = ImageDraw.Draw(im)
    cx, cy, s, hgt = size * 0.55, size * 0.62, 46, 60
    # shadow falls right and slightly down
    d.polygon([(cx, cy - s / 2), (cx + s, cy), (cx + s + 70, cy + 18), (cx + 70, cy - s / 2 + 18)], fill=(20, 22, 24))
    top = [(cx, cy - s / 2 - hgt), (cx + s, cy - hgt), (cx, cy + s / 2 - hgt), (cx - s, cy - hgt)]
    left = [(cx - s, cy - hgt), (cx, cy + s / 2 - hgt), (cx, cy + s / 2), (cx - s, cy)]
    right = [(cx, cy + s / 2 - hgt), (cx + s, cy - hgt), (cx + s, cy), (cx, cy + s / 2)]
    d.polygon(left, fill=(128, 130, 126))
    d.polygon(right, fill=(92, 94, 92))
    d.polygon(top, fill=(176, 178, 172))
    # sun arrow from the top left
    ax, ay = 26, 26
    bx, by = cx - s * 0.6, cy - hgt - 16
    d.line((ax, ay, bx, by), fill=(255, 214, 140), width=4)
    ang = math.atan2(by - ay, bx - ax)
    for da in (2.6, -2.6):
        d.line((bx, by, bx + 14 * math.cos(ang + da), by + 14 * math.sin(ang + da)), fill=(255, 214, 140), width=4)
    d.ellipse((ax - 12, ay - 12, ax + 12, ay + 12), fill=(255, 214, 140))
    d.text((12, size - 46), "Sun from the top left, 48 degrees up.", font=font(13), fill=INK)
    d.text((12, size - 26), "Shadows fall right and slightly down.", font=font(13), fill=INK)
    return im


def scale_diagram(figs, w=560, h=300, k=2):
    """Tile, wall, crate and the three operators at k times 100% zoom."""
    im = Image.new("RGB", (w, h), (34, 38, 40))
    d = ImageDraw.Draw(im)
    base = h - 70
    x = 20
    # one tile: 64 x 32 px
    tw, th = 64 * k, 32 * k
    d.polygon([(x, base), (x + tw / 2, base - th / 2), (x + tw, base), (x + tw / 2, base + th / 2)], outline=INK, width=2)
    d.text((x + 6, base + th / 2 + 6), "1 tile = 64 x 32 px", font=font(12), fill=MUTED)
    # wall 2.0 m and crate 1.2 m (px at 100% = m * 0.866 * 28.28)
    x0 = x + tw + 24
    for label, m, col in (("wall 2.0 m", 2.0, (150, 152, 146)), ("crate 1.2 m", 1.2, (140, 105, 70))):
        ph = m * 0.866 * 28.28 * k
        d.rectangle((x0, base - ph, x0 + 30, base), fill=col)
        d.text((x0 - 6, base + 6), label, font=font(12), fill=MUTED)
        x0 += 90
    x = x0 + 10
    for name, fig, col in figs:
        fh = round(fig.height * k)
        f = fig.resize((round(fig.width * k), fh), Image.NEAREST)
        im.paste(f, (int(x), int(base - fh)), f)
        d.text((x, base + 6), f"{name} {fig.height} px", font=font(12), fill=col)
        x += max(f.width, 64) + 18
    return im


def main():
    meta = json.load(open(f"{GEN}/SF-01_yard_paint_1.json"))
    md = json.load(open("assets/raw/blockout/map.json"))
    day = Image.open(f"{GEN}/SF-01_yard_paint_1_day.png").convert("RGB")
    night = ImageChops.multiply(day, gn.light_layer(meta, day.size, gn.NIGHT["B"]))
    night = gn.lamp_glow(meta, night)

    hero = scene_with_squad(night, meta, md, hud=True)  # 2x supersampled = 200% zoom
    at100 = hero.resize((hero.width // 2, hero.height // 2), Image.LANCZOS)
    day_squad = scene_with_squad(day, meta, md, hud=False).resize((hero.width // 2, hero.height // 2), Image.LANCZOS)

    W = hero.width + 64
    board = Image.new("RGB", (W, 2420), BG)
    d = ImageDraw.Draw(board)
    y = 28
    d.text((32, y), "Launch Window  ·  Gate A", font=font(40), fill=INK)
    y += 56
    d.text((32, y), "Approve three things: palette, light direction, character scale. Generator yard, look B, moonlit night grade.", font=font(18), fill=MUTED)
    y += 44

    d.text((32, y), "In game at 200% zoom: painted yard (SF-01 #1), night grade, lamp light, the squad at the gate, guard cone and selection ring", font=font(16), fill=INK)
    y += 26
    board.paste(hero, (32, y))
    y += hero.height + 28

    half = (W - 32 * 3) // 2
    d.text((32, y), "100% zoom: the real game size. Figures 41 to 46 px.", font=font(16), fill=INK)
    d.text((32 * 2 + half, y), "Daylight paint: the base the night grade is applied to", font=font(16), fill=INK)
    y += 26
    board.paste(at100.resize((half, round(at100.height * half / at100.width)), Image.LANCZOS), (32, y))
    board.paste(day_squad.resize((half, round(day_squad.height * half / day_squad.width)), Image.LANCZOS), (32 * 2 + half, y))
    y += round(at100.height * half / at100.width) + 36

    # palette
    d.text((32, y), "Palette", font=font(24), fill=INK)
    y += 38
    env_day = palette(day)
    env_night = palette(night)
    yy = swatch_row(d, 32, y, env_day, "Environment, daylight paint (taken from SF-01 #1)")
    yy = swatch_row(d, 32, yy, env_night, "Environment, after the moonlit grade (0.36, 0.43, 0.60)")
    squad_fig = cut_front(f"{GEN}/{SQUAD[0][1]}")
    yy = swatch_row(d, 32, yy, palette(opaque_strip(tint(squad_fig, UNIT_NIGHT)), 6), "Operators, after the lighter unit grade (0.62, 0.68, 0.82)")
    overlay = [(255, 181, 71), (255, 81, 72), (108, 196, 255), (142, 240, 208), (201, 184, 255), (127, 220, 149)]
    yy = swatch_row(d, 32, yy, overlay, "Overlay, flat on top of the art: cone, alarm, Yoav, Noa, Itai, objective")

    # light + scale diagrams to the right of the palette
    lx = 32 + 8 * 62 + 40
    d.text((lx, y - 38), "Light direction", font=font(24), fill=INK)
    board.paste(light_diagram(300), (lx, y))
    sx = lx + 300 + 24
    d.text((sx, y - 38), "Scale (shown at 2x)", font=font(24), fill=INK)
    figs = []
    for name, sheet, cm, _, col in SQUAD:
        f = cut_front(f"{GEN}/{sheet}")
        hpx = round(cm * PX_PER_CM)
        figs.append((name, tint(f, UNIT_NIGHT).resize((round(f.width * hpx / f.height), hpx), Image.LANCZOS), col))
    board.paste(scale_diagram(figs, w=W - sx - 32, h=300), (sx, y))
    y = max(yy, y + 320) + 12

    d.text((32, y), "Decided so far", font=font(24), fill=INK)
    y += 38
    lines = [
        "Look B, Moonlit steel. Walls 2.0 m. One tile = 1.6 m. Camera fixed, 2:1, sun from the top left.",
        "Night: environment x (0.36, 0.43, 0.60); operators get a lighter grade x (0.62, 0.68, 0.82) so they never vanish.",
        "Squad: Israeli commandos in solid olive, helmets for all. Told apart by role gear above the shoulders, plus squad-colour tape on the helmet.",
        "Still to come: Ran's paint-over of this frame, then 3D models and 8-direction sprites (Phase 2).",
    ]
    for ln in lines:
        d.text((32, y), ln, font=font(16), fill=MUTED)
        y += 26
    board = board.crop((0, 0, W, y + 28))
    board.save(f"{GEN}/GATE-A_board.png")
    print("wrote", f"{GEN}/GATE-A_board.png", board.size)


main()
