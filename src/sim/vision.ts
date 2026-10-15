// Grid ray cast (DDA), line of sight, and the guard sight cone with its
// near and far zones. Ported from the prototype.

import {
  ALARM_CONE_SCALE,
  CONE_LEN,
  CONE_MIN_DIST,
  DOG_SMELL,
  EPS_LOS,
  EPS_LOS_MIN,
  FOV,
  NEAR_FRACTION,
  RAY_MAX_STEPS,
  SMOKE_RADIUS,
  UNIFORM_CLOSE,
} from './constants';
import { blocksSight } from './grid';
import { angDiff, tileOf } from './math';
import type { GameState, Grid, GuardRole, Unit, Vec } from './types';

/** Who is looking: a guard (with a role) or a camera (no role). */
export type Eye = Vec & { ang: number; role?: GuardRole };

/** True when a smoke cloud lies across the line from (x0, y0) to (x1, y1). */
export function smokeBlocks(s: GameState, x0: number, y0: number, x1: number, y1: number): boolean {
  for (const c of s.smokes) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const l2 = dx * dx + dy * dy || 1;
    const k = Math.max(0, Math.min(1, ((c.x - x0) * dx + (c.y - y0) * dy) / l2));
    if (Math.hypot(x0 + dx * k - c.x, y0 + dy * k - c.y) < SMOKE_RADIUS) return true;
  }
  return false;
}

/** How far sight reaches along a ray: walls (castRay) and smoke clouds. For drawing cones. */
export function sightRay(s: GameState, x0: number, y0: number, ang: number, maxLen: number): number {
  let d = castRay(s.grid, x0, y0, ang, maxLen);
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  for (const c of s.smokes) {
    // first t where |(x0, y0) + t (dx, dy) - c| = R
    const fx = x0 - c.x;
    const fy = y0 - c.y;
    const b = fx * dx + fy * dy;
    const q = fx * fx + fy * fy - SMOKE_RADIUS * SMOKE_RADIUS;
    if (q <= 0) return 0; // the eye is inside the smoke
    const disc = b * b - q;
    if (disc < 0) continue;
    const t = -b - Math.sqrt(disc);
    if (t >= 0 && t < d) d = t;
  }
  return d;
}

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
  if (smokeBlocks(s, g.x, g.y, p.x, p.y)) return null;
  return d <= len * NEAR_FRACTION ? 'near' : 'far';
}

/** Noa in the captured uniform passes for one of theirs, unless she crawls, drags a body,
 *  comes within UNIFORM_CLOSE tiles, or the alarm is on. An officer is never fooled. */
export function disguiseHolds(s: GameState, g: Eye, u: Unit): boolean {
  if (!u.disguised || s.alarm.active || u.crawl || u.carrying || g.role === 'officer') return false;
  return Math.hypot(u.x - g.x, u.y - g.y) > UNIFORM_CLOSE;
}

/** In a hiding spot (bush, dark corner) and standing still or crawling. */
export function hidden(s: GameState, u: Unit): boolean {
  if (!u.crawl && u.path.length > 0) return false;
  const tx = tileOf(u.x);
  const ty = tileOf(u.y);
  return s.hides.some((h) => tx >= h.x0 && tx <= h.x1 && ty >= h.y0 && ty <= h.y1);
}

/** Like zoneOf, but a crawling or hidden unit in the far zone is not seen. */
export function detects(s: GameState, g: Eye, u: Unit): Zone | null {
  if (g.role === 'dog') return null; // dogs smell (smells), they have no cone
  const z = zoneOf(s, g, u);
  if (!z || (z === 'far' && (u.crawl || hidden(s, u)))) return null;
  if (disguiseHolds(s, g, u)) return null;
  return z;
}

/** What a dog smells: the closest operator within DOG_SMELL tiles that walls do not hide.
 *  Hiding spots, crawling, smoke and the uniform do not help. */
export function smells(s: GameState, dog: Vec): Unit | null {
  let best: Unit | null = null;
  let bd = DOG_SMELL;
  for (const u of s.squad) {
    if (!u.alive) continue;
    const d = Math.hypot(u.x - dog.x, u.y - dog.y);
    if (d > bd || !losClear(s.grid, dog.x, dog.y, u.x, u.y)) continue;
    best = u;
    bd = d;
  }
  return best;
}
