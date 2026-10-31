"""Portrait plates for the squad cards (Phase 6, Ran: portraits rendered from the 3D models).

Builds a squad unit with render_unit.py's rig and kit, stands it in the idle pose and renders
its head and shoulders through a close perspective camera, lit by the game's sun from the top
left. The plate is a blockout, not the final art: an image model paints over it (style key: the
approved yard painting, assets/raw/prompts/batch-10-portraits.md), the same way the map is made.

Framings (the three options shown to Ran):
  face   tight on the face and helmet, eye level
  bust   head and shoulders, three-quarter front, a little from above
  side   head and shoulders turned away, looking over his shoulder toward the camera's left

Run headless:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/render_portrait.py -- \\
      --unit yoav --framing bust --out assets/raw/portraits
"""

import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_iso as iso  # noqa: E402
import render_unit as ru  # noqa: E402

# camera: (yaw of the camera around the figure in degrees, 0 = in front of the face,
#          height above the eyes in m, distance in m, lens mm, aim below the eyes in m)
FRAMINGS = {
    "face": (25, 0.02, 1.15, 85, 0.04),
    "bust": (35, 0.30, 1.9, 70, 0.20),
    "side": (75, 0.20, 1.9, 70, 0.20),
}


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--unit", default="yoav", choices=sorted(ru.UNITS))
    ap.add_argument("--framing", default="bust", choices=sorted(FRAMINGS))
    ap.add_argument("--out", required=True)
    ap.add_argument("--size", type=int, default=1024)
    ap.add_argument("--samples", type=int, default=64)
    a = ap.parse_args(argv)

    iso.reset_scene()
    spec = ru.UNITS[a.unit]
    rig = ru.build_operator(spec)
    ru.hands_weapon(rig, "chest")
    ru.pose(rig, *ru.idle_pose(0, 1))
    ru.hands_weapon(rig, "chest")
    bpy.context.view_layer.update()
    ru.setup_lights()
    ru.setup_render(a.samples)
    scene = bpy.context.scene
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGB"
    scene.render.resolution_x = scene.render.resolution_y = a.size
    scene.cycles.use_denoising = True
    # a plain mid-grey world, so the image model reads the figure, not the background
    world = scene.world or bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.32, 0.32, 0.32, 1)
    bg.inputs[1].default_value = 0.6

    # the figure faces +X; the eyes sit about 0.93 of the height
    eye = Vector((0.0, 0.0, spec["height"] * 0.93))
    yaw, up, dist, lens, aim = FRAMINGS[a.framing]
    # positive yaw swings the camera toward the figure's left (+Y), where the sun is on screen
    d = Vector((math.cos(math.radians(yaw)), math.sin(math.radians(yaw)), 0))
    cam_data = bpy.data.cameras.new("pcam")
    cam_data.lens = lens
    cam = bpy.data.objects.new("pcam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.location = eye + d * dist + Vector((0, 0, up))
    target = eye - Vector((0, 0, aim))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()

    os.makedirs(a.out, exist_ok=True)
    scene.render.filepath = os.path.join(a.out, f"{a.unit}_{a.framing}_plate.png")
    bpy.ops.render.render(write_still=True)
    print("PLATE", scene.render.filepath)


if __name__ == "__main__":
    main()
