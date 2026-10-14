"""Unit renderer for Launch Window: builds a low-poly operator, rigs it, animates it
and renders every frame in 8 directions through the game's iso camera.

Run headless:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/render_unit.py -- \
      --unit yoav --out assets/raw/units/yoav

Then pack the frames: python3 tools/pack_unit.py yoav

Why a built model (Phase 2, option A, approved by Ran): the same camera, sun and scale
as the painted yard, so every frame matches the map, and guards reuse the rig.
Rigid skinning: each body part is its own mesh parented to one bone. At 44 px the
joints never show, and there are no weights to break.

Model axes: the figure faces +X, left is +Y, up is +Z, feet on z = 0.
Direction d (0..7) = sim angle d * 45 degrees; 0 is sim +x (screen down-right),
2 is sim +y (screen down-left). Sim +y is Blender -Y, so the figure turns by -angle.
"""

import argparse
import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mocap  # noqa: E402  (motion capture onto our rig)
import render_iso as iso  # noqa: E402  (camera, sun and material helpers)

MOCAP_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "assets", "raw", "mocap")


class Mocap:
    """An animation taken from a motion capture clip (tools/blender/mocap.py).
    a, b: source frames (120 fps). loop: a cycle (b excluded, it equals a); otherwise a
    one-shot that ends on b. arms: 'hold' keeps the carbine hold, 'mocap' follows the clip.
    root_xy: keep the clip's horizontal travel (a fall); cycles stay in place, since the
    sim moves the unit. face: source frames to measure the facing from (default a..b)."""

    def __init__(self, clip, a, b, n, loop, arms="hold", root_xy=False, face=None, weapon="chest"):
        self.clip, self.a, self.b, self.n, self.loop = clip, a, b, n, loop
        self.arms, self.root_xy, self.face = arms, root_xy, face or (a, b)
        self.weapon = weapon  # "chest" (slung) or "hands" (swung, e.g. a strike)

    def times(self):
        step = (self.b - self.a) / (self.n if self.loop else max(1, self.n - 1))
        return [self.a + step * f for f in range(self.n)]


# ---------- frame layout (1x = 100% zoom) ----------
FRAME_W = 96  # wide enough for a prone figure in any direction; pack_unit.py trims the empty space
FRAME_H = 72
ANCHOR = (48, 62)  # where the feet (the sim position) land in the frame

# ---------- palette (linear, daylight; the engine grades to night) ----------
OLIVE = (0.15, 0.175, 0.085)
OLIVE_DARK = (0.10, 0.12, 0.06)
TAN = (0.50, 0.37, 0.19)  # coyote: gloves, boots, carbine, pouches (the light values at night)
BLACK = (0.025, 0.025, 0.025)

SKIN = (0.32, 0.20, 0.13)
KHAKI = (0.34, 0.28, 0.16)

# Every unit is the same rig and body plan; a spec changes the kit.
#   cloth / cloth_dark: uniform and webbing; cloth2 = second camouflage colour (noise mix)
#   accent: boots, gloves, pouches; weapon: rifle body; face: None = balaclava in cloth colour
#   head: helmet_nvg | helmet | cap | beret; tape = squad colour on the helmet back (None = no tape)
OPERATOR = {
    "height": 1.80, "width": 1.15, "cloth": OLIVE, "cloth_dark": OLIVE_DARK, "cloth2": None,
    "accent": TAN, "gloves": TAN, "weapon": TAN, "face": None, "head": "helmet_nvg",
    "tape": None, "carrier": True, "pack": True, "antenna": True, "kneepads": True,
    "anims": ["idle", "walk", "run", "crawl_idle", "crawl", "takedown", "grab", "drag", "death", "hit"],
}
UNITS = {
    # Visual language 6c/6d. tape = squad colour on the back of the helmet (UI colour, linear).
    "yoav": {**OPERATOR, "tape": (0.15, 0.55, 1.0)},
    # Guard: option A, picked by Ran (Phase 2). Khaki, soft cap, bare face and hands, black
    # boots, dark rifle, belt webbing: lightest figure at night and unlike the olive squad.
    # Fictional: no flags, insignia or unit marks.
    "guard": {**OPERATOR, "height": 1.76, "width": 1.05, "cloth": KHAKI, "cloth_dark": (0.20, 0.17, 0.10),
              "accent": BLACK, "gloves": SKIN, "weapon": (0.05, 0.045, 0.04), "face": SKIN, "head": "cap",
              "carrier": False, "pack": False, "antenna": False, "kneepads": False,
              "anims": ["idle", "walk", "run", "death", "knockout", "dragged"]},
}


# ---------- mesh helpers ----------
def part(name, build, mat):
    bm = bmesh.new()
    build(bm)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = iso.mesh_object(name, bm, mat)
    for poly in ob.data.polygons:
        poly.use_smooth = False
    return ob


def box(bm, c, size, rot_y=0.0, rot_x=0.0):
    m = bmesh.ops.create_cube(bm, size=1.0)
    R = Matrix.Rotation(rot_x, 3, "X") @ Matrix.Rotation(rot_y, 3, "Y")
    for v in m["verts"]:
        p = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        v.co = Vector(c) + R @ p


def limb(bm, a, b, r0, r1, segs=8):
    """Tapered cylinder from point a (radius r0) to point b (radius r1)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    m = bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r0, radius2=r1, depth=d.length)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    for v in m["verts"]:
        v.co = a + d / 2 + q @ v.co


def ball(bm, c, r, sz=1.0, segs=10, top_only=False):
    m = bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(4, segs // 2 + 1), radius=r)
    verts = m["verts"]
    if top_only:  # helmet shell: flatten the lower half
        for v in verts:
            if v.co.z < 0:
                v.co.z *= 0.25
    for v in verts:
        v.co = Vector(c) + Vector((v.co.x, v.co.y, v.co.z * sz))


# ---------- rig ----------
# bone: (head, tail, parent). All bones get roll so local X = lateral; then a positive
# X rotation swings a limb forward (legs, arms) or leans the spine forward.
def bones_for(h):
    s = h / 1.80
    hip, knee, ankle = 0.92 * s, 0.50 * s, 0.09 * s
    sh = 1.43 * s
    return {
        "hips": ((0, 0, hip - 0.05), (0, 0, hip + 0.08), None),
        "spine": ((0, 0, hip + 0.08), (0, 0, sh + 0.05), "hips"),
        "head": ((0, 0, sh + 0.08), (0, 0, h), "spine"),
        "thigh.L": ((0, 0.10, hip), (0, 0.10, knee), "hips"),
        "shin.L": ((0, 0.10, knee), (0, 0.10, ankle), "thigh.L"),
        "foot.L": ((0, 0.10, ankle), (0.14, 0.10, 0.02), "shin.L"),
        "thigh.R": ((0, -0.10, hip), (0, -0.10, knee), "hips"),
        "shin.R": ((0, -0.10, knee), (0, -0.10, ankle), "thigh.R"),
        "foot.R": ((0, -0.10, ankle), (0.14, -0.10, 0.02), "shin.R"),
        "arm.L": ((0, 0.22, sh), (0, 0.24, sh - 0.29 * s), "spine"),
        "fore.L": ((0, 0.24, sh - 0.29 * s), (0, 0.24, sh - 0.55 * s), "arm.L"),
        "arm.R": ((0, -0.22, sh), (0, -0.24, sh - 0.29 * s), "spine"),
        "fore.R": ((0, -0.24, sh - 0.29 * s), (0, -0.24, sh - 0.55 * s), "arm.R"),
    }


def build_rig(bones):
    arm_data = bpy.data.armatures.new("rig")
    rig = bpy.data.objects.new("rig", arm_data)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail, _) in bones.items():
        eb = arm_data.edit_bones.new(name)
        eb.head, eb.tail = Vector(head), Vector(tail)
        eb.align_roll(Vector((1, 0, 0)))
    for name, (_, _, parent) in bones.items():
        if parent:
            arm_data.edit_bones[name].parent = arm_data.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
    return rig


def attach(ob, rig, bone):
    """Rigid skinning: parent to a bone and keep the rest-pose world position."""
    bpy.context.view_layer.update()
    pb = rig.pose.bones[bone]
    tail = rig.matrix_world @ pb.matrix @ Matrix.Translation((0, pb.bone.length, 0))
    ob.parent = rig
    ob.parent_type = "BONE"
    ob.parent_bone = bone
    ob.matrix_parent_inverse = tail.inverted()


# ---------- the operator ----------
def build_operator(spec):
    h = spec["height"]
    s = h / 1.80
    w = spec["width"]
    cloth = spec["cloth"]
    if spec["cloth2"]:  # camouflage: two colours in large blotches
        olive = iso.material("cloth", (cloth, spec["cloth2"]), noise_scale=3.5, noise_amount=1.6, bump=0.1)
    else:
        olive = iso.material("cloth", (cloth, tuple(c * 1.12 for c in cloth)), noise_scale=9, bump=0.1)
    acc = spec["accent"]
    mat = {
        "olive": olive,
        "dark": iso.material("cloth_dark", spec["cloth_dark"], rough=0.8),
        "tan": iso.material("accent", (acc, tuple(c * 1.1 for c in acc)), noise_scale=12, bump=0.05),
        "gloves": iso.material("gloves", spec["gloves"], rough=0.7),
        "weapon": iso.material("weapon", spec["weapon"], rough=0.5),
        "face": iso.material("face", spec["face"] or cloth, rough=0.7),
        "black": iso.material("black", BLACK, rough=0.5),
        "tape": iso.material("tape", spec["tape"] or BLACK, rough=0.6),
    }
    bones = bones_for(h)
    rig = build_rig(bones)
    B = {k: (Vector(v[0]), Vector(v[1])) for k, v in bones.items()}

    def on(bone, name, build, m):
        attach(part(name, build, mat[m]), rig, bone)

    # legs: trousers, knee pads, boots
    for side in "LR":
        y = 0.10 if side == "L" else -0.10
        hip, knee = B[f"thigh.{side}"]
        ankle = B[f"shin.{side}"][1]
        on(f"thigh.{side}", f"thigh_{side}", lambda bm: limb(bm, hip, knee, 0.088 * w, 0.068 * w), "olive")
        on(f"shin.{side}", f"shin_{side}", lambda bm: limb(bm, knee, ankle + Vector((0, 0, 0.03)), 0.066 * w, 0.052 * w), "olive")
        if spec["kneepads"]:
            on(f"shin.{side}", f"kneepad_{side}", lambda bm: box(bm, knee + Vector((0.055, 0, -0.03)), (0.05, 0.10, 0.12)), "dark")
        on(f"foot.{side}", f"boot_{side}", lambda bm: box(bm, (0.045, y, 0.055), (0.27, 0.11, 0.11)), "tan")

    # torso, belt, plate carrier, pouches, backpack and antenna
    hip_z = B["hips"][0].z
    sh = B["arm.L"][0].z
    on("hips", "pelvis", lambda bm: box(bm, (0, 0, hip_z + 0.06), (0.22 * w, 0.34 * w, 0.20)), "olive")
    on("hips", "belt", lambda bm: box(bm, (0, 0, hip_z + 0.15), (0.24 * w, 0.36 * w, 0.05)), "dark")
    on("spine", "chest", lambda bm: limb(bm, (0, 0, hip_z + 0.14), (0, 0, sh + 0.02), 0.15 * w, 0.18 * w, segs=8), "olive")
    if spec["carrier"]:
        on("spine", "carrier", lambda bm: box(bm, (0.01, 0, sh - 0.19 * s), (0.30 * w, 0.37 * w, 0.34 * s)), "dark")
        for i, py in enumerate((-0.10, 0.0, 0.10)):
            on("spine", f"pouch_{i}", lambda bm, py=py: box(bm, (0.17 * w, py * w, sh - 0.27 * s), (0.05, 0.085, 0.11)), "tan")
    else:  # webbing: shoulder strap and two pouches on the belt
        on("spine", "strap", lambda bm: box(bm, (0.13 * w, 0, sh - 0.20 * s), (0.04, 0.06, 0.42 * s), rot_x=math.radians(30)), "dark")
        for i, py in enumerate((-0.09, 0.09)):
            on("hips", f"pouch_{i}", lambda bm, py=py: box(bm, (0.12 * w, py * w, hip_z + 0.13), (0.06, 0.08, 0.09)), "dark")
    if spec["pack"]:
        on("spine", "pack", lambda bm: box(bm, (-0.22 * w, 0, sh - 0.17 * s), (0.17, 0.30 * w, 0.38 * s)), "dark")
    if spec["antenna"]:
        # thick enough to survive 44 px (visual language 6d), with a tip bead
        ant_base = Vector((-0.27 * w, 0.11 * w, sh + 0.0))
        ant_top = ant_base + Vector((-0.04, 0.0, 0.48 * s))
        on("spine", "antenna", lambda bm: limb(bm, ant_base, ant_top, 0.014, 0.010, segs=6), "black")
        on("spine", "antenna_tip", lambda bm: ball(bm, ant_top, 0.024, segs=6), "black")

    # head: balaclava, helmet shell, NVG mount, headset cups, squad tape on the back
    head_c = Vector((0.01, 0, h - 0.17 * s))
    on("head", "neck", lambda bm: limb(bm, (0, 0, sh + 0.0), head_c - Vector((0, 0, 0.06)), 0.07, 0.065, segs=8), "olive")
    on("head", "face", lambda bm: ball(bm, head_c, 0.105 * s, sz=1.15), "face")
    head = spec["head"]
    if head in ("helmet_nvg", "helmet"):
        on("head", "helmet", lambda bm: ball(bm, head_c + Vector((-0.01, 0, 0.045 * s)), 0.138 * s, sz=0.95, top_only=True), "olive" if head == "helmet_nvg" else "dark")
    if head == "helmet_nvg":
        on("head", "nvg", lambda bm: box(bm, head_c + Vector((0.13 * s, 0, 0.10 * s)), (0.06, 0.07, 0.07)), "black")
        for cy in (0.12, -0.12):
            on("head", f"cup_{cy}", lambda bm, cy=cy: limb(bm, head_c + Vector((0, cy * s, 0)), head_c + Vector((0, cy * s * 1.25, 0)), 0.045, 0.045, segs=8), "dark")
    if head == "cap":  # soft patrol cap with a short brim
        on("head", "cap", lambda bm: limb(bm, head_c + Vector((0, 0, 0.04 * s)), head_c + Vector((0, 0, 0.13 * s)), 0.115 * s, 0.10 * s, segs=10), "olive")
        on("head", "brim", lambda bm: box(bm, head_c + Vector((0.12 * s, 0, 0.05 * s)), (0.09, 0.17 * s, 0.015)), "olive")
    if head == "beret":  # soft, pulled down to one side
        on("head", "beret", lambda bm: ball(bm, head_c + Vector((-0.01, -0.03, 0.08 * s)), 0.125 * s, sz=0.45), "dark")
    if spec["tape"]:
        on("head", "tape", lambda bm: box(bm, head_c + Vector((-0.135 * s, 0, 0.07 * s)), (0.02, 0.15 * s, 0.035 * s)), "tape")

    # arms: sleeves and tan gloves, posed in rest so the hands meet the carbine at low ready
    for side in "LR":
        a0, a1 = B[f"arm.{side}"]
        f1 = B[f"fore.{side}"][1]
        on(f"arm.{side}", f"upper_{side}", lambda bm: limb(bm, a0, a1, 0.062 * w, 0.054 * w), "olive")
        on(f"fore.{side}", f"fore_{side}", lambda bm: limb(bm, a1, f1, 0.054 * w, 0.046 * w), "olive")
        on(f"fore.{side}", f"glove_{side}", lambda bm: ball(bm, f1 + Vector((0, 0, -0.03)), 0.05), "gloves")

    # carbine: a tan bullpup carried across the chest (visual language 6d)
    def carbine(bm):
        c = Vector((0.21 * w, 0.0, sh - 0.33 * s))
        tilt = math.radians(-25)  # muzzle low and to the right, stock up at the left shoulder
        box(bm, c, (0.06, 0.52, 0.085), rot_x=tilt)
        box(bm, c + Vector((0.0, 0.0, -0.07)), (0.04, 0.05, 0.08), rot_x=tilt)  # grip and magazine

    def muzzle(bm):
        tilt = math.radians(-25)
        c = Vector((0.21 * w, -0.33 * math.cos(tilt), sh - 0.33 * s + 0.33 * math.sin(tilt)))
        box(bm, c, (0.035, 0.14, 0.035), rot_x=tilt)
    on("spine", "carbine", carbine, "weapon")
    on("spine", "muzzle", muzzle, "black")

    # a second carbine for moves where the hands swing the weapon (the takedown strike):
    # hidden until hands_weapon() places it between the hands, with the chest one hidden
    def loose(bm):
        box(bm, (0, 0, 0), (0.06, 0.52, 0.085))
        box(bm, (0, 0.0, -0.07), (0.04, 0.05, 0.08))
        box(bm, (0, -0.33, 0), (0.035, 0.14, 0.035))
    held = part("carbine_held", loose, mat["weapon"])
    held.parent = rig
    held.hide_render = True

    return rig


def hands_weapon(rig, on):
    """Show the carbine in both hands (on=True) or slung on the chest (on=False).
    In the hands it lies along the line from the right hand to the left, the right hand
    at the grip; set again after every pose."""
    objs = bpy.data.objects
    objs["carbine"].hide_render = on
    objs["muzzle"].hide_render = on
    held = objs["carbine_held"]
    held.hide_render = not on
    if not on:
        return
    bpy.context.view_layer.update()
    r = rig.pose.bones["fore.R"].tail
    l = rig.pose.bones["fore.L"].tail
    y = (r - l).normalized()  # muzzle (local -Y) toward the left hand
    z = y.cross(Vector((0, 0, 1))).cross(y).normalized() if abs(y.z) < 0.95 else Vector((1, 0, 0))
    x = y.cross(z)
    held.matrix_basis = Matrix.Translation(r - y * 0.12) @ Matrix((x, y, z)).transposed().to_4x4()


# ---------- animation ----------
D = math.radians


def pose(rig, angles, lift=0.0, shift=0.0):
    """angles: bone -> degrees about local X (forward swing), or (x, y, z) degrees.
    Local Z is the figure's forward axis, so a Z rotation swings a limb sideways."""
    for name, r in angles.items():
        rx, ry, rz = r if isinstance(r, tuple) else (r, 0, 0)
        rig.pose.bones[name].rotation_euler = (D(rx), D(ry), D(rz))
    # hips bone points up: local Y = world Z, local Z = world +X (forward)
    rig.pose.bones["hips"].location = (0, lift, shift)


# Arms in rest hang straight; these bend them so the hands hold the carbine.
ARMS_HOLD = {"arm.L": 14, "fore.L": 58, "arm.R": 6, "fore.R": 64}


def walk_pose(f, n):
    """Frame f of an n-frame walk cycle (two steps)."""
    p = 2 * math.pi * f / n
    thigh = 24 * math.sin(p)
    a = {
        "spine": 7,  # stealth lean
        "head": -4,
        "thigh.L": thigh,
        "thigh.R": -thigh,
        # the knee bends most while the leg swings forward
        "shin.L": -(6 + 38 * max(0.0, math.cos(p))),
        "shin.R": -(6 + 38 * max(0.0, -math.cos(p))),
    }
    a["foot.L"] = -(a["thigh.L"] + a["shin.L"]) * 0.6
    a["foot.R"] = -(a["thigh.R"] + a["shin.R"]) * 0.6
    swing = 5 * math.sin(p)
    a.update({k: v + (swing if k.endswith("L") else -swing) for k, v in ARMS_HOLD.items()})
    return a, -0.03 * abs(math.sin(p))


def run_pose(f, n):
    """Frame f of an n-frame run cycle (two strides). The sim's normal move speed
    (Yoav 3.5 tiles/s, 5.6 m/s) is a run; walk is for dragging a body."""
    p = 2 * math.pi * f / n
    thigh = 36 * math.sin(p)
    a = {
        "spine": 15,
        "head": -10,
        "thigh.L": thigh,
        "thigh.R": -thigh,
        "shin.L": -(12 + 75 * max(0.0, math.cos(p))),
        "shin.R": -(12 + 75 * max(0.0, -math.cos(p))),
    }
    a["foot.L"] = -(a["thigh.L"] + a["shin.L"]) * 0.5
    a["foot.R"] = -(a["thigh.R"] + a["shin.R"]) * 0.5
    swing = 8 * math.sin(p)
    a.update({k: v + (swing if k.endswith("L") else -swing) for k, v in ARMS_HOLD.items()})
    # airborne between strides: highest mid-stride, lowest at contact
    return a, 0.05 * abs(math.cos(p)) - 0.04


def idle_pose(f, n):
    a = {"spine": 4, "head": -2, "shin.L": -4, "shin.R": -4, "foot.L": 2, "foot.R": 2, **ARMS_HOLD}
    return a, -0.01


# ---- prone: the hips bone is the root, so pitching it lays the whole body down ----
PRONE = {"hips": 84, "head": -55, "foot.L": 10, "foot.R": 10}
PRONE_LIFT = -0.74  # drops the hip pivot from 0.87 m to about 0.13 m


def crawl_idle_pose(f, n):
    a = {**PRONE, "arm.L": 150, "fore.L": -25, "arm.R": 160, "fore.R": -35}
    return a, PRONE_LIFT


def crawl_pose(f, n):
    """Combat crawl: one knee drawn up sideways while the opposite arm reaches."""
    p = 2 * math.pi * f / n
    kl, kr = max(0.0, math.sin(p)), max(0.0, -math.sin(p))
    a = {
        **PRONE,
        "thigh.L": (0, 0, 45 * kl),
        "thigh.R": (0, 0, -45 * kr),
        # the shin folds back along the ground (sideways axis), so the foot stays down
        "shin.L": (0, 0, -80 * kl),
        "shin.R": (0, 0, 80 * kr),
        "arm.L": 150 + 18 * math.sin(p),
        "fore.L": -25,
        "arm.R": 160 - 18 * math.sin(p),
        "fore.R": -35,
    }
    return a, PRONE_LIFT


def ease(t):
    return t * t * (3 - 2 * t)


def takedown_pose(f, n):
    """Step in and drive the carbine butt down: up on frames 1-2, strike on 3-4."""
    up = [0.0, 0.7, 1.0, 0.4, 0.0, 0.0][f]
    lunge = ease(min(1.0, f / 3))
    a = {
        "spine": 10 + 22 * lunge,
        "head": -8,
        "thigh.L": 28 * lunge,
        "shin.L": -10 * lunge,
        "thigh.R": -14 * lunge,
        "shin.R": -18 * lunge,
        "arm.L": ARMS_HOLD["arm.L"] + 85 * up,
        "fore.L": ARMS_HOLD["fore.L"],
        "arm.R": ARMS_HOLD["arm.R"] + 95 * up,
        "fore.R": ARMS_HOLD["fore.R"],
    }
    return a, -0.06 * lunge


def grab_pose(f, n):
    """Crouch and reach down for the body."""
    t = ease(f / (n - 1))
    a = {
        "spine": 4 + 40 * t,
        "head": -2 - 15 * t,
        "thigh.L": 75 * t,
        "thigh.R": 60 * t,
        "shin.L": -4 - 115 * t,
        "shin.R": -4 - 100 * t,
        "foot.L": 2 + 40 * t,
        "foot.R": 2 + 40 * t,
        "arm.L": ARMS_HOLD["arm.L"] + 45 * t,
        "fore.L": ARMS_HOLD["fore.L"] - 45 * t,
        "arm.R": ARMS_HOLD["arm.R"],
        "fore.R": ARMS_HOLD["fore.R"],
    }
    return a, -0.36 * t


def drag_pose(f, n):
    """Walk bent forward, left hand back on the body's collar."""
    a, lift = walk_pose(f, n)
    a.update({"spine": 24, "head": -14, "arm.L": -35, "fore.L": 15})
    return a, lift - 0.04


def death_pose(f, n):
    """Fall back and lie still. The last frame holds."""
    t = ease(f / (n - 1))
    a = {
        "hips": -80 * t,
        "head": 20 * t,
        "thigh.L": 25 * t,
        "thigh.R": 10 * t,
        "shin.L": -20 * t,
        "arm.L": ARMS_HOLD["arm.L"] + 50 * t,
        "fore.L": ARMS_HOLD["fore.L"] - 50 * t,
        "arm.R": (ARMS_HOLD["arm.R"] - 20 * t, 0, -40 * t),
        "fore.R": ARMS_HOLD["fore.R"] - 60 * t,
    }
    return a, -0.76 * t


def dragged_pose(f, n):
    """A body dragged by the collar: on its back, shoulders raised about 0.3 m, legs along
    the ground, arms trailing. The neck sits over the origin, so the game draws it at the
    dragger's hands; the head points -X (toward the dragger), the feet +X."""
    sway = [0.0, 3.0][f % 2]
    a = {
        "hips": -70,
        "head": 12,
        "thigh.L": 21 + sway,
        "thigh.R": 23 - sway,
        "shin.L": -4,
        "shin.R": -8,
        "foot.L": 40,
        "foot.R": 35,
        "arm.L": (-8, 0, 12),
        "arm.R": (-8, 0, -12),
        "fore.L": -10,
        "fore.R": -15,
    }
    return a, -0.75, 0.57


def hit_pose(f, n):
    """Flinch back, then recover."""
    k = [1.0, 0.6, 0.25][f]
    a = {**{"spine": 4 - 16 * k, "head": -2 + 18 * k, "shin.L": -4, "shin.R": -4}, **ARMS_HOLD}
    a["arm.L"] += 15 * k
    return a, -0.01


# Motion capture, CMU clips (assets/raw/mocap/README.md). Ran, Phase 2: movement must feel natural.
#   run: 09_01, one stride 2.55 m (1.6 tiles) in 0.77 s, foot plant to foot plant
#   death: 90_18, a backward fall, 0.75 s from standing to lying still
#   takedown: 02_07 (swordplay), both hands overhead, then a hard downward strike; the
#         carbine is held in the hands for it (hands_weapon)
#   knockout: 77_16 (lying face down, getting up) played backwards: knees give, kneel,
#         hands down, legs slide back, face down. Guards struck from behind fall this way.
#   drag: 81_08, walking backwards bent over, both hands low in front, pulling; the
#         loop 992-1212 starts and ends on the closest matching pose (1.8 s, 0.6 m)
ANIMS = {
    "idle": (idle_pose, 1),
    "walk": (walk_pose, 8),
    "run": (Mocap("09_01", 45, 137, 12, loop=True), 12),
    "crawl_idle": (crawl_idle_pose, 1),
    "crawl": (crawl_pose, 8),
    "takedown": (Mocap("02_07", 55, 205, 12, loop=False, arms="mocap", face=(85, 120), weapon="hands"), 12),
    "grab": (grab_pose, 4),
    "drag": (Mocap("81_08", 992, 1212, 16, loop=True, arms="mocap"), 16),
    "death": (Mocap("90_18", 75, 165, 10, loop=False, arms="mocap", root_xy=True, face=(1, 75)), 10),
    "hit": (hit_pose, 3),
    "dragged": (dragged_pose, 2),
    # struck from behind: a get-up from lying face down (77_16), played backwards
    "knockout": (Mocap("77_16", 460, 220, 12, loop=False, arms="mocap", root_xy=True, face=(440, 460)), 12),
}


# ---------- camera and lights ----------
def setup_camera(supersample):
    scene = bpy.context.scene
    px_per_m = iso.TILE_PX_W / (iso.TILE_M * math.sqrt(2))
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = max(FRAME_W, FRAME_H) / px_per_m
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    t = iso.CAM_TILT
    view_dir = Vector((-math.sin(t) / math.sqrt(2), math.sin(t) / math.sqrt(2), -math.cos(t)))
    cam.location = -view_dir * 50
    cam.rotation_euler = view_dir.to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()
    # move the camera so the origin (the feet) lands on ANCHOR, not the frame centre
    up = cam.matrix_world.to_3x3() @ Vector((0, 1, 0))
    right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0))
    cam.location += up * (ANCHOR[1] - FRAME_H / 2) / px_per_m
    cam.location -= right * (ANCHOR[0] - FRAME_W / 2) / px_per_m
    # ortho_scale spans the larger side; centre the smaller one
    scene.render.resolution_x = FRAME_W * supersample
    scene.render.resolution_y = FRAME_H * supersample
    scene.render.resolution_percentage = 100
    return cam


# Units are lit a little harder than the map so they keep a lit side and a shadow side
# at night (visual language 6b); same sun direction as the map.
UNIT_SUN = 3.0


def setup_lights():
    iso.setup_light({**iso.LOOKS["B"], "sun_strength": UNIT_SUN})
    # subtle cool rim from behind, top left on screen (visual language 6b)
    rim = bpy.data.lights.new("rim", "SUN")
    rim.energy = 1.6
    rim.color = (0.75, 0.85, 1.0)
    ob = bpy.data.objects.new("rim", rim)
    bpy.context.scene.collection.objects.link(ob)
    to_rim = Vector((-1.0, 0.6, 0.9)).normalized()
    ob.rotation_euler = (-to_rim).to_track_quat("-Z", "Y").to_euler()


def setup_render(samples):
    scene = bpy.context.scene
    iso.setup_render("B", samples)
    scene.render.film_transparent = True
    scene.render.image_settings.color_mode = "RGBA"
    scene.cycles.use_denoising = False  # small frames; denoise smears the edges
    scene.render.filter_size = 1.0


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--unit", default="yoav", choices=sorted(UNITS))
    ap.add_argument("--out", required=True)
    ap.add_argument("--supersample", type=int, default=2)
    ap.add_argument("--samples", type=int, default=48)
    ap.add_argument("--only", default="", help="render only these anims, comma separated")
    ap.add_argument("--dirs", default="0,1,2,3,4,5,6,7")
    a = ap.parse_args(argv)

    iso.reset_scene()
    rig = build_operator(UNITS[a.unit])
    setup_lights()
    setup_camera(a.supersample)
    setup_render(a.samples)
    os.makedirs(a.out, exist_ok=True)

    dirs = [int(d) for d in a.dirs.split(",")]
    spec = UNITS[a.unit]
    unit_anims = {k: v for k, v in ANIMS.items() if k in spec["anims"]}
    anims = {k: v for k, v in unit_anims.items() if not a.only or k in a.only.split(",")}
    scene = bpy.context.scene
    clips = {}
    hip_h = rig.data.bones["thigh.L"].head_local.z
    for name, (fn, n) in anims.items():
        if isinstance(fn, Mocap):
            if fn.clip not in clips:
                clips[fn.clip] = mocap.Clip(os.path.join(MOCAP_DIR, fn.clip + ".bvh"), hip_h)
            clip = clips[fn.clip]
            clip.face_x(*fn.face)
            clip.origin = clip.raw(fn.a)["Hips"].copy()
            times = fn.times()
        for f in range(n):
            rig.rotation_euler = (0, 0, 0)
            if isinstance(fn, Mocap):
                mocap.apply(rig, clip.at(times[f]), arms=fn.arms, root_xy=fn.root_xy, hold=ARMS_HOLD)
                hands_weapon(rig, fn.weapon == "hands")
            else:
                hands_weapon(rig, False)
                for pb in rig.pose.bones:
                    pb.rotation_euler = (0, 0, 0)
                    pb.location = (0, 0, 0)
                pose(rig, *fn(f, n))
            for d in dirs:
                rig.rotation_euler = (0, 0, -math.radians(45 * d))
                bpy.context.view_layer.update()
                scene.render.filepath = os.path.join(a.out, f"{name}_d{d}_f{f}.png")
                bpy.ops.render.render(write_still=True)

    meta = {
        "unit": a.unit,
        "frame": [FRAME_W, FRAME_H],
        "anchor": list(ANCHOR),
        "supersample": a.supersample,
        "anims": {k: n for k, (_, n) in unit_anims.items()},
        # where each animation comes from, shown in the motion library page
        "sources": {k: (f"motion capture, CMU {fn.clip}" if isinstance(fn, Mocap) else "formula pose") for k, (fn, _) in unit_anims.items()},
        "dirs": 8,
        "dir_rule": "direction d = sim angle d * 45 degrees, 0 = sim +x",
    }
    with open(os.path.join(a.out, "meta.json"), "w") as fh:
        json.dump(meta, fh, indent=2)
    print("META", json.dumps(meta))


if __name__ == "__main__":
    main()
