// Reads a Tiled map (maps/*.tmj, orthogonal, 24 px tiles) into mission data.
// The map holds data only (CLAUDE.md): which tiles block, where things stand,
// guard posts and routes, spawns. Tiled's tiles are editor colours, never art.
//
// Layers:
//   ground   tile layer, tile id = sim deco (0 sand, 1 road, 2 slab, 3 yard)
//   walls    tile layer, tile 4 = wall '#', tile 5 = crate 'c', empty = open
//   objects  rectangles, type building | door | generator | tower | launcher | hide;
//            the name is the label. Towers need float props a0, a1 (degrees), period, phase.
//            hide = a bush or dark corner (a hiding spot); it blocks nothing.
//   guards   type post (point; props face, sweep in degrees, spin) or
//            patrol (polyline = there and back, polygon = loop). Layer order = guard order.
//   spawns   points of type unit named shadow | lure | sapper, and one rectangle of type lz.
// Objects are stamped over the walls layer, so a door placed on a wall replaces it.

import { PROTO_TILE_PX as T } from './constants';
import type { Building, Door, Generator, Launcher, TileCode, Tower, UnitId } from './types';

const D = Math.PI / 180;

export type GuardDef =
  | { kind: 'patrol'; route: [number, number][]; loop: boolean }
  | { kind: 'post'; at: [number, number]; face: number; sweep?: number; spin?: boolean };

/** Inclusive tile bounds. */
export interface TileRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface MissionMap {
  name: string;
  cols: number;
  rows: number;
  cells: TileCode[];
  deco: Uint8Array;
  buildings: Building[];
  doors: Door[];
  generator: Generator;
  towers: Tower[];
  launchers: Launcher[];
  guards: GuardDef[];
  spawns: Record<UnitId, [number, number]>;
  lz: TileRect;
  hides: TileRect[];
}

interface TProp {
  name: string;
  value: unknown;
}
interface TObject {
  id: number;
  name: string;
  type?: string;
  class?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  point?: boolean;
  polyline?: { x: number; y: number }[];
  polygon?: { x: number; y: number }[];
  properties?: TProp[];
}
interface TLayer {
  name: string;
  type: string;
  data?: number[];
  objects?: TObject[];
}
interface TMap {
  width: number;
  height: number;
  tilewidth: number;
  orientation: string;
  infinite: boolean;
  layers: TLayer[];
  properties?: TProp[];
  tilesets: { firstgid: number }[];
}

const UNIT_IDS: readonly UnitId[] = ['shadow', 'lure', 'sapper'];
const WALL_TILES: Record<number, TileCode> = { 4: '#', 5: 'c' };

export function parseTiledMap(json: unknown): MissionMap {
  const m = json as TMap;
  const fail = (msg: string): never => {
    throw new Error(`Tiled map: ${msg}`);
  };
  if (m.orientation !== 'orthogonal' || m.infinite) fail('must be orthogonal and not infinite');
  if (m.tilewidth !== T) fail(`tiles must be ${T} px, got ${m.tilewidth}`);
  const cols = m.width;
  const rows = m.height;
  const firstgid = m.tilesets[0]?.firstgid ?? 1;

  const layer = (name: string, type: string): TLayer => {
    const l = m.layers.find((x) => x.name === name);
    if (!l || l.type !== type) return fail(`missing ${type} "${name}"`);
    return l;
  };
  const tiles = (name: string): number[] => {
    const data = layer(name, 'tilelayer').data;
    if (!data || data.length !== cols * rows) return fail(`layer "${name}" must be ${cols} x ${rows} (uncompressed CSV)`);
    return data.map((gid) => (gid === 0 ? -1 : (gid & 0x1fffffff) - firstgid)); // strip flip flags
  };
  const objects = (name: string): TObject[] => layer(name, 'objectgroup').objects ?? [];
  const kind = (o: TObject): string => o.type || o.class || '';
  const props = (o: TObject): Record<string, unknown> =>
    Object.fromEntries((o.properties ?? []).map((p) => [p.name, p.value]));
  const num = (o: TObject, key: string, fallback?: number): number => {
    const v = props(o)[key];
    if (typeof v === 'number') return v;
    if (fallback !== undefined) return fallback;
    return fail(`${kind(o)} "${o.name}" (id ${o.id}) needs number property "${key}"`);
  };
  /** Tile rectangle of a rectangle object; it must snap to the grid. */
  const box = (o: TObject): { x: number; y: number; w: number; h: number } => {
    const r = { x: o.x / T, y: o.y / T, w: o.width / T, h: o.height / T };
    if (![r.x, r.y, r.w, r.h].every(Number.isInteger) || r.w < 1 || r.h < 1) {
      fail(`${kind(o)} "${o.name}" (id ${o.id}) must snap to whole tiles`);
    }
    return r;
  };
  const tileOfPx = (px: number, py: number): [number, number] => [Math.floor(px / T), Math.floor(py / T)];

  // tiles
  const deco = new Uint8Array(cols * rows);
  tiles('ground').forEach((t, i) => {
    deco[i] = t >= 0 && t <= 3 ? t : 0;
  });
  const cells = tiles('walls').map((t): TileCode => (t < 0 ? '.' : (WALL_TILES[t] ?? '.')));
  const stamp = (x: number, y: number, w: number, h: number, c: TileCode): void => {
    for (let ty = y; ty < y + h; ty++) {
      for (let tx = x; tx < x + w; tx++) if (tx >= 0 && ty >= 0 && tx < cols && ty < rows) cells[ty * cols + tx] = c;
    }
  };

  // objects
  const buildings: Building[] = [];
  const doors: Door[] = [];
  const towers: Tower[] = [];
  const launchers: Launcher[] = [];
  const hides: TileRect[] = [];
  let generator: Generator | null = null;
  for (const o of objects('objects')) {
    const b = box(o);
    switch (kind(o)) {
      case 'building':
        buildings.push({ x0: b.x, y0: b.y, x1: b.x + b.w - 1, y1: b.y + b.h - 1, label: o.name });
        stamp(b.x, b.y, b.w, b.h, 'B');
        break;
      case 'door':
        doors.push({ x: b.x, y: b.y, open: false, label: o.name });
        stamp(b.x, b.y, 1, 1, 'D');
        break;
      case 'generator':
        if (generator) fail('only one generator is allowed');
        generator = { x: b.x, y: b.y, w: b.w, h: b.h, on: true };
        stamp(b.x, b.y, b.w, b.h, 'G');
        break;
      case 'tower':
        towers.push({
          x: b.x,
          y: b.y,
          a0: num(o, 'a0') * D,
          a1: num(o, 'a1') * D,
          period: num(o, 'period'),
          phase: num(o, 'phase', 0),
          susp: 0,
          ang: 0,
        });
        stamp(b.x, b.y, 1, 1, 'T');
        break;
      case 'launcher':
        launchers.push({ x: b.x, y: b.y, w: b.w, h: b.h, name: o.name, done: false });
        stamp(b.x, b.y, b.w, b.h, 'L');
        break;
      case 'hide':
        hides.push({ x0: b.x, y0: b.y, x1: b.x + b.w - 1, y1: b.y + b.h - 1 });
        break;
      default:
        fail(`unknown object type "${kind(o)}" on "${o.name}" (id ${o.id})`);
    }
  }
  if (!generator) fail('needs a generator');
  if (launchers.length === 0) fail('needs at least one launcher');

  // guards
  const guards: GuardDef[] = objects('guards').map((o): GuardDef => {
    if (kind(o) === 'post') {
      if (!o.point) fail(`post "${o.name}" (id ${o.id}) must be a point`);
      const p = props(o);
      return {
        kind: 'post',
        at: tileOfPx(o.x, o.y),
        face: num(o, 'face'),
        ...(typeof p.sweep === 'number' ? { sweep: p.sweep } : {}),
        ...(p.spin === true ? { spin: true } : {}),
      };
    }
    if (kind(o) === 'patrol') {
      const pts = o.polygon ?? o.polyline;
      if (!pts || pts.length < 2) return fail(`patrol "${o.name}" (id ${o.id}) needs a polyline or polygon of 2+ points`);
      return { kind: 'patrol', route: pts.map((p) => tileOfPx(o.x + p.x, o.y + p.y)), loop: !!o.polygon };
    }
    return fail(`unknown guard type "${kind(o)}" on "${o.name}" (id ${o.id})`);
  });

  // spawns
  const spawns: Partial<Record<UnitId, [number, number]>> = {};
  let lz: TileRect | null = null;
  for (const o of objects('spawns')) {
    if (kind(o) === 'unit') {
      if (!UNIT_IDS.includes(o.name as UnitId)) fail(`unit spawn name must be one of ${UNIT_IDS.join(', ')}, got "${o.name}"`);
      spawns[o.name as UnitId] = tileOfPx(o.x, o.y);
    } else if (kind(o) === 'lz') {
      const b = box(o);
      lz = { x0: b.x, y0: b.y, x1: b.x + b.w - 1, y1: b.y + b.h - 1 };
    } else fail(`unknown spawn type "${kind(o)}" on "${o.name}" (id ${o.id})`);
  }
  for (const id of UNIT_IDS) if (!spawns[id]) fail(`missing spawn for ${id}`);
  if (!lz) fail('needs a landing zone (type lz)');

  const name = m.properties?.find((p) => p.name === 'name')?.value;
  return {
    name: typeof name === 'string' ? name : 'Untitled',
    cols,
    rows,
    cells,
    deco,
    buildings,
    doors,
    generator: generator!,
    towers,
    launchers,
    guards,
    spawns: spawns as Record<UnitId, [number, number]>,
    lz: lz!,
    hides,
  };
}
