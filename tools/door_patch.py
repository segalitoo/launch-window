"""Builds an "open" patch for a door painted in a painted area (Phase 2: the yard gate).

Usage:
  python3 tools/door_patch.py <area> <door x> <door y> <crop x0 y0 x1 y1> <input crop.png> <edited.jpg>
  python3 tools/door_patch.py yard 16 27 231 300 791 615 \
      assets/raw/gen/GATE-01_input.png assets/raw/gen/GATE-01_out_3.jpeg

How the art is made: crop the area's daylight painting around the door (the crop box is in
painting px), upscale it to 16:9 for the image model, and ask it to open the door and change
nothing else (prompt in assets/raw/prompts/gate-open.md). This script then
  1. registers the edit back onto the crop (affine ECC, the door area left out), so the
     model's small reframing does not shift anything,
  2. finds where it really changed (blurred difference near the door), closes the holes
     (convex hull) and feathers the edge,
  3. writes assets/build/<area>/<area>_door_<x>_<y>.png, an RGBA patch in painting px, and
     adds it to assets/build/<area>/<area>_doors.json (a sidecar, so cut_occluders.py
     never overwrites it).
The engine draws the patch over the daylight painting before the night grade when the
sim opens that door (src/render/paintedArea.ts).
"""

import json
import os
import sys

import cv2
import numpy as np

area = sys.argv[1]
dx, dy = int(sys.argv[2]), int(sys.argv[3])
x0, y0, x1, y1 = (int(v) for v in sys.argv[4:8])
crop_path, edit_path = sys.argv[8], sys.argv[9]
out_dir = os.path.join("assets/build", area)

meta = json.load(open(os.path.join(out_dir, f"{area}.json")))
ss = meta["supersample"]
ox, oy = -meta["origin_px"][0] / ss, -meta["origin_px"][1] / ss

src = cv2.imread(crop_path)
H, W = src.shape[:2]
k = W / (x1 - x0)  # crop px per painting px
edit = cv2.resize(cv2.imread(edit_path), (W, H), interpolation=cv2.INTER_CUBIC)

# the door tile's centre, in crop px; the box around it is where the door may change
cx = ((dx + 0.5 - (dy + 0.5)) * 32 - ox) * ss
cy = ((dx + 0.5 + dy + 0.5) * 16 - oy) * ss
gx, gy = (cx - x0) * k, (cy - y0) * k
box = np.zeros((H, W), np.uint8)
cv2.rectangle(box, (int(gx - 105 * k), int(gy - 135 * k)), (int(gx + 105 * k), int(gy + 50 * k)), 255, -1)

# 1. register (everything but the door area)
g1 = cv2.cvtColor(src, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
g2 = cv2.cvtColor(edit, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255
warp = np.eye(2, 3, dtype=np.float32)
cc, warp = cv2.findTransformECC(g1, g2, warp, cv2.MOTION_AFFINE,
                                (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-6), 255 - box, 5)
reg = cv2.warpAffine(edit, warp, (W, H), flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
e1, e2 = cv2.Canny(src, 60, 160), cv2.Canny(reg, 60, 160)
drift = cv2.distanceTransform(255 - e1, cv2.DIST_L2, 3)[(e2 > 0) & (box == 0)]
print(f"registration: ecc {cc:.4f}, edge drift outside the door median {np.median(drift) / k:.2f} px, "
      f"p90 {np.percentile(drift, 90) / k:.2f} px (painting px)")
if cc < 0.98:
    sys.exit("the edit moved too much to register; pick another variant")

# 2. what changed, near the door: closed, hulled, feathered
diff = cv2.GaussianBlur(np.abs(reg.astype(int) - src.astype(int)).mean(axis=2).astype(np.float32), (0, 0), 3)
m = ((diff > 22) & (box > 0)).astype(np.uint8) * 255
m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((25, 25), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(m)
keep = np.zeros_like(m)
for i in range(1, n):
    if st[i, 4] > 800:  # specks of repainted grit are not the door
        keep[lab == i] = 255
if not keep.any():
    sys.exit("no change found at the door")
hull = np.zeros_like(keep)
cv2.fillConvexPoly(hull, cv2.convexHull(cv2.findNonZero(keep)), 255)
hull = cv2.dilate(hull, np.ones((21, 21), np.uint8))
alpha = cv2.GaussianBlur(hull.astype(np.float32) / 255, (0, 0), 8)

# 3. back to painting px, cut to the patch's box
pw, ph = x1 - x0, y1 - y0
rgb = cv2.resize(reg, (pw, ph), interpolation=cv2.INTER_AREA)
a = cv2.resize(alpha, (pw, ph), interpolation=cv2.INTER_AREA)
ys, xs = np.nonzero(a > 1 / 255)
bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
rgba = np.dstack([rgb, (a * 255).round().astype(np.uint8)])[by0:by1, bx0:bx1]
name = f"{area}_door_{dx}_{dy}.png"
cv2.imwrite(os.path.join(out_dir, name), rgba)

side = os.path.join(out_dir, f"{area}_doors.json")
doors = json.load(open(side)) if os.path.exists(side) else []
doors = [d for d in doors if (d["x"], d["y"]) != (dx, dy)]
doors.append({"x": dx, "y": dy, "image": name, "px": int(x0 + bx0), "py": int(y0 + by0),
              "source": os.path.basename(edit_path)})
json.dump(doors, open(side, "w"), indent=2)
print(f"wrote {out_dir}/{name} ({bx1 - bx0} x {by1 - by0} at {x0 + bx0}, {y0 + by0}) and {side}")
