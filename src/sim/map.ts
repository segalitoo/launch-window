// Operation Night Lantern: the start state, built from the Tiled map in maps/.
// Ported from newGame() in the prototype; the layout moved to Tiled in Phase 1.

import nightLantern from '../../maps/night-lantern.tmj?raw';
import {
  DECOY_CHARGES,
  GUARD_PHASE_STEP,
  SPEED_LURE,
  SPEED_SAPPER,
  SPEED_SHADOW,
  TIME_LIMIT,
  UNIT_HP,
  UNIT_START_ANG,
  SMOKE_CHARGES,
  REMOTE_CHARGES,
  WIRE_CHARGES,
} from './constants';
import { createGrid } from './grid';
import { center } from './math';
import { type GuardDef, type MissionMap, parseTiledMap } from './tiled';
import type { GameState, Guard, Unit, UnitId, Vec } from './types';

const D = Math.PI / 180;

/** The mission map, parsed once. */
export const NIGHT_LANTERN: MissionMap = parseTiledMap(JSON.parse(nightLantern));

function makeGuard(d: GuardDef, i: number): Guard {
  const g: Guard = {
    i,
    kind: d.kind === 'dog' ? 'post' : d.kind,
    role: d.kind === 'dog' ? 'dog' : d.officer ? 'officer' : 'guard',
    handler: d.kind === 'dog' ? d.handler : -1,
    distract: 0,
    barkCD: 0,
    state: 'patrol',
    x: 0,
    y: 0,
    ang: 0,
    susp: 0,
    suspPt: null,
    path: [],
    wait: 0,
    timer: 0,
    searchBase: 0,
    shootCD: 0,
    seeing: null,
    lastKnown: null,
    found: false,
    ko: 0,
    tied: false,
    dead: false,
    revealed: false,
    carried: false,
    phase: i * GUARD_PHASE_STEP,
    post: null,
    face: 0,
    sweep: 0,
    spin: false,
    route: [],
    loop: false,
    ri: 1,
    dir: 1,
  };
  if (d.kind === 'dog') {
    const p = center(d.at[0], d.at[1]);
    g.x = p.x;
    g.y = p.y;
    g.post = p;
  } else if (d.kind === 'post') {
    const p = center(d.at[0], d.at[1]);
    g.x = p.x;
    g.y = p.y;
    g.post = p;
    g.face = d.face * D;
    g.sweep = (d.sweep ?? 0) * D;
    g.spin = !!d.spin;
    g.ang = d.face * D;
  } else {
    g.route = d.route.map(([x, y]) => center(x, y));
    g.loop = d.loop;
    const a = g.route[0] as Vec;
    const b = g.route[1] as Vec;
    g.x = a.x;
    g.y = a.y;
    g.ang = Math.atan2(b.y - a.y, b.x - a.x);
  }
  return g;
}

function makeUnit(
  o: { id: UnitId; name: string; call: string; color: string; speed: number; charges?: number; smokes?: number; wires?: number; remotes?: number },
  tx: number,
  ty: number,
): Unit {
  return {
    ...center(tx, ty),
    hp: UNIT_HP,
    maxHp: UNIT_HP,
    alive: true,
    crawl: false,
    path: [],
    order: null,
    carrying: null,
    busy: 0,
    ang: UNIT_START_ANG,
    hitT: 0,
    charges: 0,
    silenced: true,
    smokes: 0,
    disguised: false,
    wires: 0,
    remotes: 0,
    remote: null,
    ...o,
  };
}

export function buildMission(seed = 1, map: MissionMap = NIGHT_LANTERN): GameState {
  const grid = createGrid(map.cols, map.rows);
  grid.cells = [...map.cells];
  grid.deco = map.deco.slice();

  const unit = (id: UnitId, o: Omit<Parameters<typeof makeUnit>[0], 'id'>): Unit | null => {
    const at = map.spawns[id];
    return at ? makeUnit({ id, ...o }, ...at) : null;
  };
  const squad: Unit[] = [
    unit('shadow', { name: 'Yoav', call: 'Shadow', color: '#6cc4ff', speed: SPEED_SHADOW }),
    unit('lure', { name: 'Noa', call: 'Lure', color: '#8ef0d0', speed: SPEED_LURE, charges: DECOY_CHARGES, smokes: SMOKE_CHARGES }),
    unit('sapper', { name: 'Itai', call: 'Sapper', color: '#c9b8ff', speed: SPEED_SAPPER, wires: WIRE_CHARGES, remotes: REMOTE_CHARGES }),
  ].filter((u): u is Unit => u !== null);

  // copies: the state mutates these during play, the parsed map must stay clean
  return {
    t: 0,
    timeLeft: map.time ?? TIME_LIMIT,
    over: null,
    aborted: false,
    grid,
    buildings: map.buildings.map((b) => ({ ...b })),
    doors: map.doors.map((d) => ({ ...d })),
    generator: { ...map.generator },
    towers: map.towers.map((t) => ({ ...t })),
    cameras: map.cameras.map((c) => ({ ...c })),
    launchers: map.launchers.map((l) => ({ ...l })),
    lz: { ...map.lz },
    goal: map.goal,
    exit: map.exit ? { ...map.exit } : null,
    strict: map.strict,
    hides: map.hides.map((h) => ({ ...h })),
    guards: map.guards.map(makeGuard),
    squad,
    projectiles: [],
    smokes: [],
    wires: [],
    alarm: { active: false, timer: 0 },
    stats: { takedowns: 0, alarms: 0 },
    events: [],
    staticVersion: 0,
    rngState: seed | 0,
  };
}
