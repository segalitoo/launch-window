"""Motion capture onto our rig (Phase 2, Ran: movement must feel natural).

Source: the CMU Graphics Lab Motion Capture Database (mocap.cs.cmu.edu), BVH conversion
by cgspeed. CMU: free for research and commercial projects; the data may ship inside a
product but may not be resold as data. Clips live in assets/raw/mocap/ with their
README; the game ships only rendered frames.

How it maps: CMU's skeleton and our rig are built differently, so joint rotations do not
copy across. Instead, each frame we read where every CMU bone points in space and turn the
matching rig bone to point the same way, keeping our bone lengths. Pelvis and chest also
take their twist from the hip line and the shoulder line (the weight shift a formula pose
lacks). Arms can follow the clip, or keep the carbine hold and only follow the chest.
"""

import math

import bpy
from mathutils import Matrix, Vector

# rig bone -> (CMU joint at its head, CMU joint at its tail); "Name.tail" = that bone's tail
CHAINS = {
    "thigh.L": ("LeftUpLeg", "LeftLeg"),
    "shin.L": ("LeftLeg", "LeftFoot"),
    "foot.L": ("LeftFoot", "LeftToeBase.tail"),
    "thigh.R": ("RightUpLeg", "RightLeg"),
    "shin.R": ("RightLeg", "RightFoot"),
    "foot.R": ("RightFoot", "RightToeBase.tail"),
    "arm.L": ("LeftArm", "LeftForeArm"),
    "fore.L": ("LeftForeArm", "LeftHand"),
    "arm.R": ("RightArm", "RightForeArm"),
    "fore.R": ("RightForeArm", "RightHand"),
    "head": ("Head", "Head.tail"),
}
ORDER = ["hips", "spine", "head", "thigh.L", "shin.L", "foot.L", "thigh.R", "shin.R", "foot.R",
         "arm.L", "fore.L", "arm.R", "fore.R"]


class Clip:
    """A BVH clip, read as joint positions per frame, turned to face +X and scaled to metres."""

    def __init__(self, path, hip_height):
        before = set(bpy.data.objects)
        # one scene frame per captured frame (120 fps); otherwise the importer resamples
        bpy.context.scene.render.fps = 120
        bpy.ops.import_anim.bvh(filepath=path, global_scale=1.0, update_scene_fps=False, update_scene_duration=False, use_fps_scale=False)
        self.ob = next(o for o in bpy.data.objects if o not in before)
        self.ob.hide_render = True
        act = self.ob.animation_data.action
        self.f0, self.f1 = (int(v) for v in act.frame_range)
        self.fps = 120.0  # CMU capture rate
        self._cache = {}
        # floor: lowest toe over the clip; scale: standing hip height to ours
        lows = [min(self.raw(f)["LeftToeBase.tail"].z, self.raw(f)["RightToeBase.tail"].z) for f in range(self.f0, self.f1 + 1, 4)]
        self.floor = min(lows)
        # standing hip height = the highest the hips get (a clip may start lying down)
        stand = max(self.raw(f)["Hips"].z for f in range(self.f0, self.f1 + 1, 4)) - self.floor
        self.scale = hip_height / stand
        self.yaw = 0.0
        self.origin = Vector((0, 0, 0))

    def raw(self, f):
        """World positions of every joint (head) plus '<name>.tail', in source units."""
        if f not in self._cache:
            bpy.context.scene.frame_set(int(f))
            m = self.ob.matrix_world
            d = {}
            for pb in self.ob.pose.bones:
                d[pb.name] = m @ pb.head
                d[pb.name + ".tail"] = m @ pb.tail
            self._cache[f] = d
        return self._cache[f]

    def face_x(self, f0, f1):
        """Turn the clip so the body faces +X on average over frames f0..f1."""
        fwd = Vector((0, 0, 0))
        for f in range(f0, f1 + 1, 2):
            p = self.raw(f)
            lat = (p["LeftUpLeg"] - p["RightUpLeg"]).normalized()
            fwd += lat.cross(Vector((0, 0, 1)))
        self.yaw = -math.atan2(fwd.y, fwd.x)
        self.origin = self.raw(f0)["Hips"].copy()

    def at(self, t):
        """Joint positions at fractional source frame t, in metres, facing +X,
        hips over the origin of frame f0 horizontally, floor at z = 0."""
        a = self.raw(math.floor(t))
        b = self.raw(min(self.f1, math.floor(t) + 1))
        k = t - math.floor(t)
        R = Matrix.Rotation(self.yaw, 3, "Z")
        out = {}
        for n in a:
            v = a[n].lerp(b[n], k)
            v = Vector((v.x - self.origin.x, v.y - self.origin.y, v.z - self.floor))
            out[n] = (R @ v) * self.scale
        return out


def _frame(y, fwd):
    """Rotation whose Y = y (bone direction) and Z = fwd made orthogonal: our rest roll
    puts each bone's local Z on the body's forward axis."""
    y = y.normalized()
    z = (fwd - fwd.dot(y) * y).normalized()
    x = y.cross(z)
    return Matrix((x, y, z)).transposed()


def apply(rig, p, arms="mocap", root_xy=True, hold=None):
    """Pose `rig` from joint positions `p` (Clip.at). arms: 'mocap' or 'hold' (keep the
    carbine hold from `hold`, a dict of bone -> X rotation in degrees, relative to the chest).
    root_xy False keeps the hips over the origin (in-place cycles; the sim moves the unit)."""
    up = Vector((0, 0, 1))
    hip_mid = (p["LeftUpLeg"] + p["RightUpLeg"]) / 2
    pelvis_lat = (p["LeftUpLeg"] - p["RightUpLeg"]).normalized()
    pelvis_up = (p["Spine"] - hip_mid).normalized()
    pelvis_fwd = pelvis_lat.cross(pelvis_up).normalized()
    chest_lat = (p["LeftArm"] - p["RightArm"]).normalized()
    chest_up = (p["Neck"] - p["Spine"]).normalized()
    chest_fwd = chest_lat.cross(chest_up).normalized()

    want = {
        "hips": (pelvis_up, pelvis_fwd),
        "spine": (chest_up, chest_fwd),
        "head": ((p["Head.tail"] - p["Head"]), chest_fwd),
    }
    for bone, (a, b) in CHAINS.items():
        if bone == "head":
            continue
        fwd = pelvis_fwd if bone[:5] in ("thigh", "shin.", "foot.") else chest_fwd
        want[bone] = (p[b] - p[a], fwd)

    for pb in rig.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    bpy.context.view_layer.update()

    # hips: place the pelvis so our hip joints sit where the clip's do
    hips = rig.pose.bones["hips"]
    rest_mid = (rig.data.bones["thigh.L"].head_local + rig.data.bones["thigh.R"].head_local) / 2
    R = _frame(*want["hips"])
    rest_R = rig.data.bones["hips"].matrix_local.to_3x3()
    # hip joints relative to the hips bone head, rotated by the pose
    offset = (R @ rest_R.inverted()) @ (rest_mid - rig.data.bones["hips"].head_local)
    target = hip_mid.copy()
    if not root_xy:
        target.x = target.y = 0.0
    head = target - offset
    hips.matrix = Matrix.Translation(head) @ R.to_4x4()
    bpy.context.view_layer.update()

    for name in ORDER[1:]:
        pb = rig.pose.bones[name]
        if arms == "hold" and name[:4] in ("arm.", "fore"):
            continue
        cur = pb.matrix.translation.copy()
        pb.matrix = Matrix.Translation(cur) @ _frame(*want[name]).to_4x4()
        bpy.context.view_layer.update()
    if arms == "hold" and hold:
        for name, rx in hold.items():
            rig.pose.bones[name].rotation_euler = (math.radians(rx), 0, 0)
        bpy.context.view_layer.update()


def contacts(clip, side="Left", f0=None, f1=None):
    """Frames where that foot's ankle is at a local low (foot plants), source frames."""
    f0 = f0 or clip.f0
    f1 = f1 or clip.f1
    z = {f: clip.raw(f)[f"{side}Foot"].z for f in range(f0, f1 + 1)}
    lows = [f for f in range(f0 + 3, f1 - 3) if z[f] <= min(z[g] for g in range(f - 3, f + 4))]
    out = []
    for f in lows:  # one per plant
        if not out or f - out[-1] > 20:
            out.append(f)
    return out
