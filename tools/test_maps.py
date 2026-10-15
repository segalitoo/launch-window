"""Writes the test maps (Phase 3, Ran): one small puzzle per tool, maps/tests/<id>.tmj.

Usage: python3 tools/test_maps.py
Then open any of them in Tiled to adjust; rerun only to start one over from its layout here
(it overwrites). src/sim/puzzles.test.ts solves each one by script, with no alarm, and walks
the naive way (straight to the exit) to show the tool is needed.

Layout characters:
  #  wall     c  crate     F  fence     .  ground     D  locked door     G  generator (1 tile)
  h  hiding spot (ground)  E  exit zone  L  landing zone
  y  Yoav     n  Noa       i  Itai      (spawns, part of the landing zone)
Guards, in order (Tiled layer order = guard index):
  ("post", x, y, face, sweep[, role])     ("patrol", [(x, y), ...], loop[, role])
  ("dog", x, y, handler)                  handler = guard number, counted from 1
Cameras: (x, y, a0, a1, period[, phase]); they sit on wall tiles.
Every map: goal exit, strict (any alarm fails the run), and its own clock.
"""

import json
import os

T = 24
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "maps", "tests")
WALL_GID = {"#": 5, "c": 6, "F": 7}  # editor tiles 4, 5, 6, firstgid 1

MAPS = [
    {
        "id": "knife", "name": "Knife and drag", "who": "Yoav",
        "brief": "Take the sentry from behind while the patrol walks away, drag the body out of his sight, then take the patrol.",
        "time": 300,
        "layout": [
            "######################",
            "#....#...............#",
            "#....#...............#",
            "#LLL.###########.....#",
            "#LyL...............EE#",
            "#LLL...............EE#",
            "#LLL.###########.....#",
            "#....#...............#",
            "#....#...............#",
            "#....#..............G#",
            "######################",
        ],
        "guards": [("post", 8, 4, 0, 15), ("patrol", [(11, 5), (17, 5)], False)],
    },
    {
        "id": "hide", "name": "Hiding spot", "who": "Yoav",
        "brief": "The patrol circles the yard. Wait in the bush while he passes: standing still there, only a guard very close can see you.",
        "time": 300,
        "layout": [
            "######################",
            "#....................#",
            "#....................#",
            "#....................#",
            "#LLL...............EE#",
            "#LyL......hh.......EE#",
            "#LLL...............EE#",
            "#....................#",
            "#....................#",
            "#...................G#",
            "######################",
        ],
        "guards": [("patrol", [(5, 9), (5, 1), (16, 1), (16, 9)], True)],
    },
    {
        "id": "decoy", "name": "Decoy", "who": "Noa",
        "brief": "The sentry stares at the only gap. Throw a decoy (T) behind him; he goes to look, and you slip through.",
        "time": 300,
        "layout": [
            "######################",
            "#......#...........EE#",
            "#......#...........EE#",
            "#......#.............#",
            "#LLL...#.............#",
            "#LnL.................#",
            "#LLL...#.............#",
            "#......#.............#",
            "#......#.............#",
            "#......#............G#",
            "######################",
        ],
        "guards": [("post", 10, 5, 180, 15)],
    },
    {
        "id": "smoke", "name": "Smoke", "who": "Noa",
        "brief": "Two sentries watch the passage from both sides. Throw smoke (V) between them and walk through the cloud.",
        "time": 300,
        "layout": [
            "######################",
            "#...#############....#",
            "#...#############....#",
            "#....................#",
            "#LLL...............EE#",
            "#LnL...............EE#",
            "#LLL...............EE#",
            "#....................#",
            "#...#############....#",
            "#...#############...G#",
            "######################",
        ],
        "guards": [("post", 11, 3, 90, 0), ("post", 11, 7, 270, 0)],
    },
    {
        "id": "uniform", "name": "Uniform and binoculars", "who": "Noa",
        "brief": "Put on the uniform (U) out of sight and walk past the sentries. The officer is not fooled: watch him with the binoculars (B) and pass while he is away.",
        "time": 300,
        "layout": [
            "######################",
            "#....#...........#...#",
            "#....#...........#...#",
            "#....######.######...#",
            "#....................#",
            "#LLL...............EE#",
            "#LnL...............EE#",
            "#LLL...............EE#",
            "#....................#",
            "#....######.######...#",
            "#....#...........#...#",
            "#....#...........#..G#",
            "######################",
        ],
        "guards": [
            ("post", 8, 4, 90, 30),
            ("post", 14, 8, 270, 30),
            ("patrol", [(11, 1), (11, 11)], False, "officer"),
        ],
    },
    {
        "id": "fence", "name": "Wire cutters and tripwire", "who": "Itai",
        "brief": "A sentry watches the gap in the fence. Stop the patrol with a tripwire (J) on his path, then crawl (C) along the fence, out of the sentry's sight, and cut your own way through (tap it).",
        "time": 300,
        "layout": [
            "######################",
            "#.............F....EE#",
            "#.............F....EE#",
            "#.............F......#",
            "#LLL..........F......#",
            "#LiL.................#",
            "#LLL..........F......#",
            "#.............F......#",
            "#.............F......#",
            "#.............F.....G#",
            "######################",
        ],
        "guards": [("post", 15, 5, 180, 10), ("patrol", [(8, 1), (8, 9)], False)],
    },
    {
        "id": "charge", "name": "Remote charge", "who": "Itai",
        "brief": "Two sentries hold the gate. Plant the charge (K) far from it, get clear, set it off (L): they go to look, and the gate is yours.",
        "time": 300,
        "layout": [
            "######################",
            "#...........#......EE#",
            "#...........#......EE#",
            "#...........#........#",
            "#LLL.................#",
            "#LiL.................#",
            "#LLL.................#",
            "#...........#........#",
            "#...........#........#",
            "#...........#.......G#",
            "######################",
        ],
        "guards": [("post", 14, 4, 180, 15), ("post", 14, 6, 180, 15)],
    },
    {
        "id": "dog", "name": "Guns and the dog", "who": "Yoav",
        "brief": "The dog smells you within 3 tiles, hidden or not, and its bark brings the guards. Silenced shots (F): the handler first, then the dog, from just out of its reach.",
        "time": 300,
        "layout": [
            "######################",
            "#....#...............#",
            "#....#...............#",
            "#LLL.###########.....#",
            "#LLL...............EE#",
            "#LyL...............EE#",
            "#LLL...............EE#",
            "#LLL.###########.....#",
            "#....#...............#",
            "#....#..............G#",
            "######################",
        ],
        "guards": [("post", 11, 5, 0, 20), ("post", 15, 8, 90, 10), ("dog", 12, 5, 1)],
    },
    {
        "id": "camera", "name": "Camera", "who": "Itai",
        "brief": "A camera on the pillar watches the only doorway; a second in its view raises the alarm. Cameras run on the generator: cut the power first.",
        "time": 300,
        "layout": [
            "######################",
            "#.........#..........#",
            "#.........#..........#",
            "#....................#",
            "#LLL......#...#....EE#",
            "#LiL......#........EE#",
            "#LLL......#........EE#",
            "#.........#..........#",
            "#.........#..........#",
            "#...G.....#..........#",
            "######################",
        ],
        "guards": [],
        # on a pillar east of the doorway, looking back at it
        "cameras": [(14, 4, 190, 210, 6)],
    },
]


def bbox(cells):
    xs = [x for x, _ in cells]
    ys = [y for _, y in cells]
    return min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1


def build(m):
    rows = m["layout"]
    w, h = len(rows[0]), len(rows)
    assert all(len(r) == w for r in rows), f"{m['id']}: rows differ in length"
    nid = [1]

    def obj(**k):
        o = {"id": nid[0], "name": "", "type": "", "x": 0, "y": 0, "width": 0, "height": 0, "rotation": 0, "visible": True}
        o.update(k)
        nid[0] += 1
        return o

    def rect(name, typ, x, y, ww=1, hh=1, props=None):
        o = obj(name=name, type=typ, x=x * T, y=y * T, width=ww * T, height=hh * T)
        if props:
            o["properties"] = props
        return o

    def point(name, typ, x, y, props=None):
        o = obj(name=name, type=typ, x=(x + 0.5) * T, y=(y + 0.5) * T, point=True)
        if props:
            o["properties"] = props
        return o

    fl = lambda n, v: {"name": n, "type": "float", "value": v}
    walls, objects, spawns, guards = [], [], [], []
    lz, ex = [], []
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            walls.append(WALL_GID.get(ch, 0))
            if ch == "D":
                objects.append(rect("Door", "door", x, y))
            elif ch == "G":
                objects.append(rect("Generator", "generator", x, y))
            elif ch == "h":
                objects.append(rect("Bush", "hide", x, y))
            elif ch == "E":
                ex.append((x, y))
            elif ch in "Lyni":
                lz.append((x, y))
                if ch != "L":
                    unit = {"y": "shadow", "n": "lure", "i": "sapper"}[ch]
                    spawns.append(point(unit, "unit", x, y))
    for c in m.get("cameras", []):
        x, y, a0, a1, period = c[:5]
        objects.append(rect("Camera", "camera", x, y, props=[fl("a0", a0), fl("a1", a1), fl("period", period), fl("phase", c[5] if len(c) > 5 else 0)]))
    for i, g in enumerate(m["guards"]):
        name = f"Guard {i + 1}"
        if g[0] == "post":
            _, x, y, face, sweep, *rest = g
            props = [fl("face", face), fl("sweep", sweep)]
            if rest:
                props.append({"name": "role", "type": "string", "value": rest[0]})
            guards.append(point(name, "post", x, y, props))
        elif g[0] == "patrol":
            _, pts, loop, *rest = g
            x0, y0 = pts[0]
            o = obj(name=name, type="patrol", x=(x0 + 0.5) * T, y=(y0 + 0.5) * T)
            o["polygon" if loop else "polyline"] = [{"x": (px - x0) * T, "y": (py - y0) * T} for px, py in pts]
            if rest:
                o["properties"] = [{"name": "role", "type": "string", "value": rest[0]}]
            guards.append(o)
        elif g[0] == "dog":
            _, x, y, handler = g
            guards.append(point("Dog", "dog", x, y, [{"name": "handler", "type": "int", "value": handler}]))
    x, y, ww, hh = bbox(lz)
    spawns.append(rect("Landing zone", "lz", x, y, ww, hh))
    x, y, ww, hh = bbox(ex)
    assert ww * hh == len(ex), f"{m['id']}: the exit must be a rectangle"
    spawns.append(rect("Exit", "exit", x, y, ww, hh))

    layer = lambda i, name, data: {"id": i, "name": name, "type": "tilelayer", "x": 0, "y": 0, "width": w, "height": h,
                                   "opacity": 1, "visible": True, "data": data}
    group = lambda i, name, color, objs: {"id": i, "name": name, "type": "objectgroup", "x": 0, "y": 0, "opacity": 1,
                                          "visible": True, "draworder": "index", "color": color, "objects": objs}
    return {
        "type": "map", "version": "1.10", "tiledversion": "1.11.2", "orientation": "orthogonal",
        "renderorder": "right-down", "infinite": False, "width": w, "height": h, "tilewidth": T, "tileheight": T,
        "nextlayerid": 6, "nextobjectid": nid[0], "compressionlevel": -1,
        "properties": [
            {"name": "name", "type": "string", "value": m["name"]},
            {"name": "brief", "type": "string", "value": m["brief"]},
            {"name": "who", "type": "string", "value": m["who"]},
            {"name": "goal", "type": "string", "value": "exit"},
            {"name": "strict", "type": "bool", "value": True},
            {"name": "time", "type": "float", "value": m["time"]},
        ],
        "tilesets": [{"firstgid": 1, "name": "editor", "image": "../editor-tiles.png", "imagewidth": 168, "imageheight": 24,
                      "tilewidth": T, "tileheight": T, "tilecount": 7, "columns": 7, "margin": 0, "spacing": 0}],
        "layers": [
            layer(1, "ground", [1] * (w * h)),
            layer(2, "walls", walls),
            group(3, "objects", "#d8c08a", objects),
            group(4, "guards", "#ff6a4d", guards),
            group(5, "spawns", "#7fdc95", spawns),
        ],
    }


def main():
    os.makedirs(OUT, exist_ok=True)
    order = []
    for m in MAPS:
        with open(os.path.join(OUT, f"{m['id']}.tmj"), "w") as fh:
            json.dump(build(m), fh, indent=1)
        order.append(m["id"])
    # the order the list page shows them in
    with open(os.path.join(OUT, "order.json"), "w") as fh:
        json.dump(order, fh)
    print("wrote", len(MAPS), "maps to maps/tests/")


if __name__ == "__main__":
    main()
