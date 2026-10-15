// Mission rules: alarm, takedowns, shooting, searchlights, win and lose.
// Ported from the prototype. UI side effects became SimEvents.

import {
  ALARM_RADIUS,
  ALARM_RATE,
  ALARM_TIME,
  HIT_FLASH,
  PACE,
  SHOT_FIRST,
  TAKEDOWN_REACH,
  TAKEDOWN_SIDE,
  TOWER_DECAY,
  TOWER_FOV,
  TOWER_LEN,
  TOWER_SUSP,
  WAKE_TIME,
  BLAST_HEAR,
  BLAST_HURT,
  BLAST_KILL,
} from './constants';
import { angDiff, center, dist, tileOf } from './math';
import { walkable } from './grid';
import { hearNoise } from './guards';
import type { GameResult, GameState, Guard, MessageKind, Unit } from './types';
import { hidden, losClear, smokeBlocks } from './vision';

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
  // the attacker takes him from the back-right: he ends ahead and to the attacker's left,
  // facing away (left of facing angle a in sim space is (sin a, -cos a))
  const a = Math.atan2(g.y - u.y, g.x - u.x);
  const x = u.x + Math.cos(a) * TAKEDOWN_REACH + Math.sin(a) * TAKEDOWN_SIDE;
  const y = u.y + Math.sin(a) * TAKEDOWN_REACH - Math.cos(a) * TAKEDOWN_SIDE;
  if (walkable(s.grid, tileOf(x), tileOf(y))) {
    g.x = x;
    g.y = y;
  }
  g.ang = a;
  u.ang = a;
  g.state = 'down';
  g.ko = WAKE_TIME;
  g.path = [];
  g.susp = 0;
  g.seeing = null;
  s.stats.takedowns++;
  s.events.push({ type: 'takedown', unit: u.id, guard: g.i });
}

/** An operator's shot: the guard falls and stays down. */
export function gunKill(s: GameState, u: Unit, g: Guard, loud: boolean): void {
  g.state = 'down';
  g.dead = true;
  g.ko = 0;
  g.path = [];
  g.susp = 0;
  g.seeing = null;
  s.stats.takedowns++;
  s.events.push({ type: 'fired', unit: u.id, guard: g.i, loud });
}

/** A guard walks into one of Itai's tripwires: knocked out, like a knife takedown. */
export function checkWires(s: GameState): void {
  for (const g of s.guards) {
    if (g.state === 'down' || g.carried) continue;
    const i = s.wires.findIndex((w) => w.x === tileOf(g.x) && w.y === tileOf(g.y));
    if (i < 0) continue;
    s.wires.splice(i, 1);
    g.state = 'down';
    g.ko = WAKE_TIME;
    g.path = [];
    g.susp = 0;
    g.seeing = null;
    s.stats.takedowns++;
    s.events.push({ type: 'tripped', guard: g.i });
  }
}

/** Itai's remote charge goes off: guards close by are caught in it, everyone within earshot
 *  comes to look. A diversion: it does not raise the alarm by itself. */
export function blast(s: GameState, x: number, y: number): void {
  for (const g of s.guards) {
    if (g.state === 'down' || Math.hypot(g.x - x, g.y - y) > BLAST_KILL) continue;
    g.state = 'down';
    g.dead = true;
    g.ko = 0;
    g.path = [];
    g.seeing = null;
    s.stats.takedowns++;
  }
  for (const u of s.squad) {
    if (!u.alive || Math.hypot(u.x - x, u.y - y) > BLAST_KILL) continue;
    u.hp -= BLAST_HURT;
    u.hitT = HIT_FLASH;
    if (u.hp <= 0) {
      u.alive = false;
      u.path = [];
      u.order = null;
      endGame(s, 'down', u);
    }
  }
  s.events.push({ type: 'blast', x, y });
  hearNoise(s, x, y, BLAST_HEAR);
}

/** A knocked-out guard who was not tied gets up and raises the alarm where he lies. */
export function wake(s: GameState, g: Guard): void {
  const carrier = s.squad.find((u) => u.carrying === g);
  if (carrier) carrier.carrying = null;
  g.carried = false;
  g.ko = 0;
  g.found = false;
  g.state = 'search';
  s.events.push({ type: 'woke', guard: g.i });
  raiseAlarm(s, g.x, g.y, g, 'A guard woke up and raised the alarm!');
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
    const k = 0.5 - 0.5 * Math.cos((2 * Math.PI * s.t) / (t.period / PACE) + t.phase);
    t.ang = t.a0 + (t.a1 - t.a0) * k;
    const o = center(t.x, t.y);
    let seen: Unit | null = null;
    for (const u of s.squad) {
      if (!u.alive || hidden(s, u)) continue;
      const d = dist(o, u);
      if (
        d > TOWER_LEN ||
        Math.abs(angDiff(Math.atan2(u.y - o.y, u.x - o.x), t.ang)) > TOWER_FOV / 2 ||
        !losClear(s.grid, o.x, o.y, u.x, u.y) ||
        smokeBlocks(s, o.x, o.y, u.x, u.y)
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
