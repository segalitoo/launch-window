import { describe, expect, test } from 'vitest';
import { depthOf, footprint, mapBounds, toScreen, toTile } from './iso';

describe('iso projection (64 x 32 tiles)', () => {
  test('follows the CLAUDE.md formula', () => {
    expect(toScreen(0, 0)).toEqual({ x: 0, y: 0 });
    expect(toScreen(1, 0)).toEqual({ x: 32, y: 16 });
    expect(toScreen(0, 1)).toEqual({ x: -32, y: 16 });
    expect(toScreen(3, 2)).toEqual({ x: 32, y: 80 });
  });

  test('height lifts a point straight up on screen', () => {
    expect(toScreen(2, 2, 10)).toEqual({ x: 0, y: 54 });
  });

  test('toTile inverts toScreen on the ground', () => {
    for (const [x, y] of [[0, 0], [12.25, 3.5], [45.9, 29.1], [7, 21]] as const) {
      const s = toScreen(x, y);
      const t = toTile(s.x, s.y);
      expect(t.x).toBeCloseTo(x, 9);
      expect(t.y).toBeCloseTo(y, 9);
    }
  });

  test('a tile is a 64 x 32 diamond', () => {
    const [back, right, front, left] = footprint(5, 5);
    expect(right.x - left.x).toBe(64);
    expect(front.y - back.y).toBe(32);
  });

  test('the whole 46 x 30 map fits its bounds', () => {
    const b = mapBounds(46, 30);
    expect(b.x).toBe(-960);
    expect(b.w).toBe(76 * 32);
    expect(b.h).toBe(76 * 16);
  });

  test('things further down-screen draw later; height breaks ties', () => {
    expect(depthOf(3, 3)).toBeGreaterThan(depthOf(2, 3));
    expect(depthOf(4, 2, 10)).toBeGreaterThan(depthOf(4, 2, 0));
  });
});
