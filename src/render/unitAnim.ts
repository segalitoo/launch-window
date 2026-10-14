// Which frame a rendered unit shows. Pure, no Phaser, so it is tested in Node.
// Animations come from tools/blender/render_unit.py.

import { HIT_FLASH } from '@/sim';

/** Ground covered by one cycle (two steps), in tiles. Matches the strides in
 *  render_unit.py, so the feet do not slide. The sim's normal move is a run
 *  (Yoav 3.5 tiles/s); moving with a body is a drag. */
export const CYCLE_TILES = { run: 1.6, drag: 0.85, crawl: 0.7 } as const;

/** One-shot lengths in seconds of sim time. The sim makes takedowns and grabs instant,
 *  so these play over the moment without holding the unit. */
export const ONE_SHOT = { takedown: 0.5, grab: 0.35, death: 0.7 } as const;

/** Direction index 0..7 for a sim angle: d * 45 degrees, 0 = sim +x. */
export const dirOf = (ang: number): number => ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;

export interface AnimState {
  ang: number;
  alive: boolean;
  crawl: boolean;
  /** Following a path. A paused game keeps this true, so the pose freezes mid-stride. */
  moving: boolean;
  carrying: boolean;
  /** Tiles walked in total; drives the cycles. */
  walked: number;
  /** Sim time now, and when each one-shot started (null = not started). */
  t: number;
  diedAt: number | null;
  takedownAt: number | null;
  grabAt: number | null;
  /** Seconds left of the hit flash (Unit.hitT). */
  hitT: number;
}

export function frameName(s: AnimState, anims: Readonly<Record<string, number>>): string {
  const d = dirOf(s.ang);
  const n = (anim: string): number => anims[anim] ?? 1;
  const name = (anim: string, f: number): string => `${anim}_d${d}_f${f}`;
  /** Frame of a one-shot that started at `at`, holding the last frame at the end. */
  const shot = (anim: keyof typeof ONE_SHOT, at: number): string =>
    name(anim, Math.min(n(anim) - 1, Math.floor(((s.t - at) / ONE_SHOT[anim]) * n(anim))));
  const active = (anim: keyof typeof ONE_SHOT, at: number | null): at is number =>
    at !== null && s.t - at >= 0 && s.t - at < ONE_SHOT[anim];
  const cycle = (anim: keyof typeof CYCLE_TILES): string =>
    name(anim, Math.floor((s.walked / CYCLE_TILES[anim]) * n(anim)) % n(anim));

  if (!s.alive) return s.diedAt === null ? name('death', n('death') - 1) : shot('death', s.diedAt);
  if (active('takedown', s.takedownAt)) return shot('takedown', s.takedownAt);
  if (active('grab', s.grabAt)) return shot('grab', s.grabAt);
  if (s.hitT > 0) return name('hit', Math.min(n('hit') - 1, Math.floor((1 - s.hitT / HIT_FLASH) * n('hit'))));
  if (s.crawl) return s.moving ? cycle('crawl') : name('crawl_idle', 0);
  if (s.moving) return cycle(s.carrying ? 'drag' : 'run');
  return name('idle', 0);
}
