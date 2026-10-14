// Which frame a rendered unit shows. Pure, no Phaser, so it is tested in Node.
// Animations come from tools/blender/render_unit.py.

import { HIT_FLASH, THROW_BUSY } from '@/sim';

/** Ground covered by one cycle, in tiles. Run and walk match the strides in
 *  render_unit.py, so the feet do not slide. The sim's normal move is a run
 *  (Yoav 3.5 tiles/s). The drag (CMU 81_08) covers only 0.6 m in its 1.8 s loop, a real
 *  heavy drag; at the sim's 1.9 tiles/s it plays about once a second and the feet slide. */
export const CYCLE_TILES = { run: 1.6, walk: 0.725, drag: 1.9, crawl: 0.7 } as const;

/** Length of the idle loop (CMU 111_28: a slow sway and breath), in seconds of sim time. */
export const IDLE_LOOP = 1.73;

/** One-shot lengths in seconds of sim time. The sim makes takedowns and grabs instant,
 *  so these play over the moment without holding the unit. */
export const ONE_SHOT = { takedown: 0.8, grab: 0.6, death: 0.75, knockout: 0.8 } as const;

/** Itai's work at a door, generator or launcher (CMU 77_08): the squat down, then the
 *  loop of both hands at the ground, in seconds of sim time. The take's loop is 0.42 s of
 *  quick small hand moves; played slower it reads as careful work, not fidgeting. */
export const WORK_IN = 0.35;
export const WORK_LOOP = 0.7;

/** Seconds into the takedown before the guard's own animation starts. The knife takedown is
 *  one hand-keyed pair (tools/blender/render_takedown.py), so both start together. */
export const TAKEDOWN_IMPACT = 0;

/** Direction index 0..7 for a sim angle: d * 45 degrees, 0 = sim +x. */
export const dirOf = (ang: number): number => ((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8;

/** Idle frame at sim time t: the breathing loop. */
const idleFrame = (t: number, n: number): number => Math.floor(((((t % IDLE_LOOP) + IDLE_LOOP) % IDLE_LOOP) / IDLE_LOOP) * n) % n;

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
  /** Seconds left of a throw (Unit.busy; only Noa's decoy throw sets it). Optional: 0. */
  busy?: number;
  /** Seconds into an interaction that has started (null or missing = not working). */
  workT?: number | null;
}

export function frameName(s: AnimState, anims: Readonly<Record<string, number>>): string {
  // with a body he walks backwards, facing it
  const d = dirOf(s.ang + (s.carrying && !(s.grabAt !== null && s.t - s.grabAt < ONE_SHOT.grab) ? Math.PI : 0));
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
  if ((s.busy ?? 0) > 0 && anims['throw']) {
    return name('throw', Math.min(n('throw') - 1, Math.floor((1 - (s.busy ?? 0) / THROW_BUSY) * n('throw'))));
  }
  if (s.workT != null && anims['work']) {
    if (s.workT < WORK_IN) return name('work_in', Math.min(n('work_in') - 1, Math.floor((s.workT / WORK_IN) * n('work_in'))));
    return name('work', Math.floor((((s.workT - WORK_IN) % WORK_LOOP) / WORK_LOOP) * n('work')) % n('work'));
  }
  if (s.crawl) return s.moving ? cycle('crawl') : name('crawl_idle', 0);
  if (s.carrying) return s.moving ? cycle('drag') : name('drag', 0);
  if (s.moving) return cycle('run');
  return name('idle', idleFrame(s.t, n('idle')));
}

export interface GuardAnimState {
  ang: number;
  down: boolean;
  moving: boolean;
  /** Investigating or in combat: those speeds (2.6 and 3.1 tiles/s) are a run. */
  running: boolean;
  walked: number;
  t: number;
  /** When he went down (null = already down when first seen). */
  downAt: number | null;
  /** When he was taken down from behind (null = shot, or not taken down): the pair with
   *  Yoav's knife takedown, lowered onto his back. */
  koAt?: number | null;
  /** Dragged and dropped: he lies on his back, as he was dragged. */
  onBack?: boolean;
}

export function guardFrameName(s: GuardAnimState, anims: Readonly<Record<string, number>>): string {
  const d = dirOf(s.ang);
  const n = (anim: string): number => anims[anim] ?? 1;
  if (s.down) {
    if (s.onBack) return `death_d${d}_f${n('death') - 1}`;
    if (s.koAt != null) {
      const k = s.t - s.koAt - TAKEDOWN_IMPACT;
      if (k < 0) return `idle_d${d}_f${idleFrame(s.t, n('idle'))}`;
      return `knockout_d${d}_f${Math.min(n('knockout') - 1, Math.floor((k / ONE_SHOT.knockout) * n('knockout')))}`;
    }
    const f = s.downAt === null ? n('death') - 1 : Math.floor(((s.t - s.downAt) / ONE_SHOT.death) * n('death'));
    return `death_d${d}_f${Math.min(n('death') - 1, f)}`;
  }
  if (!s.moving) return `idle_d${d}_f${idleFrame(s.t, n('idle'))}`;
  const anim = s.running ? 'run' : 'walk';
  return `${anim}_d${d}_f${Math.floor((s.walked / CYCLE_TILES[anim]) * n(anim)) % n(anim)}`;
}

/** Frame of a body being dragged: its head points at the dragger's hands.
 *  `towardCarrier` is the sim angle from the body to the dragger. The render's head
 *  points along -X, so the direction is turned half a circle. */
export function draggedFrameName(towardCarrier: number, walked: number, anims: Readonly<Record<string, number>>): string {
  const n = anims['dragged'] ?? 1;
  return `dragged_d${dirOf(towardCarrier - Math.PI)}_f${Math.floor(walked / 0.5) % n}`;
}
