"""Packs a unit's rendered frames (tools/blender/render_unit.py) into one atlas.

Usage: python3 tools/pack_unit.py yoav
Reads assets/raw/units/<unit>/ and writes assets/build/units/<unit>.png and .json.

The JSON is Phaser's "JSON hash" atlas format, so the game loads it with load.atlas().
Frame names: <anim>_d<dir>_f<frame>. `meta.unit` carries the anchor (where the feet
are, in 1x px), the supersample, and the frame count per animation.
Layout: frames in reading order, as many per row as fit in 2048 px. Max 2048 x 2048
(PLAN.md: phone performance); about 290 frames at the current frame size.
"""

import json
import os
import sys

from PIL import Image

unit = sys.argv[1] if len(sys.argv) > 1 else "yoav"
src = os.path.join("assets/raw/units", unit)
out = "assets/build/units"
meta = json.load(open(os.path.join(src, "meta.json")))
ss = meta["supersample"]
fw, fh = meta["frame"][0] * ss, meta["frame"][1] * ss
anims = meta["anims"]
dirs = meta["dirs"]

names = [f"{a}_d{d}_f{f}" for a in anims for d in range(dirs) for f in range(anims[a])]
cols = min(len(names), 2048 // fw)
W, H = cols * fw, -(-len(names) // cols) * fh
if H > 2048:
    sys.exit(f"atlas {W} x {H} is over 2048 px; split it")

atlas = Image.new("RGBA", (W, H))
frames = {}
for i, name in enumerate(names):
    im = Image.open(os.path.join(src, name + ".png")).convert("RGBA")
    if im.size != (fw, fh):
        sys.exit(f"{name} is {im.size}, expected {(fw, fh)}")
    x, y = (i % cols) * fw, (i // cols) * fh
    atlas.paste(im, (x, y))
    frames[name] = {
        "frame": {"x": x, "y": y, "w": fw, "h": fh},
        "rotated": False,
        "trimmed": False,
        "spriteSourceSize": {"x": 0, "y": 0, "w": fw, "h": fh},
        "sourceSize": {"w": fw, "h": fh},
    }

os.makedirs(out, exist_ok=True)
atlas.save(os.path.join(out, f"{unit}.png"), optimize=True)
doc = {
    "frames": frames,
    "meta": {
        "image": f"{unit}.png",
        "size": {"w": W, "h": H},
        "scale": "1",
        "unit": {"anchor": meta["anchor"], "supersample": ss, "anims": anims, "dirs": dirs},
    },
}
with open(os.path.join(out, f"{unit}.json"), "w") as fh_:
    json.dump(doc, fh_, separators=(",", ":"))
print(f"wrote {out}/{unit}.png ({W} x {H}, {len(frames)} frames)")
