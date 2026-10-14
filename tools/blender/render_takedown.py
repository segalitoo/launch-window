"""The takedown as a matched pair (Ran, Phase 2): Yoav comes in behind a guard, his left
hand over the guard's mouth pulling the head back, a commando knife in his right hand
into the guard's side at the waist, then lowers him backwards to the ground and stands.

Both rigs stand in one scene and are keyed on one timeline, so their contact holds; IK
keeps Yoav's hands on the guard's head and waist. Yoav's frames render with the guard
hidden (camera on Yoav's feet), the guard's with Yoav hidden (camera on the guard's feet).
The game puts the guard ahead and half a step to Yoav's left, facing the same way
(src/sim/mission.ts takedown(), TAKEDOWN_REACH and TAKEDOWN_SIDE), so the two line up.

Run headless (after render_unit.py for both units; this replaces their takedown frames):
  /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/render_takedown.py -- \\
      --yoav assets/raw/units/yoav --guard assets/raw/units/guard
Writes takedown_d*_f* (Yoav) and knockout_d*_f* (guard) and updates both meta.json files.
"""

import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import render_unit as ru  # noqa: E402

# The guard starts ahead and half a step to Yoav's left, so Yoav comes in at his back-right:
# their outlines stay apart and the knife arm works on the open side (Ran, Session 5).
# Metres in Yoav's frame (+x ahead, +y left); sim: TAKEDOWN_REACH and TAKEDOWN_SIDE tiles.
GAP = (0.60, 0.30)
N = 12  # frames over the whole move
DURATION = 0.8  # seconds (src/render/unitAnim.ts ONE_SHOT.takedown)


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def keyed(u, keys):
    """Value at time u (0..1) from [(u, value), ...], eased between keys. Values may be
    numbers or dicts of numbers (bone -> degrees) or tuples."""
    keys = sorted(keys, key=lambda k: k[0])
    if u <= keys[0][0]:
        return keys[0][1]
    for (u0, a), (u1, b) in zip(keys, keys[1:]):
        if u <= u1:
            k = smooth((u - u0) / (u1 - u0))
            return mix(a, b, k)
    return keys[-1][1]


def mix(a, b, k):
    # a bone given one angle in one key and (x, y, z) in another: the one angle is x
    if isinstance(a, tuple) and not isinstance(b, tuple) and not isinstance(b, dict):
        b = (b, 0.0, 0.0)
    if isinstance(b, tuple) and not isinstance(a, tuple) and not isinstance(a, dict):
        a = (a, 0.0, 0.0)
    if isinstance(a, dict):
        out = {}
        for n in set(a) | set(b):  # a bone missing from one key is at rest there
            va, vb = a.get(n), b.get(n)
            out[n] = mix(zero(vb) if va is None else va, zero(va) if vb is None else vb, k)
        return out
    if isinstance(a, tuple):
        return tuple(mix(x, y, k) for x, y in zip(a, b))
    return a + (b - a) * k


def zero(v):
    return tuple(0.0 for _ in v) if isinstance(v, tuple) else 0.0


H = ru.ARMS_HOLD

# Readability over realism at 44 px: exaggerated key poses, a clear wind-up, a fast thrust,
# a big reaction, a quick drop. 0.8 s: wind-up to 0.30, thrust 0.30-0.40, reaction to 0.55,
# down by 0.85, Yoav up by 1.0.
IDLE = {"spine": 4, "head": -2, "shin.L": -4, "shin.R": -4, **H}
ON_BACK = {"hips": -86, "spine": 2, "head": 12, "thigh.L": 6, "thigh.R": 4, "shin.L": -4, "shin.R": -2,
           "foot.L": 26, "foot.R": 22, "arm.L": (-5, 0, 22), "fore.L": -5, "arm.R": (-5, 0, -22), "fore.R": -5}

# ---------------- the guard: grabbed, stabbed, arches, drops onto his back ----------------
GUARD = [
    (0.00, (IDLE, 0.0, (0.0, 0.0))),
    # the hand closes over his mouth: head pulled back, he stiffens
    (0.30, ({**IDLE, "spine": -6, "head": -28}, 0.0, (-0.02, 0.0))),
    (0.40, ({**IDLE, "spine": -10, "head": -34}, 0.0, (-0.03, 0.0))),
    # the knife goes in: big arch, head back, arms fly up and out
    (0.52, ({"spine": -28, "head": -48, "thigh.L": 6, "shin.L": -14, "shin.R": -12,
             "arm.L": (85, 0, 45), "fore.L": 40, "arm.R": (80, 0, -45), "fore.R": 45}, -0.03, (-0.06, 0.0))),
    # knees go, he sags back
    (0.68, ({"hips": -30, "spine": -12, "head": -20, "thigh.L": 40, "thigh.R": 34, "shin.L": -72, "shin.R": -64,
             "arm.L": (40, 0, 40), "fore.L": 20, "arm.R": (35, 0, -40), "fore.R": 20}, -0.32, (-0.16, 0.06))),
    (0.85, (ON_BACK, -0.76, (-0.42, 0.14))),
    (1.00, (ON_BACK, -0.77, (-0.43, 0.15))),
]

# ---------------- Yoav: in, hand over the mouth, knife raised, thrust, lower, stand ----------------
# (pose, hips lift, (root x, root y) in metres; +x ahead, +y to Yoav's left)
STAND = IDLE
YOAV = [
    (0.00, (STAND, -0.01, (0.0, 0.0))),
    # a quick step in on the left foot, weight forward
    (0.25, ({"spine": 12, "head": -6, "thigh.L": 26, "shin.L": -20, "thigh.R": -12, "shin.R": -14}, -0.05, (0.16, 0.0))),
    # braced for the thrust
    (0.40, ({"spine": 16, "head": -4, "thigh.L": 22, "shin.L": -26, "thigh.R": -18, "shin.R": -20}, -0.10, (0.20, 0.0))),
    # lowers him, going down on the right knee
    (0.70, ({"spine": 30, "head": -16, "thigh.L": 60, "shin.L": -80, "thigh.R": 20, "shin.R": -110, "foot.R": 40},
            -0.42, (0.08, 0.05))),
    (0.85, ({"spine": 26, "head": -18, "thigh.L": 68, "shin.L": -92, "thigh.R": 28, "shin.R": -116, "foot.R": 45},
            -0.48, (0.04, 0.05))),
    (1.00, (STAND, -0.01, (0.0, 0.05))),
]

# The guard's feet stay planted while his knees give; released as he goes down on his back.
GUARD_FEET_ON = [(0.0, 1.0), (0.62, 1.0), (0.80, 0.0), (1.0, 0.0)]
# Yoav's right (back) foot stays planted through the grab and stab.
YOAV_RIGHT_FOOT_ON = [(0.0, 1.0), (0.50, 1.0), (0.62, 0.0), (1.0, 0.0)]

# IK on Yoav's hands. Left: over the guard's mouth from the start of the step to the end.
LEFT_ON = [(0.0, 0.0), (0.10, 0.0), (0.25, 1.0), (0.85, 1.0), (0.95, 0.0), (1.0, 0.0)]
# Right: drives the knife the whole time it is out: raised, then into his side.
RIGHT_ON = [(0.0, 0.0), (0.06, 0.0), (0.20, 1.0), (0.85, 1.0), (0.95, 0.0), (1.0, 0.0)]
KNIFE_ON = (0.08, 0.88)
# 0 = knife raised at Yoav's right shoulder, out to the side (in view); 1 = in the guard's side
THRUST = [(0.0, 0.0), (0.30, 0.0), (0.40, 1.0), (1.0, 1.0)]
WINDUP = Vector((0.05, -0.42, 1.38))  # in Yoav's frame
# a brief bright blade at the moment it goes in, so the eye catches it
FLASH = (0.36, 0.47)


def pose_rig(rig, a, lift):
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    ru.pose(rig, a, lift)


def add_ik(rig, bone, name, pole_angle=-90):
    tgt = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(tgt)
    pole = bpy.data.objects.new(name + "_pole", None)
    bpy.context.scene.collection.objects.link(pole)
    c = rig.pose.bones[bone].constraints.new("IK")
    c.target = tgt
    c.pole_target = pole
    c.pole_angle = math.radians(pole_angle)
    c.chain_count = 2
    c.influence = 0.0
    return tgt, pole, c


def knife(rig):
    import bmesh

    bm = bmesh.new()
    # drawn larger than life (30 cm blade) and bright, so it reads at 44 px at night (Ran:
    # the knife must be seen); the grip is tan like the rest of his kit
    ru.box(bm, (0, 0.19, 0), (0.045, 0.30, 0.018))  # blade along +Y
    blade_faces = len(bm.faces)
    ru.box(bm, (0, -0.02, 0), (0.04, 0.12, 0.04))  # grip
    me = bpy.data.meshes.new("knife")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("knife", me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(ru.iso.material("steel", (0.78, 0.80, 0.84), rough=0.3))
    ob.data.materials.append(ru.iso.material("knife_grip", ru.TAN, rough=0.7))
    for i, poly in enumerate(ob.data.polygons):
        poly.material_index = 0 if i < blade_faces else 1
    ob.parent = rig
    return ob


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--yoav", required=True)
    ap.add_argument("--guard", required=True)
    ap.add_argument("--supersample", type=int, default=2)
    ap.add_argument("--samples", type=int, default=48)
    ap.add_argument("--dirs", default="0,1,2,3,4,5,6,7")
    ap.add_argument("--look", default="outline_pop", help="drawn look (tools/blender/looks.py)")
    a = ap.parse_args(argv)

    ru.iso.reset_scene()
    yoav = ru.build_operator(ru.UNITS["yoav"])
    yoav_parts = [o for o in bpy.data.objects if o.parent == yoav or o == yoav]
    guard = ru.build_operator(ru.UNITS["guard"])
    guard_parts = [o for o in bpy.data.objects if (o.parent == guard or o == guard)]
    blade = knife(yoav)
    yoav_parts.append(blade)
    ru.setup_lights()
    ru.setup_camera(a.supersample)
    ru.setup_render(a.samples)
    ru.looks.setup_look(bpy.context.scene, a.look)

    pivot = bpy.data.objects.new("pivot", None)
    bpy.context.scene.collection.objects.link(pivot)
    yoav.parent = pivot
    guard.parent = pivot

    l_tgt, l_pole, l_ik = add_ik(yoav, "fore.L", "ik_left")
    r_tgt, r_pole, r_ik = add_ik(yoav, "fore.R", "ik_right")
    # feet: targets at the ankles' start positions, knees pointing forward
    feet = {}
    for rig, side, key in ((guard, "L", "g"), (guard, "R", "g"), (yoav, "R", "y")):
        feet[(key, side)] = add_ik(rig, f"shin.{side}", f"ik_{key}_foot_{side}")
    planted = {}

    dirs = [int(d) for d in a.dirs.split(",")]
    scene = bpy.context.scene
    for f in range(N):
        u = f / (N - 1)
        # guard first: Yoav's hands go where the guard is
        gp, glift, groot = keyed(u, GUARD)
        pose_rig(guard, gp, glift)
        guard.location = (GAP[0] + groot[0], GAP[1] + groot[1], 0)
        yp, ylift, yroot = keyed(u, YOAV)
        pose_rig(yoav, yp, ylift)
        yoav.location = (yroot[0], yroot[1], 0)
        pivot.rotation_euler = (0, 0, 0)
        pivot.location = (0, 0, 0)
        bpy.context.view_layer.update()

        # targets in world space at rotation 0: the guard's face and his left side at the waist
        gm = guard.matrix_world
        head = guard.pose.bones["head"]
        head_c = gm @ (head.head + (head.tail - head.head) * 0.45)
        face_fwd = (gm.to_3x3() @ (head.matrix.to_3x3() @ Vector((0, 0, 1)))).normalized()
        waist = guard.pose.bones["spine"]
        w0 = gm @ (waist.head + (waist.tail - waist.head) * 0.18)
        side = (gm.to_3x3() @ (waist.matrix.to_3x3() @ Vector((-1, 0, 0)))).normalized()  # local -X = his right
        ym = yoav.matrix_world
        l_tgt.location = head_c + face_fwd * 0.10
        r_tgt.location = (ym @ WINDUP).lerp(w0 + side * 0.15, keyed(u, THRUST))
        # left elbow high and out, hooking round his head; right elbow out to the side
        l_pole.location = ym @ Vector((0.1, 0.9, 1.9))
        r_pole.location = ym @ Vector((-0.2, -1.0, 0.8))
        l_ik.influence = keyed(u, LEFT_ON)
        r_ik.influence = keyed(u, RIGHT_ON)
        for (key, side), (tgt, pole, ik) in feet.items():
            rig = guard if key == "g" else yoav
            ankle = rig.matrix_world @ rig.pose.bones[f"shin.{side}"].tail
            if f == 0:
                planted[(key, side)] = ankle.copy()  # where the foot stands at the start
            tgt.location = planted[(key, side)]
            pole.location = rig.matrix_world @ Vector((1.5, 0.12 if side == "L" else -0.12, 0.5))
            ik.influence = keyed(u, GUARD_FEET_ON if key == "g" else YOAV_RIGHT_FOOT_ON)
        bpy.context.view_layer.update()
        if os.environ.get("TAKEDOWN_DEBUG"):
            w = lambda r, b: r.matrix_world @ r.pose.bones[b].tail
            print(f"DBG f={f} u={u:.2f} handL-face={(w(yoav,'fore.L') - l_tgt.location).length:.2f} "
                  f"handR-waist={(w(yoav,'fore.R') - r_tgt.location).length:.2f} "
                  f"gfootz={w(guard,'shin.L').z:.2f}/{w(guard,'shin.R').z:.2f} "
                  f"gknee={w(guard,'thigh.L').z:.2f} yfootR={tuple(round(v,2) for v in w(yoav,'shin.R'))} "
                  f"ghead={tuple(round(v,2) for v in w(guard,'head'))} yhips={tuple(round(v,2) for v in yoav.matrix_world @ yoav.pose.bones['hips'].head)}")

        # knife in the right hand, blade forward from the fist
        blade.hide_render = not (KNIFE_ON[0] <= u <= KNIFE_ON[1])
        steel = blade.data.materials[0].node_tree.nodes["Principled BSDF"]
        steel.inputs["Emission Color"].default_value = (1.0, 0.97, 0.9, 1.0)
        steel.inputs["Emission Strength"].default_value = 6.0 if FLASH[0] <= u <= FLASH[1] else 0.0
        fore = yoav.pose.bones["fore.R"]
        d = (fore.tail - fore.head).normalized()
        z = d.cross(Vector((0, 0, 1))).cross(d).normalized() if abs(d.z) < 0.95 else Vector((1, 0, 0))
        blade.matrix_basis = Matrix.Translation(fore.tail + d * 0.03) @ Matrix((d.cross(z), d, z)).transposed().to_4x4()

        for d_ in dirs:
            rot = Matrix.Rotation(-math.radians(45 * d_), 4, "Z")
            pivot.rotation_euler = (0, 0, -math.radians(45 * d_))
            # Yoav's frame: camera on Yoav's start position (world origin)
            pivot.location = (0, 0, 0)
            for o in guard_parts:
                o.hide_render = True
            for o in yoav_parts:
                o.hide_render = o.name.startswith("carbine_held") or (o == blade and not (KNIFE_ON[0] <= u <= KNIFE_ON[1]))
            bpy.context.view_layer.update()
            scene.render.filepath = os.path.join(a.yoav, f"takedown_d{d_}_f{f}.png")
            bpy.ops.render.render(write_still=True)
            # the guard's frame: camera on the guard's start position
            pivot.location = (rot @ Vector((-GAP[0], -GAP[1], 0, 1))).to_3d()
            for o in yoav_parts:
                o.hide_render = True
            for o in guard_parts:
                o.hide_render = o.name.startswith("carbine_held")
            bpy.context.view_layer.update()
            scene.render.filepath = os.path.join(a.guard, f"knockout_d{d_}_f{f}.png")
            bpy.ops.render.render(write_still=True)

    for path, anim in ((a.yoav, "takedown"), (a.guard, "knockout")):
        mp = os.path.join(path, "meta.json")
        m = json.load(open(mp))
        m["anims"][anim] = N
        m.setdefault("sources", {})[anim] = "hand keyed pair (render_takedown.py)"
        json.dump(m, open(mp, "w"), indent=2)
    print("TAKEDOWN", N, "frames")


if __name__ == "__main__":
    main()
