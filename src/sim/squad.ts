// Squad orders and unit updates. Ported from the prototype's orders section,
// updateUnit(), and the order rules inside handleTap().

import {
  CARRY_OFFSET,
  CRAWL_MULT,
  DECOY_RANGE,
  DRAG_MULT,
  DUR_DOOR,
  DUR_GENERATOR,
  DUR_LAUNCHER,
  GRAB_RANGE,
  INTERACT_REACH,
  PISTOL_AIM,
  PISTOL_HEAR,
  PISTOL_RANGE,
  TAKEDOWN_RANGE,
  TAKEDOWN_REPATH,
  THROW_BUSY,
  THROW_FLIGHT,
  TIE_DUR,
} from './constants';
import { hearNoise } from './guards';
import { walkable } from './grid';
import { center, dist, pathLength } from './math';
import { message, pistolKill, takedown } from './mission';
import { moveAlong, pathTo } from './pathfinding';
import type { GameState, Guard, InteractTarget, Unit, Vec } from './types';
import { detects, losClear } from './vision';

export const speedOf = (u: Unit): number => u.speed * (u.crawl ? CRAWL_MULT : 1) * (u.carrying ? DRAG_MULT : 1);

export function clearOrder(u: Unit): void {
  u.order = null;
  u.path = [];
}

/** The closed door, generator or launcher on tile (tx, ty), if any. */
export function objectAt(s: GameState, tx: number, ty: number): InteractTarget | null {
  const d = s.doors.find((d) => d.x === tx && d.y === ty && !d.open);
  if (d) return { kind: 'door', o: d };
  const g = s.generator;
  if (tx >= g.x && tx < g.x + g.w && ty >= g.y && ty < g.y + g.h) return { kind: 'generator', o: g };
  const l = s.launchers.find((l) => tx >= l.x && tx < l.x + l.w && ty >= l.y && ty < l.y + l.h);
  if (l) return { kind: 'launcher', o: l };
  return null;
}

const footprint = (t: InteractTarget): { x: number; y: number; w: number; h: number } =>
  t.kind === 'door' ? { x: t.o.x, y: t.o.y, w: 1, h: 1 } : t.o;

/** The walkable tile around an object with the shortest walk for this unit,
 *  so Itai never takes the long way round. */
export function interactSpot(s: GameState, u: Unit, t: InteractTarget): { spot: Vec; path: Vec[] } | null {
  const o = footprint(t);
  const cands: Vec[] = [];
  for (let y = o.y - 1; y <= o.y + o.h; y++) {
    for (let x = o.x - 1; x <= o.x + o.w; x++) {
      const inside = x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h;
      if (!inside && walkable(s.grid, x, y)) cands.push(center(x, y));
    }
  }
  let best: { spot: Vec; path: Vec[] } | null = null;
  let bestLen = Infinity;
  for (const c of cands) {
    const p = pathTo(s.grid, u, c.x, c.y);
    if (!p) continue;
    const len = pathLength(u, p);
    if (len < bestLen) {
      bestLen = len;
      best = { spot: c, path: p };
    }
  }
  return best;
}

export function orderMove(s: GameState, u: Unit, wx: number, wy: number): boolean {
  if (!u.alive) return false;
  const p = pathTo(s.grid, u, wx, wy);
  if (p === null) {
    message(s, 'No route there.', 'warn');
    return false;
  }
  clearOrder(u);
  u.path = p;
  s.events.push({ type: 'moveOrdered', unit: u.id, x: wx, y: wy });
  return true;
}

export function orderTakedown(s: GameState, u: Unit, g: Guard): boolean {
  if (!u.alive || g.state === 'down') return false;
  if (u.id !== 'shadow') {
    message(s, 'Only Yoav can take down guards.');
    return false;
  }
  clearOrder(u);
  u.order = { type: 'takedown', guard: g, repath: 0 };
  return true;
}

export function orderGrab(s: GameState, u: Unit, body: Guard): boolean {
  if (!u.alive || body.state !== 'down' || body.carried) return false;
  if (u.id !== 'shadow') {
    message(s, 'Only Yoav can move bodies.');
    return false;
  }
  if (u.carrying) {
    message(s, 'Yoav is already dragging a body.');
    return false;
  }
  clearOrder(u);
  u.order = { type: 'grab', body };
  u.path = pathTo(s.grid, u, body.x, body.y) ?? [];
  return true;
}

export function orderInteract(s: GameState, u: Unit, target: InteractTarget): boolean {
  if (!u.alive) return false;
  if (u.id !== 'sapper') {
    const msg = {
      door: 'Locked. Itai can breach it.',
      generator: 'Itai can cut the power here.',
      launcher: 'Only Itai can plant the charges.',
    };
    message(s, msg[target.kind]);
    return false;
  }
  if (target.kind === 'generator' && !target.o.on) {
    message(s, 'Power is already cut.');
    return false;
  }
  if (target.kind === 'launcher' && target.o.done) {
    message(s, `${target.o.name} already has a charge.`);
    return false;
  }
  const r = interactSpot(s, u, target);
  if (!r) {
    message(s, 'Itai cannot reach that yet. Find a way in.', 'warn');
    return false;
  }
  clearOrder(u);
  u.path = r.path;
  const dur = target.kind === 'door' ? DUR_DOOR : target.kind === 'generator' ? DUR_GENERATOR : DUR_LAUNCHER;
  u.order = { type: 'interact', target, spot: r.spot, started: false, t: 0, dur };
  return true;
}

/** Yoav ties a knocked-out guard so he never wakes. */
export function orderTie(s: GameState, u: Unit, body: Guard): boolean {
  if (!u.alive || u.id !== 'shadow') return false;
  if (body.state !== 'down' || body.dead) return false;
  if (body.tied) {
    message(s, 'He is already tied.');
    return false;
  }
  if (body.carried) {
    message(s, 'Put the body down first.', 'warn');
    return false;
  }
  clearOrder(u);
  u.path = pathTo(s.grid, u, body.x, body.y) ?? [];
  u.order = { type: 'tie', body, started: false, t: 0 };
  return true;
}

export type PistolResult = 'aiming' | 'empty' | 'range' | 'blocked' | 'invalid';

/** Yoav aims the silenced pistol at a guard; the shot leaves after PISTOL_AIM. */
export function firePistol(s: GameState, u: Unit, g: Guard): PistolResult {
  if (!u.alive || u.id !== 'shadow' || g.state === 'down') return 'invalid';
  if (u.rounds <= 0) {
    message(s, 'Yoav is out of rounds.', 'warn');
    return 'empty';
  }
  if (dist(u, g) > PISTOL_RANGE) {
    message(s, 'Too far for the pistol. Get closer.', 'warn');
    return 'range';
  }
  if (!losClear(s.grid, u.x, u.y, g.x, g.y)) {
    message(s, 'No clear shot.', 'warn');
    return 'blocked';
  }
  clearOrder(u);
  u.order = { type: 'shoot', guard: g, t: 0 };
  u.ang = Math.atan2(g.y - u.y, g.x - u.x);
  return 'aiming';
}

export type ThrowResult = 'thrown' | 'empty' | 'range' | 'invalid';

export function throwDecoy(s: GameState, u: Unit, wx: number, wy: number): ThrowResult {
  if (!u.alive || u.id !== 'lure') return 'invalid';
  if (u.charges <= 0) {
    message(s, 'Noa is out of decoys.', 'warn');
    return 'empty';
  }
  if (Math.hypot(wx - u.x, wy - u.y) > DECOY_RANGE) {
    message(s, 'Out of range. Move Noa closer.', 'warn');
    return 'range';
  }
  clearOrder(u);
  u.charges--;
  u.busy = THROW_BUSY;
  u.ang = Math.atan2(wy - u.y, wx - u.x);
  s.projectiles.push({ x0: u.x, y0: u.y, x1: wx, y1: wy, t: 0, dur: THROW_FLIGHT });
  return 'thrown';
}

export function toggleCrawl(u: Unit): void {
  if (u.carrying) return;
  u.crawl = !u.crawl;
}

export function setCrawl(u: Unit, on: boolean): void {
  if (u.carrying) return;
  u.crawl = on;
}

export function dropBody(u: Unit): void {
  if (!u.carrying) return;
  u.carrying.carried = false;
  u.carrying = null;
}

function finishInteract(s: GameState, target: InteractTarget): void {
  if (target.kind === 'door') {
    const o = target.o;
    o.open = true;
    s.grid.cells[o.y * s.grid.cols + o.x] = 'd';
    s.staticVersion++;
    message(s, `${o.label} breached.`, 'ok');
  } else if (target.kind === 'generator') {
    target.o.on = false;
    s.staticVersion++;
    message(s, 'Power cut. Searchlights are dark.', 'ok');
  } else {
    target.o.done = true;
    const left = s.launchers.filter((l) => !l.done).length;
    if (left) message(s, `Charge set on ${target.o.name}. ${left} to go.`, 'ok');
    else {
      s.aborted = true;
      message(s, 'All launchers rigged. Launch aborted. Get everyone to the LZ.', 'ok');
    }
  }
}

export function updateUnit(s: GameState, u: Unit, dt: number): void {
  if (!u.alive) return;
  if (u.hitT > 0) u.hitT -= dt;
  if (u.busy > 0) {
    u.busy -= dt;
    return;
  }
  const o = u.order;
  if (o) {
    if (o.type === 'takedown') {
      const g = o.guard;
      if (g.state === 'down') clearOrder(u);
      else {
        o.repath -= dt;
        if (dist(u, g) <= TAKEDOWN_RANGE && !detects(s, g, u)) {
          takedown(s, u, g);
          clearOrder(u);
        } else if (o.repath <= 0) {
          o.repath = TAKEDOWN_REPATH;
          const p = pathTo(s.grid, u, g.x, g.y);
          if (p) u.path = p;
        }
      }
    } else if (o.type === 'grab') {
      const b = o.body;
      if (b.carried) clearOrder(u);
      else if (dist(u, b) <= GRAB_RANGE) {
        u.carrying = b;
        b.carried = true;
        u.crawl = false;
        clearOrder(u);
      } else if (!u.path.length) {
        const p = pathTo(s.grid, u, b.x, b.y);
        if (!p || !p.length) clearOrder(u);
        else u.path = p;
      }
    } else if (o.type === 'tie') {
      const b = o.body;
      if (b.state !== 'down' || b.carried || b.tied) clearOrder(u);
      else if (o.started || dist(u, b) <= GRAB_RANGE) {
        o.started = true;
        u.path = [];
        u.ang = Math.atan2(b.y - u.y, b.x - u.x);
        o.t += dt;
        if (o.t >= TIE_DUR) {
          b.tied = true;
          s.events.push({ type: 'tied', unit: u.id, guard: b.i });
          clearOrder(u);
        }
        return;
      } else if (!u.path.length) {
        const p = pathTo(s.grid, u, b.x, b.y);
        if (!p || !p.length) clearOrder(u);
        else u.path = p;
      }
    } else if (o.type === 'shoot') {
      const g = o.guard;
      if (g.state === 'down') clearOrder(u);
      else {
        u.ang = Math.atan2(g.y - u.y, g.x - u.x);
        o.t += dt;
        if (o.t >= PISTOL_AIM) {
          if (dist(u, g) <= PISTOL_RANGE && losClear(s.grid, u.x, u.y, g.x, g.y)) {
            u.rounds--;
            pistolKill(s, u, g);
            hearNoise(s, g.x, g.y, PISTOL_HEAR);
          } else message(s, 'Lost the shot.', 'warn');
          clearOrder(u);
        }
        return;
      }
    } else if (o.type === 'interact') {
      if (!o.started) {
        if (!u.path.length) {
          if (dist(u, o.spot) <= INTERACT_REACH) {
            o.started = true;
            o.t = 0;
            const f = footprint(o.target);
            u.ang = Math.atan2(f.y + f.h / 2 - u.y, f.x + f.w / 2 - u.x);
          } else {
            const p = pathTo(s.grid, u, o.spot.x, o.spot.y);
            if (!p) {
              clearOrder(u);
              message(s, 'Route blocked.', 'warn');
            } else u.path = p;
          }
        }
      } else {
        o.t += dt;
        if (o.t >= o.dur) {
          finishInteract(s, o.target);
          u.order = null;
        }
        return;
      }
    }
  }
  if (u.path.length) {
    const a = moveAlong(u, dt, speedOf(u));
    if (a !== null) u.ang = a;
  }
  if (u.carrying) {
    const b = u.carrying;
    b.x = u.x - Math.cos(u.ang) * CARRY_OFFSET;
    b.y = u.y - Math.sin(u.ang) * CARRY_OFFSET;
    b.ang = u.ang;
  }
}
