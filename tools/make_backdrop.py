"""Builds the desert backdrop drawn around the playable map (Phase 6, Ran: no black around the map).

Takes a patch of open sand from an approved painting, makes it seamless (blends it with a copy
shifted by half its size, through a mask that is 1 in the middle and 0 at the edges), and bakes
in the area's night tint so it matches the graded paintings next to it.

Usage:
  python3 tools/make_backdrop.py assets/build/desert_n/desert_n_day.jpg 650 130 1550 500 assets/build/backdrop_sand.jpg
"""
import json
import os
import sys

import numpy as np
from PIL import Image

src, x0, y0, x1, y1, out = sys.argv[1], *map(int, sys.argv[2:6]), sys.argv[6]
a = np.asarray(Image.open(src).convert("RGB").crop((x0, y0, x1, y1))).astype(np.float32)
h, w, _ = a.shape
b = np.roll(a, (h // 2, w // 2), axis=(0, 1))
yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
m = np.minimum(np.minimum(xx, w - 1 - xx) / (w / 2), np.minimum(yy, h - 1 - yy) / (h / 2))
m = np.clip(m * 1.6, 0, 1)[..., None] ** 1.5
tile = a * m + b * (1 - m)
# the night grade the engine applies to painted areas (multiply by the area's night tint)
meta = json.load(open(os.path.join(os.path.dirname(src), os.path.basename(src).replace("_day.jpg", ".json"))))
tile *= np.array(meta["night_tint"], np.float32)
Image.fromarray(np.clip(tile, 0, 255).astype(np.uint8)).save(out, quality=88)
print(out, tile.shape[1], tile.shape[0], "tint", meta["night_tint"])
