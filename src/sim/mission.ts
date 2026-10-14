// Mission rules: alarm, takedowns, shooting, searchlights, win and lose.
// Ported from the prototype. UI side effects became SimEvents.

import {
  ALARM_RADIUS,
  ALARM_RATE,
  ALARM_TIME,
  HIT_FLASH,
  SHOT_FIRST,
  TAKEDOWN_REACH,
  TOWER_DECAY,
  TOWER_FOV,
  TOWER_LEN,
  TOWER_SUSP,
} from './constants';
import { angDiff, center, dist, tileOf } from './math';
import { walkable } from './grid';
import type { GameResult, GameState, Guard, MessageKind, Unit } from './types';
import { losClear } from './vision';

export function message(s: GameState, msg: string, kind: MessageKind = ''): void {
  s.events.push({ type: 'message', msg, kind });
}

/** Starts or refreshes the alarm. Guards near the source, and the source guard, go to combat. */
export function raiseAlarm(s: GameState, x: number, y: number, src: Guard | null, reason: string): void {
  const first = !s.alarm.active;
  if (first) {
    s.stats.alarms++;
    message(s, reason, 'alarm');
  }
  s.events.push({ type: 'alarmRaised', x, y, first, reason });
  s.alarm.active = true;
  s.alarm.timer = ALARM_TIME;
  for (const g of s.guards) {
    if (g.state === 'down') continue;
    if (g === src || Math.hypot(g.x - x, g.y - y) < ALARM_RADIUS) {
      if (g.state !== 'combat') g.shootCD = SHOT_FIRST;
      g.state = 'combat';
      g.lastKnown = { x, y };
      g.path = [];
      g.susp = 0;
    }
  }
}

export function takedown(s: GameState, u: Unit, g: Guard): void {
  // the attacker pulls him down at arm's length in front, facing away from him
  const a = Math.atan2(g.y - u.y, g.x - u.x);
  const x = u.x + Math.cos(a) * TAKEDOWN_REACH;
  const y = u.y + Math.sin(a) * TAKEDOWN_REACH;
  if (walkable(s.grid, tileOf(x), tileOf(y))) {
    g.x = x;
    g.y = y;
  }
  g.ang = a;
  u.ang = a;
  g.state = 'down';
  g.path = [];
  g.susp = 0;
  g.seeing = null;
  s.stats.takedowns++;
  s.events.push({ type: 'takedown', unit: u.id, guard: g.i });
}

export function shoot(s: GameState, g: Guard, u: Unit): void {
  s.events.push({ type: 'shot', guard: g.i, unit: u.id });
  u.hp -= 1;
  u.hitT = HIT_FLASH;
  if (u.hp <= 0) {
    u.alive = false;
    u.path = [];
    u.order = null;
    if (u.carrying) {
      u.carrying.carried = false;
      u.carrying = null;
    }
    endGame(s, 'down', u);
  }
}

export function endGame(s: GameState, result: GameResult, u?: Unit): void {
  if (s.over) return;
  s.over = result;
  s.events.push(u ? { type: 'gameOver', result, unit: u.id } : { type: 'gameOver', result });
}

export function inLZ(s: GameState, u: Unit): boolean {
  const z = s.lz;
  const tx = tileOf(u.x);
  const ty = tileOf(u.y);
  return tx >= z.x0 && tx <= z.x1 && ty >= z.y0 && ty <= z.y1;
}

/** Searchlights sweep between two angles and see everyone, crawling or not. */
export function updateTowers(s: GameState, dt: number): void {
  for (const t of s.towers) {
    if (!s.generator.on) {
      t.susp = 0;
      continue;
    }
    const k = 0.5 - 0.5 * Math.cos((2 * Math.PI * s.t) / t.period + t.phase);
    t.ang = t.a0 + (t.a1 - t.a0) * k;
    const o = center(t.x, t.y);
    let seen: Unit | null = null;
    for (const u of s.squad) {
      if (!u.alive) continue;
      const d = dist(o, u);
      if (
        d > TOWER_LEN ||
        Math.abs(angDiff(Math.atan2(u.y - o.y, u.x - o.x), t.ang)) > TOWER_FOV / 2 ||
        !losClear(s.grid, o.x, o.y, u.x, u.y)
      )
        continue;
      seen = u;
      break;
    }
    if (seen) {
      t.susp = Math.min(1, t.susp + (s.alarm.active ? ALARM_RATE : TOWER_SUSP) * dt);
      if (s.alarm.active) s.alarm.timer = ALARM_TIME;
      if (t.susp >= 1) raiseAlarm(s, seen.x, seen.y, null, `Searchlight caught ${seen.name}!`);
    } else t.susp = Math.max(0, t.susp - TOWER_DECAY * dt);
  }
}
