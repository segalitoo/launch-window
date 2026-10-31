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

Phase 4, several painted areas: --fade W N E S (tiles) clips the painting to its region
and fades it out over that many tiles at each side (0 = a hard edge, for the map border or
a side another area paints over). It writes <name>_mask.png (alpha, half size), keeps only
occluders of tiles inside the region, and drops the yard lamp's pool when the lamp is not
in the region. Where two areas meet, the one under keeps a hard edge (fade 0) a tile or two into the
other's region, and the one drawn later fades in over it, so no gap shows. --region X0 Y0 X1 Y1
sets the area's tiles when they differ from the plate's camera region.
  python3 tools/cut_occluders.py desert_s <plate.json> <plate_id.png> <painting.jpg> --fade 0 2 1 0
An area built before masks existed gets one without re-cutting:
  python3 tools/cut_occluders.py yard --mask-only --fade 2 1 1 0
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
FEATHER = 48  # the engine's faded image border, painting px (src/render/paintedArea.ts)
# With a region mask the mask does the blending and the image edge lies outside the region
# (plates rendered with --fit), so only a thin border is faded; stored in the manifest.
FEATHER_MASKED = 16
GROW_PX = 2  # mask grows 2 px at 2x (1 px at 100% zoom), so no sliver of a hidden unit shows at wall edges
PAD = 2


MAP_COLS, MAP_ROWS = 46, 30  # the mission map (maps/night-lantern.tmj)


def region_mask(manifest, fade):
    """Alpha of the painting by ground tile: 1 inside the region, fading to 0 over `fade`
    tiles (west, north, east, south) at its edges. Half size, like the light map.
    The value is in the alpha channel: the engine clips with canvas 'destination-in', which
    reads alpha only (a plain greyscale PNG is opaque everywhere and clips nothing)."""
    W, H = manifest["size"]
    ss = manifest["supersample"]
    ox, oy = manifest["origin_px"]
    x0, y0, x1, y1 = manifest["region"]
    h, w = H // 2, W // 2
    py, px = np.mgrid[0:h, 0:w].astype(np.float32)
    X = (px * 2 + 1 - ox) / ss  # screen px at 100% zoom, from tile (0, 0)'s corner
    Y = (py * 2 + 1 - oy) / ss
    tx = (X / 32 + Y / 16) / 2
    ty = (Y / 16 - X / 32) / 2
    # a side on the map's border runs one tile past it and fades out there, into the desert
    # backdrop around the map (Phase 6): the playable tiles stay fully painted
    fade = list(fade)
    if x0 == 0:
        x0, fade[0] = -1, 1
    if y0 == 0:
        y0, fade[1] = -1, 1
    if x1 == MAP_COLS - 1:
        x1, fade[2] = MAP_COLS, 1
    if y1 == MAP_ROWS - 1:
        y1, fade[3] = MAP_ROWS, 1
    a = np.ones((h, w), np.float32)
    for d, f in ((tx - x0, fade[0]), (ty - y0, fade[1]), (x1 + 1 - tx, fade[2]), (y1 + 1 - ty, fade[3])):
        a = np.minimum(a, np.clip(d / f, 0, 1) if f > 0 else (d >= 0).astype(np.float32))
    a = a * a * (3 - 2 * a)  # smoothstep: no hard line where the fade starts
    alpha = Image.fromarray((a * 255).astype(np.uint8))
    return Image.merge("LA", (Image.new("L", alpha.size, 255), alpha))


def mask_only(name, fade, region=None):
    out = os.path.join("assets/build", name)
    mp = os.path.join(out, f"{name}.json")
    manifest = json.load(open(mp))
    if region:
        manifest["region"] = region
    manifest["fade"] = fade
    region_mask(manifest, fade).save(os.path.join(out, f"{name}_mask.png"), optimize=True)
    json.dump(manifest, open(mp, "w"))
    print(f"{name}: mask written, fade {fade}")


def main():
    args = sys.argv[1:]
    fade = None
    if "--fade" in args:
        i = args.index("--fade")
        fade = [float(v) for v in args[i + 1 : i + 5]]
        del args[i : i + 5]
    region = None
    if "--region" in args:  # the area's tiles, if not the plate's camera region
        i = args.index("--region")
        region = [int(v) for v in args[i + 1 : i + 5]]
        del args[i : i + 5]
    if "--mask-only" in args:
        args.remove("--mask-only")
        return mask_only(args[0], fade, region)
    name, meta_path, id_path, paint_path = args[:4]
    out = os.path.join("assets/build", name)
    os.makedirs(out, exist_ok=True)
    plate = json.load(open(meta_path))
    if region:
        plate["region"] = region
    crop = plate["crop_16x9"]
    W, H = crop["size"]
    ss = plate["supersample"]
    origin = [plate["origin_px"][0], plate["origin_px"][1] - crop["top"]]

    if fade is not None:
        # every tile the area owns must lie inside the painting's unfaded part (the engine
        # feathers the image edge by FEATHER px): else the placeholder shows through
        x0, y0, x1, y1 = plate["region"]
        cols, rows = MAP_COLS, MAP_ROWS  # outside the map nothing is drawn
        bad = []
        for cx, cy in ((x0, y0), (x1 + 1, y0), (x1 + 1, y1 + 1), (x0, y1 + 1)):
            cx, cy = min(cx, cols), min(cy, rows)
            px = origin[0] + (cx - cy) * 32 * ss
            py = origin[1] + (cx + cy) * 16 * ss
            if not (FEATHER_MASKED <= px <= W - FEATHER_MASKED and FEATHER_MASKED <= py <= H - FEATHER_MASKED):
                bad.append((cx, cy, round(px), round(py)))
        if bad:
            sys.exit(f"{name}: region corners outside the painting's unfaded part (tile x, y, px): {bad}. Render the plate with --fit.")
    paint = Image.open(paint_path).convert("RGB").resize((W, H), Image.LANCZOS)
    paint.save(os.path.join(out, f"{name}_day.jpg"), quality=92)

    meta_for_light = dict(plate, origin_px=origin, size=[W, H])
    meta_for_light["lamp_ground_px"] = [plate["lamp_ground_px"][0], plate["lamp_ground_px"][1] - crop["top"]]
    # Lamp pools as warm colour with the pool strength in alpha. The engine fills the light
    # canvas with the night tint, draws this on top, then multiplies the painting by it.
    pool = gn.light_layer(meta_for_light, (W, H), (0.0, 0.0, 0.0))  # = warm * mask
    warm = tuple(int(min(1, c * gn.LAMP_GAIN) * 255) for c in gn.LAMP_COLOR)
    mask = pool.split()[0]  # warm red is 255, so red = mask
    rx0, ry0, rx1, ry1 = plate["region"]
    if fade is not None and not (rx0 <= 16 <= rx1 and ry0 <= 21 <= ry1):
        mask = Image.new("L", (W, H), 0)  # the yard's lamp (tile 16, 21) is not in this area
    light = Image.new("RGBA", (W, H), warm + (0,))
    light.putalpha(mask)
    light.resize((W // 2, H // 2), Image.LANCZOS).save(os.path.join(out, f"{name}_light.png"))

    ids = np.asarray(Image.open(id_path).convert("RGB")).astype(np.int32)
    ids = ids[crop["top"] : crop["top"] + H, :W]
    is_id = ids[..., 2] == 255
    key = np.where(is_id, ids[..., 0] * 256 + ids[..., 1], -1)
    tiles = sorted(int(k) for k in np.unique(key) if k >= 0)
    if fade is not None:  # only this area's own tiles get occluders
        tiles = [k for k in tiles if rx0 <= k // 256 <= rx1 and ry0 <= k % 256 <= ry1]

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
    if fade is not None:
        manifest["fade"] = fade
        manifest["feather"] = FEATHER_MASKED
        region_mask(manifest, fade).save(os.path.join(out, f"{name}_mask.png"), optimize=True)
    json.dump(manifest, open(os.path.join(out, f"{name}.json"), "w"))
    doors = os.path.join(out, f"{name}_doors.json")
    if not os.path.exists(doors):  # the engine loads the list; door_patch.py fills it
        json.dump([], open(doors, "w"))
    print(f"{name}: {len(frames)} occluder tiles, atlas {ATLAS_W}x{atlas_h}, image {W}x{H}")


if __name__ == "__main__":
    main()
