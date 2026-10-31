"""Cuts painted items off a plain grey sheet (Phase 6 HUD art: rucksacks and tools).

The image model paints the items on flat light grey (prompt: assets/raw/prompts/batch-09-kit.md).
Background = pixels that are grey-ish and light, connected to the image border (flood fill), so
grey parts inside an item (a stone, a steel peg) are kept. The rest is split into connected items,
sorted in reading order (rows, then left to right), trimmed, and saved as RGBA PNGs.

Usage:
  python3 tools/cut_items.py <sheet.jpg> <out_dir> <name1,name2,...> [--rows N] [--height PX]
  python3 tools/cut_items.py assets/raw/gen/KIT-01_tools_2.jpg assets/build/kit \
      tie,decoy,smoke,bino,uniform,wire,charge,detonate --rows 2 --height 128
Fails loudly when it does not find exactly as many items as names.
"""
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

args = sys.argv[1:]
rows = int(args[args.index("--rows") + 1]) if "--rows" in args else 1
height = int(args[args.index("--height") + 1]) if "--height" in args else 0
sheet, out, names = args[0], args[1], args[2].split(",")

im = np.asarray(Image.open(sheet).convert("RGB")).astype(np.float32)
H, W, _ = im.shape
mx, mn = im.max(2), im.min(2)
# the background: low saturation and light (the sheet is about #cfcfcf with a soft gradient)
bgish = ((mx - mn) < 14) & (mn > 150)
lab, nb = ndimage.label(bgish)
edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
border = np.concatenate([im[0], im[-1], im[:, 0], im[:, -1]])
bg_col = np.median(border, 0)
# enclosed grey patches (inside a rope coil, a strap loop) are background too when they are
# flat and the sheet's own grey; a textured grey item (a stone) is not
bg_ids = set(edge)
for i, sl in enumerate(ndimage.find_objects(lab), start=1):
    if i in edge or sl is None:
        continue
    m = lab[sl] == i
    if m.sum() < 40:
        continue
    if np.abs(im[sl][m] - bg_col).mean() < 9:
        bg_ids.add(i)
bg = np.isin(lab, list(bg_ids))
fg = ndimage.binary_opening(~bg, iterations=1)
lab, n = ndimage.label(fg)
sizes = ndimage.sum(fg, lab, range(1, n + 1))
big = [i + 1 for i, s in enumerate(sizes) if s > 0.004 * H * W]
if len(big) != len(names):
    sys.exit(f"found {len(big)} items, expected {len(names)} ({names}); sizes {sorted(int(s) for s in sizes if s > 500)}")
# small pieces (tent pegs, a cut-off strap end) join the nearest big item if close enough
dist, (iy, ix) = ndimage.distance_transform_edt(~np.isin(lab, big), return_indices=True)
owner = lab[iy, ix]
for i, s in enumerate(sizes, start=1):
    if i in big or s < 60:
        continue
    m = lab == i
    if dist[m].min() < 0.06 * W:
        lab[m] = np.bincount(owner[m]).argmax()
    else:
        lab[m] = 0
fg = lab > 0
keep = big
boxes = {i: ndimage.find_objects((lab == i).astype(int))[0] for i in keep}
# reading order: band by row, then left to right
cy = {i: (boxes[i][0].start + boxes[i][0].stop) / 2 for i in keep}
cx = {i: (boxes[i][1].start + boxes[i][1].stop) / 2 for i in keep}
order = sorted(keep, key=lambda i: (int(cy[i] / (H / rows)), cx[i]))
alpha_all = ndimage.gaussian_filter(fg.astype(np.float32), 0.8)
for name, i in zip(names, order):
    ys, xs = boxes[i]
    pad = 4
    y0, y1 = max(0, ys.start - pad), min(H, ys.stop + pad)
    x0, x1 = max(0, xs.start - pad), min(W, xs.stop + pad)
    a = np.where(ndimage.binary_dilation(lab == i, iterations=1)[y0:y1, x0:x1], alpha_all[y0:y1, x0:x1], 0)
    rgba = np.dstack([im[y0:y1, x0:x1], np.clip(a * 255, 0, 255)]).astype(np.uint8)
    img = Image.fromarray(rgba)
    if height and img.height > height:
        img = img.resize((round(img.width * height / img.height), height), Image.LANCZOS)
    img.save(f"{out}/{name}.png", optimize=True)
    print(name, img.size)
