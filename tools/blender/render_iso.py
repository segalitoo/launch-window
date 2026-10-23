"""Blockout renderer for Launch Window.

Builds a map region from the sim's exported map JSON and renders it through
the fixed isometric camera, at the exact pixel scale the game uses.

Run headless:
  /Applications/Blender.app/Contents/MacOS/Blender -b -P tools/blender/render_iso.py -- \
      --map assets/raw/blockout/map.json --out assets/raw/blockout \
      --name yard --region 11 20 25 30 --look B

Camera and scale rules (CLAUDE.md, art style rules):
- Fixed isometric view on 2:1 tiles, 64 x 32 px per tile at 100% zoom, no rotation.
- Orthographic camera, 60 degrees from vertical, 45 degrees around. That gives
  exact 2:1 ground diamonds.
- One light for every asset, from the top left. Shadows fall to the right and
  slightly down on screen.

A sidecar JSON records where sim tile (0, 0) lands in the image, so the game can
place the render on its iso grid to the pixel.
"""

import argparse
import json
import math
import os
import sys

import bmesh
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

# ---------- scale ----------

TILE_M = 1.6  # one sim tile in metres. A 1.8 m figure is then about 44 px tall at 100% zoom.
TILE_PX_W = 64  # tile diamond width on screen at 100% zoom
CAM_TILT = math.radians(60)  # from vertical
WALL_H = 2.0  # Gate A decision, Session 2: shows more floor behind walls than 2.4 m
WALL_T = 0.7  # wall thickness; walls run through tile centres
DOOR_H = 1.9
BUILDING_H = 3.2
FIGURE_H = 1.8

# Sun: from the screen's top left. Ground direction toward the sun, in Blender axes
# (sim +x = Blender +X, sim +y = Blender -Y). West with a little south lights the
# left visible face dimly and leaves the right face in shadow.
SUN_GROUND = Vector((-1.0, -0.3, 0.0)).normalized()
SUN_ELEVATION = math.radians(48)


def sim_to_world(x, y, z=0.0):
    return Vector((x * TILE_M, -y * TILE_M, z))


# ---------- looks ----------
# Each look is a daylight palette. The night grade is applied later in 2D,
# the same way the engine will do it (tools/grade_night.py).

LOOKS = {
    "A": {  # Dusk ochre
        "label": "Dusk ochre",
        "sand": ((0.62, 0.47, 0.30), (0.71, 0.55, 0.36)),
        "yard": ((0.50, 0.42, 0.32), (0.56, 0.47, 0.36)),
        "concrete": ((0.66, 0.59, 0.48), (0.74, 0.67, 0.55)),
        "steel": (0.27, 0.31, 0.33),
        "machine": (0.33, 0.38, 0.25),
        "wood": ((0.45, 0.31, 0.17), (0.55, 0.39, 0.22)),
        "sun": (1.0, 0.86, 0.68),
        "sun_strength": 2.4,
        "sky": (0.55, 0.62, 0.75),
        "sky_strength": 0.3,
        "noise": 1.0,
        "outline": False,
    },
    "B": {  # Moonlit steel: neutral daylight base, cool and quiet
        "label": "Moonlit steel",
        "sand": ((0.52, 0.49, 0.42), (0.60, 0.56, 0.48)),
        "yard": ((0.44, 0.43, 0.40), (0.50, 0.49, 0.45)),
        "concrete": ((0.60, 0.61, 0.59), (0.68, 0.69, 0.66)),
        "steel": (0.25, 0.29, 0.33),
        "machine": (0.30, 0.35, 0.28),
        "wood": ((0.40, 0.31, 0.21), (0.48, 0.38, 0.26)),
        "sun": (1.0, 0.97, 0.92),
        "sun_strength": 2.2,
        "sky": (0.60, 0.66, 0.74),
        "sky_strength": 0.32,
        "noise": 1.0,
        "outline": False,
    },
    "C": {  # Field map: flat, khaki, graphic edges
        "label": "Field map",
        "sand": ((0.60, 0.56, 0.42), (0.63, 0.59, 0.45)),
        "yard": ((0.52, 0.50, 0.40), (0.55, 0.53, 0.42)),
        "concrete": ((0.70, 0.68, 0.60), (0.72, 0.70, 0.62)),
        "steel": (0.30, 0.34, 0.36),
        "machine": (0.36, 0.40, 0.28),
        "wood": ((0.50, 0.38, 0.24), (0.53, 0.40, 0.26)),
        "sun": (1.0, 0.96, 0.88),
        "sun_strength": 2.0,
        "sky": (0.70, 0.72, 0.74),
        "sky_strength": 0.45,
        "noise": 0.25,
        "outline": True,
    },
}


# ---------- scene helpers ----------

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    return scene


def material(name, colors, rough=0.9, noise_scale=4.0, noise_amount=1.0, bump=0.15, metallic=0.0):
    """Principled material with a two-colour noise mix and a light bump."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    if isinstance(colors[0], (int, float)):
        bsdf.inputs["Base Color"].default_value = (*colors, 1.0)
        return mat
    coord = nt.nodes.new("ShaderNodeTexCoord")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = noise_scale
    noise.inputs["Detail"].default_value = 8.0
    nt.links.new(coord.outputs["Object"], noise.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    a, b = colors
    mid = [(a[i] + b[i]) / 2 for i in range(3)]
    lo = [mid[i] + (a[i] - mid[i]) * noise_amount for i in range(3)]
    hi = [mid[i] + (b[i] - mid[i]) * noise_amount for i in range(3)]
    ramp.color_ramp.elements[0].position = 0.3
    ramp.color_ramp.elements[0].color = (*lo, 1.0)
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = (*hi, 1.0)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    if bump > 0:
        bmp = nt.nodes.new("ShaderNodeBump")
        bmp.inputs["Strength"].default_value = bump * noise_amount
        fine = nt.nodes.new("ShaderNodeTexNoise")
        fine.inputs["Scale"].default_value = noise_scale * 12
        nt.links.new(coord.outputs["Object"], fine.inputs["Vector"])
        nt.links.new(fine.outputs["Fac"], bmp.inputs["Height"])
        nt.links.new(bmp.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def mesh_object(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    ob.data.materials.append(mat)
    return ob


def add_box(bm, cx, cy, cz, sx, sy, sz):
    """Axis-aligned box by centre and full size, in metres."""
    m = bmesh.ops.create_cube(bm, size=1.0)
    for v in m["verts"]:
        v.co.x = cx + v.co.x * sx
        v.co.y = cy + v.co.y * sy
        v.co.z = cz + v.co.z * sz


def add_cylinder(bm, cx, cy, cz, r, h, axis="Z", segs=16):
    m = bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=h)
    for v in m["verts"]:
        x, y, z = v.co
        if axis == "X":
            x, z = z, x
        elif axis == "Y":
            y, z = z, y
        v.co = Vector((cx + x, cy + y, cz + z))


# ---------- map ----------

class MapData:
    def __init__(self, path):
        with open(path) as f:
            d = json.load(f)
        self.d = d
        self.cols = d["cols"]
        self.rows = d["rows"]
        self.cells = d["cells"]
        self.deco = d["deco"]

    def tile(self, x, y):
        # outside the map is open ground here (the sim treats it as wall for movement only)
        if x < 0 or y < 0 or x >= self.cols or y >= self.rows:
            return "."
        return self.cells[y * self.cols + x]

    def deco_at(self, x, y):
        if x < 0 or y < 0 or x >= self.cols or y >= self.rows:
            return 0
        return self.deco[y * self.cols + x]


def build(md, region, look, figures=True, margin=8):
    # build past the camera's region so ground and walls run off the frame edges
    x0, y0, x1, y1 = region[0] - margin, region[1] - margin, region[2] + margin, region[3] + margin
    L = LOOKS[look]
    T = TILE_M
    mats = {
        "sand": material("sand", L["sand"], noise_scale=0.35, noise_amount=L["noise"]),
        "yard": material("yard", L["yard"], noise_scale=0.6, noise_amount=L["noise"]),
        "concrete": material("concrete", L["concrete"], noise_scale=1.2, noise_amount=L["noise"], bump=0.08),
        "steel": material("steel", L["steel"], rough=0.55, metallic=0.4),
        "machine": material("machine", L["machine"], rough=0.6, metallic=0.2),
        "wood": material("wood", L["wood"], noise_scale=3.0, noise_amount=L["noise"], bump=0.1),
        "dark": material("dark", (0.08, 0.08, 0.08), rough=0.8),
        "fatigue": material("fatigue", (0.22, 0.25, 0.18), rough=0.95),
        "khaki": material("khaki", (0.42, 0.38, 0.28), rough=0.95),
        "skin": material("skin", (0.45, 0.32, 0.24), rough=0.8),
        "lamp": material("lamp", (0.2, 0.2, 0.2), rough=0.5),
        # Phase 4 guides for the paint-over: the road, scrub where the hiding spots are, the LZ pad
        "road": material("road", tuple(tuple(c * 0.78 for c in col) for col in L["sand"]), noise_scale=0.8, noise_amount=L["noise"]),
        "scrub": material("scrub", ((0.20, 0.22, 0.13), (0.26, 0.27, 0.16)), noise_scale=4.0, noise_amount=1.0, bump=0.2),
    }

    # ground, one mesh per surface type; one tile of margin past the region
    surfaces = {0: bmesh.new(), 3: bmesh.new(), 1: bmesh.new(), 2: bmesh.new()}
    for y in range(y0 - 1, y1 + 1):
        for x in range(x0 - 1, x1 + 1):
            bm = surfaces.get(md.deco_at(x, y), surfaces[0])
            a = sim_to_world(x, y)
            vs = [bm.verts.new(a + Vector(o)) for o in ((0, 0, 0), (T, 0, 0), (T, -T, 0), (0, -T, 0))]
            bm.faces.new(vs)
    for k, bm in surfaces.items():
        mesh_object(f"ground_{k}", bm, mats["yard"] if k in (2, 3) else mats["road"] if k == 1 else mats["sand"])

    # walls: one box per straight run of wall tiles, through tile centres.
    # Overlapping per-tile boxes leave duplicate faces that render black.
    walls = bmesh.new()
    wall = lambda x, y: md.tile(x, y) == "#"
    door = lambda x, y: md.tile(x, y) == "D"
    half = WALL_T / 2
    in_h_run = lambda x, y: wall(x, y) and (wall(x - 1, y) or wall(x + 1, y))
    in_v_run = lambda x, y: wall(x, y) and (wall(x, y - 1) or wall(x, y + 1))

    def box_between(ax, ay, bx, by, cap_long=True):
        """Box between two points in sim tile units (inclusive of the wall thickness).
        Caps of vertical runs sit a hair lower and do not overhang their ends,
        so they never share a top face with the horizontal cap they meet."""
        a = sim_to_world(ax, ay)
        b = sim_to_world(bx, by)
        cx, cy = (a.x + b.x) / 2, (a.y + b.y) / 2
        sx = abs(b.x - a.x) + (0 if ax != bx else WALL_T)
        sy = abs(b.y - a.y) + (0 if ay != by else WALL_T)
        add_box(walls, cx, cy, WALL_H / 2, sx, sy, WALL_H)
        if cap_long:
            add_box(walls, cx, cy, WALL_H + 0.06, sx + 0.12, sy + 0.12, 0.12)
        else:
            add_box(walls, cx, cy, WALL_H + 0.055, sx + 0.12, sy, 0.11)

    t_half = half / TILE_M  # half the wall thickness, in tiles
    xr0, xr1 = x0 - 1, x1 + 1
    yr0, yr1 = y0 - 1, y1 + 1
    # horizontal runs
    for y in range(yr0, yr1):
        x = xr0
        while x < xr1:
            if not in_h_run(x, y):
                x += 1
                continue
            s0 = x
            while x + 1 < xr1 and wall(x + 1, y):
                x += 1
            a = s0 + 0.5 - (0.5 if door(s0 - 1, y) else t_half)
            b = x + 0.5 + (0.5 if door(x + 1, y) else t_half)
            box_between(a, y + 0.5, b, y + 0.5)
            x += 1
    # vertical runs, stopping at the face of any horizontal wall they meet
    for x in range(xr0, xr1):
        y = yr0
        while y < yr1:
            if not in_v_run(x, y):
                y += 1
                continue
            s0 = y
            while y + 1 < yr1 and wall(x, y + 1):
                y += 1
            a = s0 + 0.5 + (t_half if in_h_run(x, s0) else -(0.5 if door(x, s0 - 1) else t_half))
            b = y + 0.5 - (t_half if in_h_run(x, y) else -(0.5 if door(x, y + 1) else t_half))
            if b > a:
                box_between(x + 0.5, a, x + 0.5, b, cap_long=False)
            y += 1
    # lone posts
    for y in range(yr0, yr1):
        for x in range(xr0, xr1):
            if wall(x, y) and not in_h_run(x, y) and not in_v_run(x, y):
                box_between(x + 0.5, y + 0.5 - t_half, x + 0.5, y + 0.5 + t_half)
    mesh_object("walls", walls, mats["concrete"])

    # doors: steel slab in the wall line
    doors = bmesh.new()
    for d in md.d["doors"]:
        x, y = d["x"], d["y"]
        if not (x0 <= x < x1 and y0 <= y < y1):
            continue
        c = sim_to_world(x + 0.5, y + 0.5)
        along_x = wall(x - 1, y) or wall(x + 1, y)
        sx, sy = (T, WALL_T * 0.45) if along_x else (WALL_T * 0.45, T)
        add_box(doors, c.x, c.y, DOOR_H / 2, sx, sy, DOOR_H)
        # frame posts either side
        for k in (-1, 1):
            if along_x:
                add_box(doors, c.x + k * (T / 2 - 0.06), c.y, WALL_H / 2, 0.12, WALL_T + 0.04, WALL_H)
            else:
                add_box(doors, c.x, c.y + k * (T / 2 - 0.06), WALL_H / 2, WALL_T + 0.04, 0.12, WALL_H)
    mesh_object("doors", doors, mats["steel"])

    # generator: skid, body, radiator, tank, exhaust
    g = md.d["generator"]
    if x0 <= g["x"] < x1 and y0 <= g["y"] < y1:
        c = sim_to_world(g["x"] + g["w"] / 2, g["y"] + g["h"] / 2)
        gen = bmesh.new()
        add_box(gen, c.x, c.y, 0.08, 2.9, 2.6, 0.16)
        add_box(gen, c.x - 0.2, c.y, 0.95, 2.2, 1.7, 1.6)
        add_box(gen, c.x + 1.15, c.y, 0.85, 0.35, 1.5, 1.4)
        mesh_object("generator", gen, mats["machine"])
        tank = bmesh.new()
        add_cylinder(tank, c.x - 0.2, c.y + 1.05, 0.55, 0.32, 2.0, axis="X")
        add_cylinder(tank, c.x - 0.8, c.y - 0.4, 2.1, 0.09, 0.9)
        mesh_object("generator_parts", tank, mats["steel"])

    # crates
    crates = bmesh.new()
    for y in range(y0, y1):
        for x in range(x0, x1):
            if md.tile(x, y) != "c":
                continue
            c = sim_to_world(x + 0.5, y + 0.5)
            add_box(crates, c.x, c.y, 0.6, 1.25, 1.25, 1.2)
            if (x + y) % 2 == 0:  # a smaller crate stacked on every other one
                add_box(crates, c.x + 0.1, c.y - 0.05, 1.55, 0.9, 0.9, 0.7)
    mesh_object("crates", crates, mats["wood"])

    # buildings: one block per footprint with a parapet roof
    bld = bmesh.new()
    roof = bmesh.new()
    for b in md.d["buildings"]:
        if b["x1"] < x0 or b["x0"] >= x1 or b["y1"] < y0 or b["y0"] >= y1:
            continue
        a = sim_to_world(b["x0"] + 0.1, b["y0"] + 0.1)
        c = sim_to_world(b["x1"] + 0.9, b["y1"] + 0.9)
        cx, cy = (a.x + c.x) / 2, (a.y + c.y) / 2
        sx, sy = abs(c.x - a.x), abs(c.y - a.y)
        add_box(bld, cx, cy, BUILDING_H / 2, sx, sy, BUILDING_H)
        add_box(roof, cx, cy, BUILDING_H + 0.01, sx - 0.5, sy - 0.5, 0.04)
    mesh_object("buildings", bld, mats["concrete"])
    mesh_object("roofs", roof, mats["steel"])

    # launcher trucks: chassis, cab, missile on a cradle
    trucks = bmesh.new()
    missiles = bmesh.new()
    for l in md.d["launchers"]:
        if not (x0 <= l["x"] < x1 and y0 <= l["y"] < y1):
            continue
        a = sim_to_world(l["x"], l["y"] + 0.5)
        length = l["w"] * T
        cy = a.y
        add_box(trucks, a.x + length / 2, cy, 0.75, length - 0.2, 1.3, 0.7)
        add_box(trucks, a.x + length - 0.6, cy, 1.4, 0.9, 1.3, 0.8)
        add_cylinder(missiles, a.x + length / 2 - 0.4, cy, 1.55, 0.28, length - 1.2, axis="X")
    mesh_object("trucks", trucks, mats["machine"])
    mesh_object("missiles", missiles, mats["concrete"])

    # searchlight towers: pole and lamp head
    towers = bmesh.new()
    for t in md.d["towers"]:
        if not (x0 <= t["x"] < x1 and y0 <= t["y"] < y1):
            continue
        c = sim_to_world(t["x"] + 0.5, t["y"] + 0.5)
        add_box(towers, c.x, c.y, 2.5, 0.25, 0.25, 5.0)
        add_box(towers, c.x, c.y, 5.1, 0.6, 0.6, 0.4)
    mesh_object("towers", towers, mats["steel"])

    # a wall lamp inside the yard's north wall, above the generator (the night light source)
    lamp_pos = sim_to_world(16.0, 21.5 + WALL_T / (2 * T) + 0.05, WALL_H - 0.25)
    lamp = bmesh.new()
    add_box(lamp, lamp_pos.x, lamp_pos.y - 0.12, lamp_pos.z, 0.35, 0.25, 0.18)
    mesh_object("lamp_fixture", lamp, mats["lamp"])

    # chain-link fence (Phase 3, Itai cuts it): a post per tile and a top rail; the paint-over
    # draws the mesh between them
    fence = bmesh.new()
    for y in range(y0, y1):
        for x in range(x0, x1):
            if md.tile(x, y) != "F":
                continue
            c = sim_to_world(x + 0.5, y + 0.5)
            add_box(fence, c.x, c.y, 1.0, 0.08, 0.08, 2.0)
            run_x = md.tile(x + 1, y) == "F" or md.tile(x - 1, y) == "F"
            add_box(fence, c.x, c.y, 1.95, T if run_x else 0.05, 0.05 if run_x else T, 0.05)
    mesh_object("fence", fence, mats["steel"])

    # hiding spots: low scrub, a few bushes per tile (deterministic, so plates repeat)
    scrub = bmesh.new()
    for h in md.d.get("hides", []):
        for y in range(h["y0"], h["y1"] + 1):
            for x in range(h["x0"], h["x1"] + 1):
                if not (x0 <= x < x1 and y0 <= y < y1):
                    continue
                for k, (dx, dy, r) in enumerate(((0.3, 0.35, 0.55), (0.7, 0.3, 0.45), (0.5, 0.72, 0.5))):
                    c = sim_to_world(x + dx, y + dy)
                    ball = bmesh.ops.create_uvsphere(scrub, u_segments=10, v_segments=6, radius=r)
                    for v in ball["verts"]:
                        v.co = Vector((c.x + v.co.x, c.y + v.co.y, max(0.0, v.co.z * 1.1 + 0.15)))
    mesh_object("scrub", scrub, mats["scrub"])

    # the landing zone: a round concrete pad with a painted ring
    lz = md.d.get("lz")
    if lz:
        cx, cy = (lz["x0"] + lz["x1"] + 1) / 2, (lz["y0"] + lz["y1"] + 1) / 2
        if x0 <= cx < x1 and y0 <= cy < y1:
            c = sim_to_world(cx, cy)
            r = min(lz["x1"] - lz["x0"] + 1, lz["y1"] - lz["y0"] + 1) * T / 2 - 0.4
            pad = bmesh.new()
            add_cylinder(pad, c.x, c.y, 0.03, r, 0.06, segs=48)
            mesh_object("lz_pad", pad, mats["concrete"])
            ring = bmesh.new()
            add_cylinder(ring, c.x, c.y, 0.065, r * 0.72, 0.02, segs=48)
            mesh_object("lz_ring", ring, mats["dark"])
            inner = bmesh.new()
            add_cylinder(inner, c.x, c.y, 0.07, r * 0.64, 0.02, segs=48)
            mesh_object("lz_inner", inner, mats["concrete"])

    # scale figures: Yoav outside the gate, the yard guard on his post
    for name, (sx, sy), body in () if not figures else (("yoav", (16.6, 28.4), mats["fatigue"]), ("guard", (18.5, 23.5), mats["khaki"])):
        if not (x0 <= sx < x1 and y0 <= sy < y1):
            continue
        p = sim_to_world(sx, sy)
        fig = bmesh.new()
        add_cylinder(fig, p.x, p.y, 0.45, 0.13, 0.9, segs=12)  # legs
        add_cylinder(fig, p.x, p.y, 1.15, 0.2, 0.6, segs=12)  # torso
        mesh_object(f"{name}_body", fig, body)
        head = bmesh.new()
        bmesh.ops.create_uvsphere(head, u_segments=12, v_segments=8, radius=0.13)
        for v in head.verts:
            v.co += Vector((p.x, p.y, FIGURE_H - 0.13))
        mesh_object(f"{name}_head", head, mats["skin"])

    return {"lamp": lamp_pos}


def setup_light(L):
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = L["sun_strength"]
    sun.color = L["sun"]
    sun.angle = math.radians(1.5)
    ob = bpy.data.objects.new("sun", sun)
    bpy.context.scene.collection.objects.link(ob)
    to_sun = Vector((SUN_GROUND.x * math.cos(SUN_ELEVATION), SUN_GROUND.y * math.cos(SUN_ELEVATION), math.sin(SUN_ELEVATION)))
    ob.rotation_euler = (-to_sun).to_track_quat("-Z", "Y").to_euler()

    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*L["sky"], 1.0)
    bg.inputs["Strength"].default_value = L["sky_strength"]
    bpy.context.scene.world = world


def setup_camera(region, top_px, supersample):
    x0, y0, x1, y1 = region
    scene = bpy.context.scene
    T = TILE_M
    # image size in px at 100% zoom: the region's iso diamond plus headroom for tall things
    w_px = ((x1 - x0) + (y1 - y0)) * TILE_PX_W / 2
    h_px = ((x1 - x0) + (y1 - y0)) * TILE_PX_W / 4 + top_px
    cam_data = bpy.data.cameras.new("cam")
    cam_data.type = "ORTHO"
    # px per metre in the view plane: a tile's diagonal (T * sqrt2 m) is TILE_PX_W px wide
    px_per_m = TILE_PX_W / (T * math.sqrt(2))
    cam_data.ortho_scale = max(w_px, h_px) / px_per_m
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    # look at the region centre, shifted up by half the headroom so tall things fit
    centre = sim_to_world((x0 + x1) / 2, (y0 + y1) / 2)
    view_dir = Vector((-math.sin(CAM_TILT) / math.sqrt(2), math.sin(CAM_TILT) / math.sqrt(2), -math.cos(CAM_TILT)))
    cam.location = centre - view_dir * 200
    cam.rotation_euler = view_dir.to_track_quat("-Z", "Y").to_euler()
    bpy.context.view_layer.update()
    up = cam.matrix_world.to_3x3() @ Vector((0, 1, 0))
    cam.location += up * (top_px / 2) / px_per_m
    scene.render.resolution_x = int(round(w_px * supersample))
    scene.render.resolution_y = int(round(h_px * supersample))
    scene.render.resolution_percentage = 100
    bpy.context.view_layer.update()
    return cam


def project(cam, p):
    scene = bpy.context.scene
    v = world_to_camera_view(scene, cam, p)
    return (v.x * scene.render.resolution_x, (1 - v.y) * scene.render.resolution_y)


def setup_render(look, samples):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scene.cycles.device = "GPU"
    except Exception:
        scene.cycles.device = "CPU"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    if LOOKS[look]["outline"]:
        scene.render.use_freestyle = True
        fs = scene.view_layers[0].freestyle_settings
        ls = fs.linesets[0] if fs.linesets else fs.linesets.new("lines")
        if ls.linestyle is None:
            ls.linestyle = bpy.data.linestyles.new("ink")
        ls.linestyle.color = (0.12, 0.11, 0.09)
        ls.linestyle.thickness = 1.6
        ls.select_by_visibility = True
        ls.select_silhouette = True
        ls.select_border = True
        ls.select_crease = True


def tile_id_material():
    """Emission colour = the sim tile that owns the surface: R = x / 255, G = y / 255, B = 1.
    The sample point is pushed 1 cm inside the solid along the normal, so faces that lie
    exactly on a tile edge still pick the tile their volume is in."""
    mat = bpy.data.materials.new("tile_id")
    mat.use_nodes = True
    nt = mat.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    inward = nt.nodes.new("ShaderNodeVectorMath")
    inward.operation = "SCALE"
    inward.inputs["Scale"].default_value = -0.01
    nt.links.new(geo.outputs["Normal"], inward.inputs[0])
    pos = nt.nodes.new("ShaderNodeVectorMath")
    pos.operation = "ADD"
    nt.links.new(geo.outputs["Position"], pos.inputs[0])
    nt.links.new(inward.outputs["Vector"], pos.inputs[1])
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(pos.outputs["Vector"], sep.inputs["Vector"])

    def tile_channel(axis_out, sign):
        m1 = nt.nodes.new("ShaderNodeMath")
        m1.operation = "MULTIPLY"
        m1.inputs[1].default_value = sign / TILE_M
        nt.links.new(axis_out, m1.inputs[0])
        fl = nt.nodes.new("ShaderNodeMath")
        fl.operation = "FLOOR"
        nt.links.new(m1.outputs[0], fl.inputs[0])
        sc = nt.nodes.new("ShaderNodeMath")
        sc.operation = "DIVIDE"
        sc.inputs[1].default_value = 255.0
        nt.links.new(fl.outputs[0], sc.inputs[0])
        return sc.outputs[0]

    comb = nt.nodes.new("ShaderNodeCombineXYZ")
    nt.links.new(tile_channel(sep.outputs["X"], 1.0), comb.inputs["X"])
    nt.links.new(tile_channel(sep.outputs["Y"], -1.0), comb.inputs["Y"])
    comb.inputs["Z"].default_value = 1.0
    nt.links.new(comb.outputs["Vector"], emit.inputs["Color"])
    emit.inputs["Strength"].default_value = 1.0
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    return mat


def setup_id_pass():
    """Flat, unlit, unfiltered render of tile IDs. Ground is black (not an occluder)."""
    scene = bpy.context.scene
    tid = tile_id_material()
    black = bpy.data.materials.new("id_black")
    black.use_nodes = True
    bsdf = black.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0, 0, 0, 1)
    for ob in scene.objects:
        if ob.type != "MESH":
            continue
        ob.data.materials.clear()
        ob.data.materials.append(black if ob.name.startswith("ground") else tid)
    for ob in list(scene.objects):
        if ob.type == "LIGHT":
            bpy.data.objects.remove(ob)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.0
    scene.cycles.samples = 1
    scene.cycles.use_denoising = False
    scene.cycles.filter_width = 0.01
    scene.render.use_freestyle = False
    scene.render.dither_intensity = 0.0
    scene.view_settings.view_transform = "Raw"
    scene.render.image_settings.color_depth = "8"


def main():
    global WALL_H
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument("--map", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--name", default="region")
    ap.add_argument("--region", type=int, nargs=4, required=True, metavar=("X0", "Y0", "X1", "Y1"))
    ap.add_argument("--look", default="B", choices=sorted(LOOKS))
    ap.add_argument("--top", type=int, default=96, help="px of headroom above the region for tall objects")
    ap.add_argument("--supersample", type=int, default=2)
    ap.add_argument("--samples", type=int, default=96)
    ap.add_argument("--wall-h", type=float, default=WALL_H, help="wall height in metres")
    ap.add_argument("--no-figures", action="store_true", help="leave out the scale figures (clean plate for painting)")
    ap.add_argument("--margin", type=int, default=8, help="tiles built beyond the region so the frame is full")
    ap.add_argument("--suffix", default="", help="added to the output file names")
    ap.add_argument("--id-pass", action="store_true", help="render tile IDs instead of the lit image (occluder masks)")
    a = ap.parse_args(argv)

    reset_scene()
    md = MapData(a.map)
    region = tuple(a.region)
    L = LOOKS[a.look]
    WALL_H = a.wall_h
    info = build(md, region, a.look, figures=not a.no_figures, margin=a.margin)
    setup_light(L)
    cam = setup_camera(region, a.top, a.supersample)
    setup_render(a.look, a.samples)
    if a.id_pass:
        setup_id_pass()

    os.makedirs(a.out, exist_ok=True)
    stem = f"{a.name}_{a.look}{a.suffix}"
    scene = bpy.context.scene
    scene.render.filepath = os.path.abspath(os.path.join(a.out, f"{stem}_{'id' if a.id_pass else 'day'}.png"))
    bpy.ops.render.render(write_still=True)

    ss = a.supersample
    o = project(cam, sim_to_world(0, 0))
    ox, oy = project(cam, sim_to_world(1, 0))
    meta = {
        "look": a.look,
        "label": L["label"],
        "region": region,
        "supersample": ss,
        "size": [scene.render.resolution_x, scene.render.resolution_y],
        # pixel position of sim tile corner (0, 0) in the image, at render resolution
        "origin_px": [round(o[0], 3), round(o[1], 3)],
        # sanity check: one tile step in +x should be (+32, +16) px times supersample
        "step_x_px": [round(ox - o[0], 3), round(oy - o[1], 3)],
        "lamp_px": [round(v, 2) for v in project(cam, info["lamp"])],
        "lamp_ground_px": [round(v, 2) for v in project(cam, Vector((info["lamp"].x, info["lamp"].y - 2.0, 0)))],
        "tile_m": TILE_M,
        "figure_h_m": FIGURE_H,
        "wall_h_m": WALL_H,
    }
    if not a.id_pass:  # an ID pass shares the lit render's camera; keep its sidecar untouched
        with open(os.path.join(a.out, f"{stem}.json"), "w") as f:
            json.dump(meta, f, indent=2)
    print("META", json.dumps(meta))


if __name__ == "__main__":  # importable by render_unit.py
    main()
