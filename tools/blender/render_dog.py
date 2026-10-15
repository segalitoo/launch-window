"""Dog renderer for Launch Window (Phase 3): builds a low-poly guard dog, rigs it, animates it
and renders every frame in 8 directions through the same iso camera, sun, rim and drawn look
as the units (render_unit.py), so pack_unit.py and the game read it like any other unit.

Run headless:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/render_dog.py -- \
      --coat a --out assets/raw/units/dog

The dog: a working shepherd type, about 0.62 m at the shoulder and 1.1 m nose to tail, in a
dark harness (it is a guard's dog). Pointed ears and a low tail give it a silhouette no
person on the map has (lesson 27). Rigid skinning like the units: each part on one bone.

Model axes: the dog faces +X, left is +Y, up is +Z, paws on z = 0. Every bone is rolled so
local X is lateral: a positive X rotation swings a leg's tip forward and lifts the tip of
the torso, neck, head, jaw and tail.

Animations are formula poses (no quadruped motion capture in the CMU set):
  idle   breathing, a slow tail wag, the head looks about
  walk   trot: diagonal pairs move together (front left with hind right)
  run    gallop: front pair, then hind pair, the body pitching between
  sniff  nose to the ground, tail out (at a decoy)
  bark   head up, jaw snaps open twice, body rocks back
  death  falls onto its side and lies still (the last frame holds)
"""

import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import looks  # noqa: E402
import render_iso as iso  # noqa: E402
import render_unit as ru  # noqa: E402  (mesh helpers, camera, lights, render settings)

D = math.radians

# Coats for Ran to pick from (DOG-01). Linear daylight values; the engine grades to night.
#   base: legs, head, chest; saddle: back and tail; mask: muzzle and ears
COATS = {
    # A: black and tan shepherd, a black saddle over tan legs and head
    "a": {"base": (0.36, 0.20, 0.08), "saddle": (0.03, 0.025, 0.02), "mask": (0.03, 0.025, 0.02)},
    # B: fawn all over with a black mask, lightest of the three
    "b": {"base": (0.42, 0.28, 0.13), "saddle": (0.38, 0.25, 0.11), "mask": (0.03, 0.025, 0.02)},
    # C: all black, a shape in the dark
    "c": {"base": (0.035, 0.03, 0.028), "saddle": (0.03, 0.025, 0.02), "mask": (0.03, 0.025, 0.02)},
}
HARNESS = (0.06, 0.07, 0.04)

SH = 0.62  # shoulder height
HIP = 0.58


# ---------- rig ----------
def bones():
    """bone: (head, tail, parent)."""
    b = {
        "torso": ((-0.36, 0, HIP), (0.30, 0, SH), None),
        "neck": ((0.30, 0, SH + 0.02), (0.44, 0, SH + 0.18), "torso"),
        "head": ((0.44, 0, SH + 0.18), (0.70, 0, SH + 0.11), "neck"),
        "jaw": ((0.52, 0, SH + 0.10), (0.68, 0, SH + 0.07), "head"),
        "tail": ((-0.37, 0, HIP + 0.02), (-0.58, 0, HIP - 0.22), "torso"),
    }
    for side, y in (("L", 0.085), ("R", -0.085)):
        b[f"arm.{side}"] = ((0.24, y, SH - 0.06), (0.26, y, 0.31), "torso")
        b[f"fore.{side}"] = ((0.26, y, 0.31), (0.25, y, 0.05), f"arm.{side}")
        b[f"fpaw.{side}"] = ((0.25, y, 0.05), (0.33, y, 0.02), f"fore.{side}")
        b[f"thigh.{side}"] = ((-0.30, y, HIP - 0.04), (-0.21, y, 0.33), "torso")
        b[f"shank.{side}"] = ((-0.21, y, 0.33), (-0.33, y, 0.15), f"thigh.{side}")
        b[f"hock.{side}"] = ((-0.33, y, 0.15), (-0.31, y, 0.05), f"shank.{side}")
        b[f"hpaw.{side}"] = ((-0.31, y, 0.05), (-0.23, y, 0.02), f"hock.{side}")
    return b


LEG_BONES = ("arm", "fore", "thigh", "shank", "hock")


def build_rig(spec):
    arm_data = bpy.data.armatures.new("rig")
    rig = bpy.data.objects.new("rig", arm_data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail, _) in spec.items():
        eb = arm_data.edit_bones.new(name)
        eb.head, eb.tail = Vector(head), Vector(tail)
        # local Z forward on leg bones, up on the rest: local X is lateral on both
        eb.align_roll(Vector((1, 0, 0)) if name.split(".")[0] in LEG_BONES else Vector((0, 0, 1)))
    for name, (_, _, parent) in spec.items():
        if parent:
            arm_data.edit_bones[name].parent = arm_data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
    return rig


def build_dog(coat):
    c = COATS[coat]
    mat = {
        "base": iso.material("dog_base", (c["base"], tuple(v * 1.15 for v in c["base"])), noise_scale=14, bump=0.08),
        "saddle": iso.material("dog_saddle", (c["saddle"], tuple(v * 1.3 for v in c["saddle"])), noise_scale=14, bump=0.08),
        "mask": iso.material("dog_mask", c["mask"], rough=0.8),
        "harness": iso.material("harness", HARNESS, rough=0.7),
        "black": iso.material("black", ru.BLACK, rough=0.4),
    }
    B = bones()
    rig = build_rig(B)
    P = {k: (Vector(v[0]), Vector(v[1])) for k, v in B.items()}

    def on(bone, name, build, m):
        ru.attach(ru.part(name, build, mat[m]), rig, bone)

    # body: a deep chest tapering to the loin, the saddle over the back, a harness
    on("torso", "chest", lambda bm: ru.ball(bm, (0.20, 0, SH - 0.05), 0.15, sz=1.15, segs=12), "base")
    on("torso", "barrel", lambda bm: ru.limb(bm, (-0.36, 0, HIP - 0.01), (0.22, 0, SH - 0.03), 0.10, 0.135, segs=10), "base")
    on("torso", "saddle", lambda bm: ru.limb(bm, (-0.34, 0, HIP + 0.04), (0.18, 0, SH + 0.05), 0.085, 0.11, segs=10), "saddle")
    on("torso", "harness", lambda bm: ru.limb(bm, (0.04, 0, SH - 0.02), (0.16, 0, SH - 0.01), 0.142, 0.15, segs=12), "harness")
    on("torso", "handle", lambda bm: ru.box(bm, (0.10, 0, SH + 0.15), (0.10, 0.03, 0.03)), "harness")

    # neck, head, muzzle, nose, ears, jaw
    on("neck", "neck", lambda bm: ru.limb(bm, (0.26, 0, SH), (0.46, 0, SH + 0.19), 0.095, 0.07, segs=10), "base")
    on("neck", "ruff", lambda bm: ru.limb(bm, (0.28, 0, SH + 0.05), (0.42, 0, SH + 0.19), 0.06, 0.05, segs=8), "saddle")
    on("head", "skull", lambda bm: ru.ball(bm, (0.49, 0, SH + 0.19), 0.08, sz=0.9, segs=10), "base")
    on("head", "muzzle", lambda bm: ru.limb(bm, (0.52, 0, SH + 0.16), (0.69, 0, SH + 0.12), 0.045, 0.028, segs=8), "mask")
    on("head", "nose", lambda bm: ru.ball(bm, (0.70, 0, SH + 0.125), 0.022, segs=6), "black")
    for side, y in (("L", 1), ("R", -1)):
        on("head", f"ear_{side}", lambda bm, y=y: ru.limb(bm, (0.46, 0.045 * y, SH + 0.24), (0.44, 0.06 * y, SH + 0.36), 0.032, 0.004, segs=6), "mask")
    on("jaw", "jaw", lambda bm: ru.limb(bm, (0.53, 0, SH + 0.10), (0.67, 0, SH + 0.075), 0.03, 0.018, segs=6), "mask")

    # tail: low and bushy
    on("tail", "tail", lambda bm: ru.limb(bm, P["tail"][0], P["tail"][0].lerp(P["tail"][1], 0.5), 0.035, 0.05, segs=8), "saddle")
    on("tail", "tail_tip", lambda bm: ru.limb(bm, P["tail"][0].lerp(P["tail"][1], 0.5), P["tail"][1], 0.05, 0.015, segs=8), "saddle")

    # legs
    for side in "LR":
        on(f"arm.{side}", f"arm_{side}", lambda bm, s=side: ru.limb(bm, P[f"arm.{s}"][0], P[f"arm.{s}"][1], 0.055, 0.04), "base")
        on(f"fore.{side}", f"fore_{side}", lambda bm, s=side: ru.limb(bm, P[f"fore.{s}"][0], P[f"fore.{s}"][1], 0.034, 0.028), "base")
        on(f"fpaw.{side}", f"fpaw_{side}", lambda bm, s=side: ru.box(bm, P[f"fpaw.{s}"][0] + Vector((0.03, 0, -0.025)), (0.08, 0.05, 0.035)), "base")
        on(f"thigh.{side}", f"thigh_{side}", lambda bm, s=side: ru.limb(bm, P[f"thigh.{s}"][0], P[f"thigh.{s}"][1], 0.075, 0.045), "base")
        on(f"shank.{side}", f"shank_{side}", lambda bm, s=side: ru.limb(bm, P[f"shank.{s}"][0], P[f"shank.{s}"][1], 0.04, 0.03), "base")
        on(f"hock.{side}", f"hock_{side}", lambda bm, s=side: ru.limb(bm, P[f"hock.{s}"][0], P[f"hock.{s}"][1], 0.028, 0.026), "base")
        on(f"hpaw.{side}", f"hpaw_{side}", lambda bm, s=side: ru.box(bm, P[f"hpaw.{s}"][0] + Vector((0.03, 0, -0.025)), (0.08, 0.05, 0.035)), "base")
    return rig


# ---------- animation ----------
def leg(a, side, front, swing, lift):
    """One leg: swing in degrees (+ forward), lift 0..1 folds it while it travels forward."""
    if front:
        a[f"arm.{side}"] = swing
        a[f"fore.{side}"] = -55 * lift
        a[f"fpaw.{side}"] = 50 * lift
    else:
        a[f"thigh.{side}"] = swing
        a[f"shank.{side}"] = 35 * lift
        a[f"hock.{side}"] = -30 * lift


def stand():
    return {"neck": 0, "head": 0, "tail": 0}


def idle_pose(f, n):
    p = 2 * math.pi * f / n
    a = stand()
    a["torso"] = 1.0 * math.sin(p)  # breath
    a["head"] = (4 * math.sin(p), 0, 8 * math.sin(p))  # looks about
    a["tail"] = (0, 0, 14 * math.sin(2 * p))  # slow wag
    return a, 0.0


def walk_pose(f, n):
    """Trot: front left with hind right, then the other pair."""
    p = 2 * math.pi * f / n
    a = stand()
    for side, ph in (("L", 0.0), ("R", math.pi)):
        sf = math.sin(p + ph)
        sh_ = math.sin(p + ph + math.pi)  # the hind leg of the opposite side moves with this front
        leg(a, side, True, 22 * sf, max(0.0, math.cos(p + ph)))
        leg(a, side, False, 20 * sh_, max(0.0, math.cos(p + ph + math.pi)))
    a["head"] = (-4, 0, 0)
    a["tail"] = (-6, 0, 8 * math.sin(p))
    return a, -0.015 * abs(math.sin(p))


def run_pose(f, n):
    """Gallop: the front pair reaches, then the hind pair drives; the body pitches between."""
    p = 2 * math.pi * f / n
    a = stand()
    for side, off in (("L", 0.0), ("R", 0.35)):  # a little lead between left and right
        a_f = math.sin(p + off)
        a_h = math.sin(p + off + math.pi * 0.9)
        leg(a, side, True, 42 * a_f, max(0.0, math.cos(p + off)))
        leg(a, side, False, 40 * a_h, max(0.0, math.cos(p + off + math.pi * 0.9)))
    a["torso"] = 7 * math.sin(p + math.pi / 2)
    a["neck"] = -14 - 6 * math.sin(p + math.pi / 2)
    a["head"] = (-6, 0, 0)
    a["tail"] = (12, 0, 0)
    return a, 0.04 * max(0.0, math.sin(p)) - 0.02


def sniff_pose(f, n):
    p = 2 * math.pi * f / n
    a = stand()
    a["neck"] = -58
    a["head"] = (-22 + 4 * math.sin(2 * p), 0, 10 * math.sin(p))
    a["arm.L"] = a["arm.R"] = 6
    a["tail"] = (18, 0, 10 * math.sin(p))
    return a, -0.01


def bark_pose(f, n):
    """Two snaps of the jaw; the head comes up and the body rocks back on each."""
    k = [0.0, 1.0, 0.4, 1.0, 0.4, 0.0][f]
    a = stand()
    a["torso"] = 3 * k
    a["neck"] = 12 + 6 * k
    a["head"] = (6 * k, 0, 0)
    a["jaw"] = -28 * k
    a["tail"] = (25, 0, 0)
    a["arm.L"] = a["arm.R"] = 8
    a["thigh.L"] = a["thigh.R"] = 10
    return a, -0.01 * k


def death_pose(f, n):
    """Folds at the legs and rolls onto its right side; the last frame holds."""
    t = ru.ease(f / (n - 1))
    a = stand()
    a["torso"] = (0, 85 * t, 0)  # roll about the body's own axis
    a["neck"] = -10 * t
    a["head"] = (-15 * t, 0, 0)
    a["tail"] = (-20 * t, 0, 0)
    for side in "LR":
        leg(a, side, True, 20 * t, 0.3 * t)
        leg(a, side, False, -10 * t, 0.3 * t)
    return a, -0.46 * t


ANIMS = {
    "idle": (idle_pose, 12),
    "walk": (walk_pose, 12),
    "run": (run_pose, 12),
    "sniff": (sniff_pose, 8),
    "bark": (bark_pose, 6),
    "death": (death_pose, 10),
}


def pose(rig, angles, lift):
    for pb in rig.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    for name, r in angles.items():
        rx, ry, rz = r if isinstance(r, tuple) else (r, 0, 0)
        rig.pose.bones[name].rotation_euler = (D(rx), D(ry), D(rz))
    # torso lies along +X with local Z up: its location (0, 0, z) lifts or drops the whole dog
    rig.pose.bones["torso"].location = (0, 0, lift)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--coat", default="a", choices=sorted(COATS))
    ap.add_argument("--out", required=True)
    ap.add_argument("--supersample", type=int, default=2)
    ap.add_argument("--samples", type=int, default=48)
    ap.add_argument("--only", default="", help="render only these anims, comma separated")
    ap.add_argument("--dirs", default="0,1,2,3,4,5,6,7")
    ap.add_argument("--look", default="outline_pop", choices=looks.LOOKS)
    a = ap.parse_args(argv)

    iso.reset_scene()
    rig = build_dog(a.coat)
    ru.setup_lights()
    ru.setup_camera(a.supersample)
    ru.setup_render(a.samples)
    looks.setup_look(bpy.context.scene, a.look)
    os.makedirs(a.out, exist_ok=True)

    scene = bpy.context.scene
    dirs = [int(d) for d in a.dirs.split(",")]
    for name, (fn, n) in ANIMS.items():
        if a.only and name not in a.only.split(","):
            continue
        for f in range(n):
            rig.rotation_euler = (0, 0, 0)
            pose(rig, *fn(f, n))
            for d in dirs:
                rig.rotation_euler = (0, 0, -math.radians(45 * d))
                bpy.context.view_layer.update()
                scene.render.filepath = os.path.join(a.out, f"{name}_d{d}_f{f}.png")
                bpy.ops.render.render(write_still=True)

    meta = {
        "unit": "dog",
        "coat": a.coat,
        "frame": [ru.FRAME_W, ru.FRAME_H],
        "anchor": list(ru.ANCHOR),
        "supersample": a.supersample,
        "anims": {k: n for k, (_, n) in ANIMS.items()},
        "sources": {k: "formula pose" for k in ANIMS},
        "dirs": 8,
        "dir_rule": "direction d = sim angle d * 45 degrees, 0 = sim +x",
    }
    with open(os.path.join(a.out, "meta.json"), "w") as fh:
        json.dump(meta, fh, indent=2)
    print("META", json.dumps(meta))


if __name__ == "__main__":
    main()
