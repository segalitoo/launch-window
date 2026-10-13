// One fixed simulation step. Ported from update() in the prototype.

import { ALARM_TIME_SCALE } from './constants';
import { clearAlarm, hearNoise, updateGuard } from './guards';
import { endGame, inLZ, updateTowers } from './mission';
import { updateUnit } from './squad';
import type { GameState } from './types';

export function step(s: GameState, dt: number): void {
  if (s.over) return;
  s.t += dt;
  if (!s.aborted) {
    s.timeLeft -= dt * (s.alarm.active ? ALARM_TIME_SCALE : 1);
    if (s.timeLeft <= 0) {
      s.timeLeft = 0;
      endGame(s, 'launch');
      return;
    }
  }
  for (const u of s.squad) updateUnit(s, u, dt);
  updateTowers(s, dt);
  for (const g of s.guards) updateGuard(s, g, dt);
  if (s.over) return;
  for (const p of s.projectiles) p.t += dt;
  const landed = s.projectiles.filter((p) => p.t >= p.dur);
  s.projectiles = s.projectiles.filter((p) => p.t < p.dur);
  for (const p of landed) hearNoise(s, p.x1, p.y1);
  if (s.alarm.active) {
    const anySee = s.guards.some((g) => g.state !== 'down' && g.seeing);
    if (!anySee) s.alarm.timer -= dt;
    if (s.alarm.timer <= 0) clearAlarm(s);
  }
  if (s.aborted && s.squad.every((u) => u.alive && inLZ(u))) endGame(s, 'win');
}
