// One fixed simulation step. Ported from update() in the prototype.

import { ALARM_TIME_SCALE, SMOKE_TIME } from './constants';
import { clearAlarm, hearNoise, updateGuard } from './guards';
import { checkWires, endGame, inLZ, updateCameras, updateTowers } from './mission';
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
  updateCameras(s, dt);
  for (const g of s.guards) updateGuard(s, g, dt);
  checkWires(s);
  if (s.over) return;
  for (const p of s.projectiles) p.t += dt;
  const landed = s.projectiles.filter((p) => p.t >= p.dur);
  s.projectiles = s.projectiles.filter((p) => p.t < p.dur);
  for (const p of landed) {
    if (p.kind === 'smoke') {
      s.smokes.push({ x: p.x1, y: p.y1, left: SMOKE_TIME });
      s.events.push({ type: 'smoke', x: p.x1, y: p.y1 });
    } else hearNoise(s, p.x1, p.y1, undefined, { decoy: true });
  }
  for (const c of s.smokes) c.left -= dt;
  s.smokes = s.smokes.filter((c) => c.left > 0);
  if (s.alarm.active) {
    const anySee = s.guards.some((g) => g.state !== 'down' && g.seeing);
    if (!anySee) s.alarm.timer -= dt;
    if (s.alarm.timer <= 0) clearAlarm(s);
  }
  if (s.aborted && s.squad.every((u) => u.alive && inLZ(s, u))) endGame(s, 'win');
}
