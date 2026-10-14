import { describe, expect, test } from 'vitest';
import { HIT_FLASH } from '@/sim';
import {
  type AnimState,
  CYCLE_TILES,
  dirOf,
  draggedFrameName,
  frameName,
  type GuardAnimState,
  guardFrameName,
  ONE_SHOT,
  TAKEDOWN_IMPACT,
} from './unitAnim';

const anims = { idle: 1, walk: 8, run: 8, crawl_idle: 1, crawl: 8, takedown: 6, grab: 4, drag: 8, death: 6, hit: 3 };
const D = Math.PI / 180;
const base: AnimState = {
  ang: 0,
  alive: true,
  crawl: false,
  moving: false,
  carrying: false,
  walked: 0,
  t: 10,
  diedAt: null,
  takedownAt: null,
  grabAt: null,
  hitT: 0,
};
const f = (s: Partial<AnimState>): string => frameName({ ...base, ...s }, anims);

describe('unit animation frames', () => {
  test('sim angles map to the 8 rendered directions', () => {
    expect([0, 45, 90, 135, 180, 225, 270, 315].map((a) => dirOf(a * D))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(dirOf(-90 * D)).toBe(6); // atan2 gives negative angles for sim -y
    expect(dirOf(-180 * D)).toBe(4);
    expect(dirOf(20 * D)).toBe(0); // nearest direction
    expect(dirOf(25 * D)).toBe(1);
  });

  test('standing shows idle in the facing direction', () => {
    expect(f({ ang: 90 * D, walked: 3.3 })).toBe('idle_d2_f0');
  });

  test('moving runs, with a body drags, crawling crawls', () => {
    expect(f({ moving: true })).toBe('run_d0_f0');
    expect(f({ moving: true, carrying: true })).toBe('drag_d4_f0'); // backwards, facing the body
    expect(f({ carrying: true })).toBe('drag_d4_f0'); // holding the body, standing
    expect(f({ moving: true, crawl: true })).toBe('crawl_d0_f0');
    expect(f({ crawl: true })).toBe('crawl_idle_d0_f0');
  });

  test('one cycle of ground plays every frame once, so the feet do not slide', () => {
    const step = CYCLE_TILES.run / 8;
    const seen = Array.from({ length: 8 }, (_, i) => f({ moving: true, walked: (i + 0.5) * step }));
    expect(seen).toEqual(Array.from({ length: 8 }, (_, i) => `run_d0_f${i}`));
    expect(f({ moving: true, walked: CYCLE_TILES.run + 0.5 * step })).toBe('run_d0_f0');
  });

  test('a takedown plays once over its length, then normal frames return', () => {
    expect(f({ takedownAt: 10 })).toBe('takedown_d0_f0');
    expect(f({ takedownAt: 10 - ONE_SHOT.takedown * 0.99 })).toBe('takedown_d0_f5');
    expect(f({ takedownAt: 10 - ONE_SHOT.takedown - 0.01 })).toBe('idle_d0_f0');
    expect(f({ takedownAt: 10 - ONE_SHOT.takedown * 0.5, moving: true })).toBe('takedown_d0_f3'); // wins over the run
  });

  test('death plays through and holds its last frame', () => {
    expect(f({ alive: false, diedAt: 10 })).toBe('death_d0_f0');
    expect(f({ alive: false, diedAt: 0 })).toBe('death_d0_f5');
    expect(f({ alive: false })).toBe('death_d0_f5'); // already dead when first seen
  });

  test('a hit flinches over the hit flash', () => {
    expect(f({ hitT: HIT_FLASH })).toBe('hit_d0_f0');
    expect(f({ hitT: HIT_FLASH * 0.1 })).toBe('hit_d0_f2');
  });

  test('a grab plays while picking up, then the drag takes over', () => {
    expect(f({ grabAt: 10, carrying: true })).toBe('grab_d0_f0'); // still facing the body he reached
    expect(f({ grabAt: 10 - ONE_SHOT.grab - 0.01, carrying: true, moving: true })).toBe('drag_d4_f0');
  });
});

describe('guard animation frames', () => {
  const ga = { idle: 1, walk: 8, run: 8, death: 6 };
  const g0: GuardAnimState = { ang: 0, down: false, moving: false, running: false, walked: 0, t: 5, downAt: null };
  const g = (s: Partial<GuardAnimState>): string => guardFrameName({ ...g0, ...s }, ga);

  test('posted guards idle, patrols walk, investigating and combat run', () => {
    expect(g({ ang: Math.PI })).toBe('idle_d4_f0');
    expect(g({ moving: true, walked: CYCLE_TILES.walk / 2 + 0.01 })).toBe('walk_d0_f4');
    expect(g({ moving: true, running: true })).toBe('run_d0_f0');
  });

  test('struck from behind he stands until the blow lands, then collapses forward', () => {
    const ga2 = { ...ga, knockout: 12 };
    const k = (s: Partial<GuardAnimState>): string => guardFrameName({ ...g0, down: true, ...s }, ga2);
    expect(k({ koAt: 5 })).toBe('idle_d0_f0');
    expect(k({ koAt: 5 - TAKEDOWN_IMPACT - 0.01 })).toBe('knockout_d0_f0');
    expect(k({ koAt: 0 })).toBe('knockout_d0_f11'); // holds face down
    expect(k({ koAt: 0, onBack: true })).toBe('death_d0_f5'); // dragged and dropped: on his back
  });

  test('a guard who goes down plays the fall and stays down', () => {
    expect(g({ down: true, downAt: 5 })).toBe('death_d0_f0');
    expect(g({ down: true, downAt: 0 })).toBe('death_d0_f5');
    expect(g({ down: true })).toBe('death_d0_f5');
  });
});

describe('dragged body', () => {
  test('its head points at the dragger', () => {
    // dragger to the sim +x of the body: the render (head along -X) turns half a circle
    expect(draggedFrameName(0, 0, { dragged: 2 })).toBe('dragged_d4_f0');
    expect(draggedFrameName(Math.PI / 2, 0.6, { dragged: 2 })).toBe('dragged_d6_f1');
  });
});
