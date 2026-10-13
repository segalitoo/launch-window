// Guard AI: perception, suspicion, patrol, investigate, search, return, combat.
// Ported from updateGuard(), hearNoise() and goReturn() in the prototype.

import {
  ALARM_RATE,
  ALARM_TIME,
  COMBAT_SPIN,
  DECOY_HEAR,
  INVESTIGATE_MAX_PATH,
  LAST_KNOWN_REACH,
  PATROL_WAIT,
  POST_SWEEP_RATE,
  SEARCH_SWEEP,
  SEARCH_SWEEP_RATE,
  SEARCH_TIME,
  SHOT_FIRST_ALERTED,
  SHOT_INTERVAL,
  SPEED_COMBAT,
  SPEED_INVESTIGATE,
  SPEED_PATROL,
  SPEED_RETURN,
  SPIN_RATE,
  SUSP_DECAY,
  SUSP_FAR,
  SUSP_NEAR,
  SUSP_STARE_MIN,
  TURN_COMBAT,
  TURN_POST,
  TURN_STARE,
  TURN_WALK,
  WAYPOINT_REACH,
} from './constants';
import { message, raiseAlarm, shoot } from './mission';
import { dist, pathLength, turnTo } from './math';
import { moveAlong, pathTo } from './pathfinding';
import type { GameState, Guard, Unit } from './types';
import { detects, zoneOf } from './vision';

/** Sends a guard back to its post, or to its current patrol waypoint. */
export function goReturn(s: GameState, g: Guard): void {
  const target = g.kind === 'post' ? g.post! : g.route[g.ri]!;
  const p = pathTo(s.grid, g, target.x, target.y);
  g.state = 'return';
  g.path = p ?? [];
  if (!g.path.length) g.state = 'patrol';
}

/** A decoy lands at (x, y). Guards in earshot walk over, or search in place if the walk is long. */
export function hearNoise(s: GameState, x: number, y: number): void {
  let n = 0;
  for (const g of s.guards) {
    if (g.state === 'down' || g.state === 'combat') continue;
    if (Math.hypot(g.x - x, g.y - y) > DECOY_HEAR) continue;
    n++;
    const p = pathTo(s.grid, g, x, y);
    const len = p ? pathLength(g, p) : 0;
    g.susp = 0;
    g.suspPt = null;
    if (!p || len > INVESTIGATE_MAX_PATH) {
      g.state = 'search';
      g.timer = SEARCH_TIME;
      g.searchBase = Math.atan2(y - g.y, x - g.x);
      g.path = [];
    } else {
      g.state = 'investigate';
      g.path = p;
    }
  }
  s.events.push({ type: 'noise', x, y, heard: n });
}

export function updateGuard(s: GameState, g: Guard, dt: number): void {
  if (g.state === 'down') return;

  // perception
  let best: Unit | null = null;
  let bestRate = 0;
  for (const u of s.squad) {
    if (!u.alive) continue;
    const z = detects(s, g, u);
    if (!z) continue;
    let rate = z === 'near' ? SUSP_NEAR : SUSP_FAR;
    if (s.alarm.active) rate = ALARM_RATE;
    if (rate > bestRate) {
      bestRate = rate;
      best = u;
    }
  }
  if (best) {
    if (s.alarm.active) {
      if (g.state !== 'combat' || !g.seeing) g.shootCD = Math.max(g.shootCD, SHOT_FIRST_ALERTED);
      g.state = 'combat';
      g.seeing = best;
      g.lastKnown = { x: best.x, y: best.y };
      s.alarm.timer = ALARM_TIME;
    } else {
      g.seeing = best;
      g.suspPt = { x: best.x, y: best.y };
      g.susp = Math.min(1, g.susp + bestRate * dt);
      if (g.susp >= 1) {
        raiseAlarm(s, best.x, best.y, g, `A guard spotted ${best.name}!`);
        g.seeing = best;
      }
    }
  } else {
    g.seeing = null;
    g.susp = Math.max(0, g.susp - SUSP_DECAY * dt);
  }
  for (const b of s.guards) {
    if (b.state !== 'down' || b.found || b.carried) continue;
    if (zoneOf(s, g, b)) {
      b.found = true;
      raiseAlarm(s, b.x, b.y, g, 'A guard found a body!');
    }
  }

  // combat with a target in sight: stand and shoot
  if (g.state === 'combat' && g.seeing && g.seeing.alive) {
    g.path = [];
    turnTo(g, Math.atan2(g.seeing.y - g.y, g.seeing.x - g.x), dt, TURN_COMBAT);
    g.shootCD -= dt;
    if (g.shootCD <= 0) {
      shoot(s, g, g.seeing);
      g.shootCD = SHOT_INTERVAL;
    }
    return;
  }
  // suspicious: freeze and stare
  if (!s.alarm.active && g.state !== 'combat' && g.susp > SUSP_STARE_MIN && g.suspPt) {
    turnTo(g, Math.atan2(g.suspPt.y - g.y, g.suspPt.x - g.x), dt, TURN_STARE);
    return;
  }
  const walk = (speed: number): void => {
    const a = moveAlong(g, dt, speed);
    if (a !== null) turnTo(g, a, dt, TURN_WALK);
  };
  switch (g.state) {
    case 'patrol':
      if (g.kind === 'post') {
        if (g.spin) g.ang += dt * SPIN_RATE;
        else turnTo(g, g.face + Math.sin(s.t * POST_SWEEP_RATE + g.phase) * g.sweep, dt, TURN_POST);
      } else {
        if (g.wait > 0) {
          g.wait -= dt;
          break;
        }
        if (!g.path.length) {
          const wp = g.route[g.ri]!;
          if (dist(g, wp) < WAYPOINT_REACH) {
            if (g.loop) g.ri = (g.ri + 1) % g.route.length;
            else {
              if (g.ri + g.dir < 0 || g.ri + g.dir >= g.route.length) g.dir = g.dir === 1 ? -1 : 1;
              g.ri += g.dir;
            }
            g.wait = PATROL_WAIT;
          } else g.path = pathTo(s.grid, g, wp.x, wp.y) ?? [];
        }
        walk(SPEED_PATROL);
      }
      break;
    case 'investigate':
      if (!g.path.length) {
        g.state = 'search';
        g.timer = SEARCH_TIME;
        g.searchBase = g.ang;
      } else walk(SPEED_INVESTIGATE);
      break;
    case 'search':
      g.timer -= dt;
      g.ang = g.searchBase + Math.sin((SEARCH_TIME - g.timer) * SEARCH_SWEEP_RATE) * SEARCH_SWEEP;
      if (g.timer <= 0) goReturn(s, g);
      break;
    case 'return':
      if (!g.path.length) {
        g.state = 'patrol';
        if (g.kind === 'post') {
          g.x = g.post!.x;
          g.y = g.post!.y;
        }
      } else walk(SPEED_RETURN);
      break;
    case 'combat':
      if (!s.alarm.active) {
        goReturn(s, g);
        break;
      }
      if (!g.path.length) {
        if (g.lastKnown && dist(g, g.lastKnown) > LAST_KNOWN_REACH) {
          g.path = pathTo(s.grid, g, g.lastKnown.x, g.lastKnown.y) ?? [];
          if (!g.path.length) g.lastKnown = null;
        } else {
          g.lastKnown = null;
          g.ang += dt * COMBAT_SPIN;
        }
      }
      walk(SPEED_COMBAT);
      break;
  }
}

/** Ends the alarm and sends combat guards home. */
export function clearAlarm(s: GameState): void {
  s.alarm.active = false;
  message(s, 'Alarm cleared. Guards are going back to their posts.');
  s.events.push({ type: 'alarmCleared' });
  for (const g of s.guards) if (g.state === 'combat') goReturn(s, g);
}
