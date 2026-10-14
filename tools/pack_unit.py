"""Packs a unit's rendered frames (tools/blender/render_unit.py) into atlas pages.

Usage: python3 tools/pack_unit.py yoav
Reads assets/raw/units/<unit>/ and writes assets/build/units/<unit>.json plus
<unit>-0.png, <unit>-1.png ... (as many 2048 px pages as the frames need; PLAN.md:
phone performance caps a texture at 2048).

The JSON is Phaser's multi-atlas format, so the game loads it with load.multiatlas()
and every frame is found by name, whatever page it sits on.
Frames are trimmed to their visible pixels (most of a frame is empty air); Phaser
puts the trimmed part back at its place in the full frame, so the anchor still holds.
Frame names: <anim>_d<dir>_f<frame>. `meta.unit` carries the anchor (where the feet
are, in 1x px of the full frame), the supersample, and the frame count per animation.
"""

import json
import os
import sys

from PIL import Image

PAGE = 2048
PAD = 2  # transparent gap between frames, so filtering never bleeds a neighbour in

unit = sys.argv[1] if len(sys.argv) > 1 else "yoav"
src = os.path.join("assets/raw/units", unit)
out = "assets/build/units"
meta = json.load(open(os.path.join(src, "meta.json")))
ss = meta["supersample"]
fw, fh = meta["frame"][0] * ss, meta["frame"][1] * ss
anims = meta["anims"]
dirs = meta["dirs"]

# load and trim
items = []
for a in anims:
    for d in range(dirs):
        for f in range(anims[a]):
            name = f"{a}_d{d}_f{f}"
            im = Image.open(os.path.join(src, name + ".png")).convert("RGBA")
            if im.size != (fw, fh):
                sys.exit(f"{name} is {im.size}, expected {(fw, fh)}")
            box = im.getchannel("A").getbbox() or (0, 0, 1, 1)
            items.append((name, im.crop(box), box))

# shelf packing, tallest first; a new page when the current one is full
items.sort(key=lambda it: (-it[1].height, it[0]))
pages = [[]]
x = y = shelf = 0
for name, im, box in items:
    w, h = im.width + PAD, im.height + PAD
    if x + w > PAGE:
        x, y, shelf = 0, y + shelf, 0
    if y + h > PAGE:
        pages.append([])
        x = y = shelf = 0
    pages[-1].append((name, im, box, x, y))
    x += w
    shelf = max(shelf, h)

os.makedirs(out, exist_ok=True)
for old in os.listdir(out):  # drop pages left over from a bigger earlier pack
    if old.startswith(f"{unit}-") and old.endswith(".png"):
        os.remove(os.path.join(out, old))
textures = []
for i, page in enumerate(pages):
    W = max(px + im.width for _, im, _, px, _ in page)
    H = max(py + im.height for _, im, _, _, py in page)
    sheet = Image.new("RGBA", (W, H))
    frames = []
    for name, im, (bx, by, bx1, by1), px, py in page:
        sheet.paste(im, (px, py))
        frames.append({
            "filename": name,
            "rotated": False,
            "trimmed": True,
            "sourceSize": {"w": fw, "h": fh},
            "spriteSourceSize": {"x": bx, "y": by, "w": bx1 - bx, "h": by1 - by},
            "frame": {"x": px, "y": py, "w": bx1 - bx, "h": by1 - by},
        })
    image = f"{unit}-{i}.png"
    sheet.save(os.path.join(out, image), optimize=True)
    textures.append({"image": image, "format": "RGBA8888", "size": {"w": W, "h": H}, "scale": 1, "frames": frames})
    print(f"page {i}: {W} x {H}, {len(frames)} frames")

doc = {
    "textures": textures,
    "meta": {"unit": {"anchor": meta["anchor"], "frame": meta["frame"], "supersample": ss, "anims": anims, "dirs": dirs,
                      "sources": meta.get("sources", {})}},
}
with open(os.path.join(out, f"{unit}.json"), "w") as fh_:
    json.dump(doc, fh_, separators=(",", ":"))
for stale in (f"{unit}.png",):  # the single-page atlas from before trimming
    if os.path.exists(os.path.join(out, stale)):
        os.remove(os.path.join(out, stale))
print(f"wrote {out}/{unit}.json: {len(items)} frames on {len(pages)} page(s)")
