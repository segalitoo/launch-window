"""Turns a painted area into what the game loads: ground image, occluder masks, light map.

Inputs (all aligned to the same iso camera):
  - the plate sidecar JSON (grid origin, supersample, 16:9 crop)
  - the Blender tile-ID pass of the same plate (R = tile x, G = tile y, B = 255)
  - the approved painting (any size, 16:9)
Outputs in assets/build/<name>/:
  - <name>_day.jpg       the painting at the plate's 16:9 size, neutral daylight
  - <name>_light.png     light map for the night grade (ambient tint plus lamp pools), half size
  - <name>_occ.png       atlas of occluder masks (white, alpha = mask), at most 2048 px wide
  - <name>.json          grid origin, scale and one frame per blocking tile

Usage:
  python3 tools/cut_occluders.py yard assets/raw/blockout/yard_B_plate.json \
      assets/raw/blockout/yard_B_plate_id.png assets/raw/gen/SF-01_yard_paint_1_2k.jpg
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
import grade_night as gn  # noqa: E402

ATLAS_W = 2048
GROW_PX = 2  # mask grows 2 px at 2x (1 px at 100% zoom), so no sliver of a hidden unit shows at wall edges
PAD = 2


def main():
    name, meta_path, id_path, paint_path = sys.argv[1:5]
    out = os.path.join("assets/build", name)
    os.makedirs(out, exist_ok=True)
    plate = json.load(open(meta_path))
    crop = plate["crop_16x9"]
    W, H = crop["size"]
    ss = plate["supersample"]
    origin = [plate["origin_px"][0], plate["origin_px"][1] - crop["top"]]

    paint = Image.open(paint_path).convert("RGB").resize((W, H), Image.LANCZOS)
    paint.save(os.path.join(out, f"{name}_day.jpg"), quality=92)

    meta_for_light = dict(plate, origin_px=origin, size=[W, H])
    meta_for_light["lamp_ground_px"] = [plate["lamp_ground_px"][0], plate["lamp_ground_px"][1] - crop["top"]]
    # Lamp pools as warm colour with the pool strength in alpha. The engine fills the light
    # canvas with the night tint, draws this on top, then multiplies the painting by it.
    pool = gn.light_layer(meta_for_light, (W, H), (0.0, 0.0, 0.0))  # = warm * mask
    warm = tuple(int(min(1, c * gn.LAMP_GAIN) * 255) for c in gn.LAMP_COLOR)
    mask = pool.split()[0]  # warm red is 255, so red = mask
    light = Image.new("RGBA", (W, H), warm + (0,))
    light.putalpha(mask)
    light.resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(out, f"{name}_light.png"))

    ids = np.asarray(Image.open(id_path).convert("RGB")).astype(np.int32)
    ids = ids[crop["top"] : crop["top"] + H, :W]
    is_id = ids[..., 2] == 255
    key = np.where(is_id, ids[..., 0] * 256 + ids[..., 1], -1)
    tiles = sorted(int(k) for k in np.unique(key) if k >= 0)

    frames = []
    masks = []
    for k in tiles:
        tx, ty = k // 256, k % 256
        m = key == k
        m = ndimage.binary_dilation(m, iterations=GROW_PX)
        ys, xs = np.where(m)
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
        masks.append(m[y0:y1, x0:x1])
        frames.append({"x": tx, "y": ty, "sx": int(x0), "sy": int(y0), "w": int(x1 - x0), "h": int(y1 - y0)})

    # shelf packing, tallest first
    order = sorted(range(len(frames)), key=lambda i: -frames[i]["h"])
    cx = cy = shelf = 0
    for i in order:
        f = frames[i]
        if cx + f["w"] + PAD > ATLAS_W:
            cx, cy, shelf = 0, cy + shelf + PAD, 0
        f["ax"], f["ay"] = cx, cy
        cx += f["w"] + PAD
        shelf = max(shelf, f["h"])
    atlas_h = cy + shelf
    alpha = np.zeros((atlas_h, ATLAS_W), np.uint8)
    for f, m in zip(frames, masks):
        alpha[f["ay"] : f["ay"] + f["h"], f["ax"] : f["ax"] + f["w"]] = m * 255
    atlas = Image.new("RGBA", (ATLAS_W, atlas_h), (255, 255, 255, 0))
    atlas.putalpha(Image.fromarray(alpha))
    atlas.save(os.path.join(out, f"{name}_occ.png"), optimize=True)

    manifest = {
        "name": name,
        "size": [W, H],
        "supersample": ss,
        "origin_px": origin,  # pixel of sim tile corner (0, 0) in the image
        "region": plate["region"],
        "light_scale": 2,
        "night_tint": list(gn.NIGHT["B"]),
        "unit_tint": [0.62, 0.68, 0.82],
        "frames": frames,
    }
    json.dump(manifest, open(os.path.join(out, f"{name}.json"), "w"))
    print(f"{name}: {len(frames)} occluder tiles, atlas {ATLAS_W}x{atlas_h}, image {W}x{H}")


main()
