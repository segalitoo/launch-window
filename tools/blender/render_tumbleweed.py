"""Tumbleweed for the desert outside the base (Phase 6, Ran: wind and tumbleweed that move).

Builds a loose ball of dry, thin, curved twigs, rolls it one full turn and renders the turn
through the units' iso camera and sun (render_unit.py), so it sits in the same world as the
operators. Plain render, not the units' drawn look: its outline turns every 1 px twig black and
the ball read as a dark knot. Rolling: the ball turns about the axis across the wind; the wind
blows toward screen bottom-left (src/render/ambience.ts), which is sim +y, so a tumbleweed runs
down the open west strip and never into the base.

Run headless:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/render_tumbleweed.py -- \\
      --out assets/raw/fx/tumbleweed
Then: python3 tools/pack_strip.py assets/raw/fx/tumbleweed assets/build/fx/tumbleweed.png --outline
"""

import argparse
import math
import os
import random
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import looks  # noqa: E402
import render_iso as iso  # noqa: E402
import render_unit as ru  # noqa: E402

RADIUS = 0.5  # m: bigger than most real ones, so it reads at game size (about 25 px)
FRAMES = 12  # one full turn
TWIGS = 110
DRY = (0.55, 0.42, 0.22)  # linear, daylight: pale dry brush (the engine grades it to night)
DRY_DARK = (0.30, 0.21, 0.10)


def twig(rng, root):
    """A thin curved twig running across the inside of the ball."""
    pts = []
    a = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))).normalized()
    b = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))).normalized()
    bend = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))) * 0.45
    for i in range(6):
        t = i / 5
        p = a.lerp(b, t) + bend * math.sin(math.pi * t)
        # keep it near the ball's skin: a tumbleweed is hollow-ish, dense at the surface
        p = p.normalized() * RADIUS * rng.uniform(0.75, 1.0)
        pts.append(p)
    cu = bpy.data.curves.new("twig", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = rng.uniform(0.004, 0.008)
    cu.bevel_resolution = 1
    sp = cu.splines.new("NURBS")
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (p.x, p.y, p.z, 1)
    sp.use_endpoint_u = True
    sp.order_u = 3
    ob = bpy.data.objects.new("twig", cu)
    bpy.context.scene.collection.objects.link(ob)
    ob.parent = root
    return ob


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed", type=int, default=3)
    ap.add_argument("--samples", type=int, default=48)
    ap.add_argument("--look", default="render", choices=looks.LOOKS)
    a = ap.parse_args(argv)
    rng = random.Random(a.seed)

    iso.reset_scene()
    root = bpy.data.objects.new("tumbleweed", None)
    bpy.context.scene.collection.objects.link(root)
    root.location = (0, 0, RADIUS)
    mat = iso.material("dry", [DRY, DRY_DARK], rough=0.95, noise_scale=30.0, bump=0.05)
    for _ in range(TWIGS):
        ob = twig(rng, root)
        ob.data.materials.append(mat)

    ru.FRAME_W, ru.FRAME_H, ru.ANCHOR = 48, 48, (24, 38)
    ru.setup_lights()
    ru.setup_camera(2)
    ru.setup_render(a.samples)
    looks.setup_look(bpy.context.scene, a.look)
    os.makedirs(a.out, exist_ok=True)
    scene = bpy.context.scene
    for f in range(FRAMES):
        # rolling toward sim +y (Blender -Y) turns the ball about Blender +X (up x direction)
        root.rotation_euler = (2 * math.pi * f / FRAMES, 0, 0)
        bpy.context.view_layer.update()
        scene.render.filepath = os.path.join(a.out, f"roll_f{f}.png")
        bpy.ops.render.render(write_still=True)
    print("TUMBLEWEED", a.out, FRAMES)


if __name__ == "__main__":
    main()
