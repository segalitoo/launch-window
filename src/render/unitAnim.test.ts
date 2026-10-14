import { describe, expect, test } from 'vitest';
import { CYCLE_TILES, dirOf, frameName } from './unitAnim';

const anims = { idle: 1, walk: 8, run: 8 };
const D = Math.PI / 180;

describe('unit animation frames', () => {
  test('sim angles map to the 8 rendered directions', () => {
    expect([0, 45, 90, 135, 180, 225, 270, 315].map((a) => dirOf(a * D))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(dirOf(-90 * D)).toBe(6); // atan2 gives negative angles for sim -y
    expect(dirOf(-180 * D)).toBe(4);
    expect(dirOf(20 * D)).toBe(0); // nearest direction
    expect(dirOf(25 * D)).toBe(1);
  });

  test('standing shows idle in the facing direction', () => {
    expect(frameName(90 * D, false, false, 3.3, anims)).toBe('idle_d2_f0');
  });

  test('moving runs; dragging a body walks', () => {
    expect(frameName(0, true, false, 0, anims)).toBe('run_d0_f0');
    expect(frameName(0, true, true, 0, anims)).toBe('walk_d0_f0');
  });

  test('one cycle of ground plays every frame once, so the feet do not slide', () => {
    const step = CYCLE_TILES.run / 8;
    const seen = Array.from({ length: 8 }, (_, i) => frameName(0, true, false, (i + 0.5) * step, anims));
    expect(seen).toEqual(Array.from({ length: 8 }, (_, i) => `run_d0_f${i}`));
    expect(frameName(0, true, false, CYCLE_TILES.run + 0.5 * step, anims)).toBe('run_d0_f0');
  });
});
