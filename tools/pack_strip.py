"""Packs numbered frames (<name>_f0.png, _f1.png, ...) side by side into one sprite strip.

Usage:
  python3 tools/pack_strip.py assets/raw/fx/tumbleweed assets/build/fx/tumbleweed.png --outline

--outline adds a dark ring around each frame's silhouette (not around every part inside it),
so a thin, airy object such as the tumbleweed keeps a readable edge on the sand at night.
"""
import glob
import os
import re
import sys

from PIL import Image, ImageChops, ImageFilter

src, out = sys.argv[1], sys.argv[2]
outline = "--outline" in sys.argv[3:]


def ring(f):
    """A dark ring just outside the frame's silhouette, under the frame."""
    a = f.getchannel("A").point(lambda v: 255 if v > 60 else 0)
    # close the gaps between twigs first, so the ring follows the ball, not each twig
    solid = a.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(3))
    inner = solid.filter(ImageFilter.MinFilter(3))  # the ring is the silhouette's outer 2 px only
    edge = ImageChops.subtract(solid.filter(ImageFilter.MaxFilter(3)), inner)
    dark = Image.new("RGBA", f.size, (26, 20, 12, 0))
    dark.putalpha(edge.point(lambda v: v * 170 // 255))
    dark.alpha_composite(f)
    return dark

files = sorted(glob.glob(os.path.join(src, "*_f*.png")), key=lambda f: int(re.search(r"_f(\d+)\.png$", f).group(1)))
frames = [Image.open(f).convert("RGBA") for f in files]
if outline:
    frames = [ring(f) for f in frames]
w, h = frames[0].size
strip = Image.new("RGBA", (w * len(frames), h))
for i, f in enumerate(frames):
    strip.paste(f, (i * w, 0))
os.makedirs(os.path.dirname(out), exist_ok=True)
strip.save(out, optimize=True)
print(out, len(frames), "frames of", w, "x", h)
