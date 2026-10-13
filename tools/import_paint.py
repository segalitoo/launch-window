"""Brings a painted image back onto the iso grid of the plate it was painted over.

Scales the painting to the plate's 16:9 crop size and writes a sidecar JSON with
the grid origin, so tools/grade_night.py and the game can place it to the pixel.

Usage: python3 tools/import_paint.py <plate.json> <painted.jpg> [...]
Writes <painted>_day.png and <painted>.json next to each painting.
"""
import json
import sys

from PIL import Image

meta_path, *paths = sys.argv[1:]
plate = json.load(open(meta_path))
crop = plate["crop_16x9"]
for p in paths:
    stem = p.rsplit(".", 1)[0]
    img = Image.open(p).convert("RGB").resize(tuple(crop["size"]), Image.LANCZOS)
    img.save(stem + "_day.png")
    m = dict(plate)
    m.pop("crop_16x9")
    m["size"] = crop["size"]
    m["origin_px"] = [plate["origin_px"][0], plate["origin_px"][1] - crop["top"]]
    for k in ("lamp_px", "lamp_ground_px"):
        m[k] = [plate[k][0], plate[k][1] - crop["top"]]
    m["source"] = p.split("/")[-1]
    json.dump(m, open(stem + ".json", "w"), indent=2)
    print("wrote", stem + "_day.png")
