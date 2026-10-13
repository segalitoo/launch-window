// Grid ray cast (DDA), line of sight, and the guard sight cone with its
// near and far zones. Ported from the prototype.

import {
  ALARM_CONE_SCALE,
  CONE_LEN,
  CONE_MIN_DIST,
  EPS_LOS,
  EPS_LOS_MIN,
  FOV,
  NEAR_FRACTION,
  RAY_MAX_STEPS,
} from './constants';
import { blocksSight } from './grid';
import { angDiff, tileOf } from './math';
import type { GameState, Grid, Unit, Vec } from './types';

/** Distance a ray travels from (x0, y0) at `ang` before it hits a sight-blocking tile, capped at maxLen. */
export function castRay(g: Grid, x0: number, y0: number, ang: number, maxLen: number): number {
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  let tx = tileOf(x0);
  let ty = tileOf(y0);
  const sx = dx > 0 ? 1 : -1;
  const sy = dy > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  let tmx = dx !== 0 ? (dx > 0 ? tx + 1 - x0 : x0 - tx) / Math.abs(dx) : Infinity;
  let tmy = dy !== 0 ? (dy > 0 ? ty + 1 - y0 : y0 - ty) / Math.abs(dy) : Infinity;
  for (let n = 0; n < RAY_MAX_STEPS; n++) {
    let t: number;
    if (tmx < tmy) {
      t = tmx;
      tmx += tdx;
      tx += sx;
    } else {
      t = tmy;
      tmy += tdy;
      ty += sy;
    }
    if (t >= maxLen) return maxLen;
    if (blocksSight(g, tx, ty)) return t;
  }
  return maxLen;
}

export function losClear(g: Grid, x0: number, y0: number, x1: number, y1: number): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  if (d < EPS_LOS_MIN) return true;
  return castRay(g, x0, y0, Math.atan2(y1 - y0, x1 - x0), d) >= d - EPS_LOS;
}

/** Guard cone length right now. It grows during an alarm. */
export const coneLength = (s: GameState): number => CONE_LEN * (s.alarm.active ? ALARM_CONE_SCALE : 1);

export type Zone = 'near' | 'far';

/** Which part of a guard's cone a point is in, or null if the guard cannot see it. */
export function zoneOf(s: GameState, g: Vec & { ang: number }, p: Vec): Zone | null {
  const dx = p.x - g.x;
  const dy = p.y - g.y;
  const d = Math.hypot(dx, dy);
  const len = coneLength(s);
  if (d > len) return null;
  if (d > CONE_MIN_DIST && Math.abs(angDiff(Math.atan2(dy, dx), g.ang)) > FOV / 2) return null;
  if (!losClear(s.grid, g.x, g.y, p.x, p.y)) return null;
  return d <= len * NEAR_FRACTION ? 'near' : 'far';
}

/** Like zoneOf, but a crawling unit in the far zone is not seen. */
export function detects(s: GameState, g: Vec & { ang: number }, u: Unit): Zone | null {
  const z = zoneOf(s, g, u);
  if (!z || (z === 'far' && u.crawl)) return null;
  return z;
}
