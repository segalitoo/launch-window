// Operation Night Lantern, built in code. Ported from newGame() in the prototype.
// Phase 1 moves this data to a Tiled map.

import {
  COLS,
  DECOY_CHARGES,
  GUARD_PHASE_STEP,
  ROWS,
  SPEED_LURE,
  SPEED_SAPPER,
  SPEED_SHADOW,
  TIME_LIMIT,
  UNIT_HP,
  UNIT_START_ANG,
} from './constants';
import { createGrid, fillDeco, fillRect, setTile } from './grid';
import { center } from './math';
import type { Building, Door, GameState, Generator, Guard, Launcher, Tower, Unit, UnitId, Vec } from './types';

const D = Math.PI / 180;

type GuardDef =
  | { kind: 'patrol'; route: [number, number][]; loop: boolean }
  | { kind: 'post'; at: [number, number]; face: number; sweep?: number; spin?: boolean };

export const GUARD_DEFS: readonly GuardDef[] = [
  { kind: 'patrol', route: [[7, 4], [7, 17]], loop: false },
  { kind: 'post', at: [12, 12], face: 180, sweep: 25 },
  { kind: 'post', at: [12, 15], face: 180, sweep: 25 },
  { kind: 'post', at: [18, 23], face: 120, sweep: 40 }, // yard guard
  { kind: 'patrol', route: [[22, 11], [25, 11], [25, 20], [22, 20]], loop: true },
  { kind: 'post', at: [29, 12], face: 180, sweep: 35 },
  { kind: 'patrol', route: [[29, 8], [40, 8], [40, 20], [29, 20]], loop: true },
  { kind: 'post', at: [36, 16], spin: true, face: 0 }, // spinning guard
  { kind: 'patrol', route: [[26, 24], [42, 24]], loop: false }, // south patrol
  { kind: 'patrol', route: [[12, 4], [40, 4]], loop: false },
];

function makeGuard(d: GuardDef, i: number): Guard {
  const g: Guard = {
    i,
    kind: d.kind,
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
  if (d.kind === 'post') {
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
  o: { id: UnitId; name: string; call: string; color: string; speed: number; charges?: number },
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
    ...o,
  };
}

export function buildMission(seed = 1): GameState {
  const grid = createGrid(COLS, ROWS);
  fillDeco(grid, 0, 13, 26, 14, 1); // road to the compound
  fillDeco(grid, 28, 7, 41, 21, 2); // launch compound slab
  fillDeco(grid, 14, 22, 19, 26, 3); // generator yard

  // perimeter wall with the main gate
  fillRect(grid, 10, 2, 44, 2, '#');
  fillRect(grid, 10, 27, 44, 27, '#');
  fillRect(grid, 10, 2, 10, 27, '#');
  fillRect(grid, 44, 2, 44, 27, '#');
  setTile(grid, 10, 13, '.');
  setTile(grid, 10, 14, '.');

  // generator yard
  fillRect(grid, 13, 21, 20, 21, '#');
  fillRect(grid, 13, 21, 13, 27, '#');
  fillRect(grid, 20, 21, 20, 27, '#');
  setTile(grid, 20, 24, '.');

  const buildings: Building[] = [
    { x0: 14, y0: 5, x1: 21, y1: 9, label: 'BARRACKS' },
    { x0: 14, y0: 16, x1: 18, y1: 19, label: 'MOTOR POOL' },
  ];
  for (const b of buildings) fillRect(grid, b.x0, b.y0, b.x1, b.y1, 'B');

  // launch compound
  fillRect(grid, 27, 6, 42, 6, '#');
  fillRect(grid, 27, 22, 42, 22, '#');
  fillRect(grid, 27, 6, 27, 22, '#');
  fillRect(grid, 42, 6, 42, 22, '#');
  setTile(grid, 27, 13, '.');
  setTile(grid, 27, 14, '.');

  // crates for cover
  const crates: [number, number][] = [
    [23, 15], [23, 16], [35, 9], [35, 10], [33, 15], [34, 15], [39, 18], [39, 19],
    [8, 20], [8, 21], [30, 25], [31, 25], [23, 23], [23, 24], [30, 3],
  ];
  for (const [x, y] of crates) setTile(grid, x, y, 'c');

  const doors: Door[] = [
    { x: 16, y: 27, open: false, label: 'Yard gate' },
    { x: 35, y: 22, open: false, label: 'Compound door' },
  ];
  for (const d of doors) setTile(grid, d.x, d.y, 'D');

  const generator: Generator = { x: 15, y: 23, w: 2, h: 2, on: true };
  fillRect(grid, 15, 23, 16, 24, 'G');

  const towers: Tower[] = [
    { x: 24, y: 9, a0: 35 * D, a1: 145 * D, period: 7, phase: 0, susp: 0, ang: 0 },
    { x: 36, y: 25, a0: Math.PI, a1: 2 * Math.PI, period: 8, phase: 2, susp: 0, ang: 0 },
  ];
  for (const t of towers) setTile(grid, t.x, t.y, 'T');

  const launchers: Launcher[] = [
    { x: 30, y: 9, w: 3, h: 1, name: 'TEL-1', done: false },
    { x: 37, y: 12, w: 3, h: 1, name: 'TEL-2', done: false },
    { x: 31, y: 18, w: 3, h: 1, name: 'TEL-3', done: false },
  ];
  for (const l of launchers) fillRect(grid, l.x, l.y, l.x + l.w - 1, l.y + l.h - 1, 'L');

  const guards = GUARD_DEFS.map(makeGuard);

  const squad: Unit[] = [
    makeUnit({ id: 'shadow', name: 'Yoav', call: 'Shadow', color: '#6cc4ff', speed: SPEED_SHADOW }, 4, 24),
    makeUnit({ id: 'lure', name: 'Noa', call: 'Lure', color: '#8ef0d0', speed: SPEED_LURE, charges: DECOY_CHARGES }, 3, 26),
    makeUnit({ id: 'sapper', name: 'Itai', call: 'Sapper', color: '#c9b8ff', speed: SPEED_SAPPER }, 5, 26),
  ];

  return {
    t: 0,
    timeLeft: TIME_LIMIT,
    over: null,
    aborted: false,
    grid,
    buildings,
    doors,
    generator,
    towers,
    launchers,
    guards,
    squad,
    projectiles: [],
    alarm: { active: false, timer: 0 },
    stats: { takedowns: 0, alarms: 0 },
    events: [],
    staticVersion: 0,
    rngState: seed | 0,
  };
}
