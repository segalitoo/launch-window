"""Builds one "cut" patch per fence tile from an image-model edit of a whole fence run with the
mesh removed (Phase 6; prompt and inputs in assets/raw/prompts/fence-cut.md).

Usage:
  python3 tools/fence_patch.py <area> <crop x0 y0 x1 y1> <input crop.png> <edited.jpg> <tiles>
  python3 tools/fence_patch.py desert_s 1288 532 1832 838 \\
      assets/raw/gen/FENCE-01_desert_s_input.png assets/raw/gen/FENCE-01_desert_s_out_1.jpg \\
      10,16 10,17 10,18 10,19

The crop box is in painting px. The script
  1. registers the edit back onto the crop (affine ECC, as tools/door_patch.py),
  2. finds where it changed (the mesh and its shadow are gone), only near the fence run,
  3. gives every changed pixel to the fence tile nearest to it along the run, so cutting one
     tile opens only that gap,
  4. writes assets/build/<area>/<area>_door_<x>_<y>.png per tile and adds them to the door
     sidecar <area>_doors.json with "fence": true. The engine paints a patch in when its tile
     is no longer a fence (src/render/paintedArea.ts, the door patch path).
"""

import json
import os
import sys

import cv2
import numpy as np

area = sys.argv[1]
x0, y0, x1, y1 = (int(v) for v in sys.argv[2:6])
crop_path, edit_path = sys.argv[6], sys.argv[7]
tiles = [tuple(int(v) for v in t.split(",")) for t in sys.argv[8:]]
out_dir = os.path.join("assets/build", area)

meta = json.load(open(os.path.join(out_dir, f"{area}.json")))
ss = meta["supersample"]
ox, oy = -meta["origin_px"][0] / ss, -meta["origin_px"][1] / ss

src = cv2.imread(crop_path)
H, W = src.shape[:2]
k = W / (x1 - x0)  # crop px per painting px
edit = cv2.resize(cv2.imread(edit_path), (W, H), interpolation=cv2.INTER_CUBIC)

FENCE_UP = 40  # world px: the middle of the painted fence's height


def centre(tx, ty):
    """A fence tile's panel middle, in crop px."""
    sx = ((tx + 0.5) - (ty + 0.5)) * 32
    sy = ((tx + 0.5) + (ty + 0.5)) * 16 - FENCE_UP
    return ((sx - ox) * ss - x0) * k, ((sy - oy) * ss - y0) * k


cs = np.array([centre(*t) for t in tiles])
# the band along the run where the edit may change things
band = np.zeros((H, W), np.uint8)
step = np.linalg.norm(cs[1] - cs[0]) if len(cs) > 1 else 64 * ss * k
for c in cs:
    cv2.ellipse(band, (int(c[0]), int(c[1] + 10 * ss * k)), (int(step * 0.9), int(75 * ss * k)), 0, 0, 360, 255, -1)

# 1. register on everything outside the fence band
g1 = cv2.cvtColor(src, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
g2 = cv2.cvtColor(edit, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
warp = np.eye(2, 3, dtype=np.float32)
cc, warp = cv2.findTransformECC(g1, g2, warp, cv2.MOTION_AFFINE,
                                (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6), 255 - band, 5)
reg = cv2.warpAffine(edit, warp, (W, H), flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
print(f"registration: ecc {cc:.4f}")
if cc < 0.97:
    sys.exit("the edit moved too much to register; pick another variant")

# 2. what changed, in the band: closed and feathered (the mesh is thin, so close generously)
diff = cv2.GaussianBlur(np.abs(reg.astype(int) - src.astype(int)).mean(axis=2).astype(np.float32), (0, 0), 2)
m = ((diff > 14) & (band > 0)).astype(np.uint8) * 255
m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
m = cv2.dilate(m, np.ones((9, 9), np.uint8))
if not m.any():
    sys.exit("no change found along the fence")
alpha = cv2.GaussianBlur(m.astype(np.float32) / 255, (0, 0), 4)

# 3. each pixel goes to the tile nearest along the run
run = cs[-1] - cs[0]
run = run / (np.linalg.norm(run) + 1e-6)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
t = (xx - cs[0][0]) * run[0] + (yy - cs[0][1]) * run[1]
tc = (cs[:, 0] - cs[0][0]) * run[0] + (cs[:, 1] - cs[0][1]) * run[1]
owner = np.argmin(np.abs(t[..., None] - tc[None, None, :]), axis=2)

# 4. back to painting px, one patch per tile
pw, ph = x1 - x0, y1 - y0
rgb = cv2.resize(reg, (pw, ph), interpolation=cv2.INTER_AREA)
side = os.path.join(out_dir, f"{area}_doors.json")
doors = json.load(open(side)) if os.path.exists(side) else []
for i, (tx, ty) in enumerate(tiles):
    a = cv2.resize(alpha * (owner == i), (pw, ph), interpolation=cv2.INTER_AREA)
    ys, xs = np.nonzero(a > 1 / 255)
    if not len(xs):
        print(f"tile {tx},{ty}: no change, skipped")
        continue
    bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    rgba = np.dstack([rgb, (a * 255).round().astype(np.uint8)])[by0:by1, bx0:bx1]
    name = f"{area}_door_{tx}_{ty}.png"
    cv2.imwrite(os.path.join(out_dir, name), rgba)
    doors = [d for d in doors if (d["x"], d["y"]) != (tx, ty)]
    doors.append({"x": tx, "y": ty, "image": name, "px": int(x0 + bx0), "py": int(y0 + by0),
                  "fence": True, "source": os.path.basename(edit_path)})
    print(f"tile {tx},{ty}: {bx1 - bx0} x {by1 - by0} at {x0 + bx0}, {y0 + by0}")
json.dump(doors, open(side, "w"), indent=2)
print("wrote", side)
