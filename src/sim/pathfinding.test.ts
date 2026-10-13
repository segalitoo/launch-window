import { describe, expect, test } from 'vitest';
import { PATH_CLEARANCE } from './constants';
import { createGrid, fillRect, walkable } from './grid';
import { buildMission } from './map';
import { center, tileOf } from './math';
import { clearWalk, findPath, moveAlong, nearestWalkable, pathTo } from './pathfinding';
import type { Grid, Vec } from './types';

const open = (cols = 10, rows = 10): Grid => createGrid(cols, rows);

describe('findPath (A*)', () => {
  test('start equals goal gives an empty path', () => {
    expect(findPath(open(), 2, 2, 2, 2)).toEqual([]);
  });

  test('straight and diagonal moves on an open grid', () => {
    expect(findPath(open(), 0, 0, 3, 0)).toHaveLength(3);
    expect(findPath(open(), 0, 0, 3, 3)).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ]);
  });

  test('returns null when the goal is walled off', () => {
    const g = open();
    fillRect(g, 4, 0, 4, 9, '#');
    expect(findPath(g, 0, 0, 8, 8)).toBeNull();
  });

  test('never cuts a corner', () => {
    const g = open();
    g.cells[0 * 10 + 1] = '#'; // (1, 0)
    const p = findPath(g, 0, 0, 1, 1)!;
    // a diagonal from (0,0) to (1,1) would clip the wall at (1,0), and (0,1) is free,
    // but no-corner-cutting forbids the diagonal when either side is blocked
    expect(p).toEqual([
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
  });

  test('walks around a wall', () => {
    const g = open();
    fillRect(g, 5, 0, 5, 8, '#');
    const p = findPath(g, 2, 2, 8, 2)!;
    expect(p).not.toBeNull();
    for (const t of p) expect(walkable(g, t.x, t.y)).toBe(true);
    expect(p.some((t) => t.y === 9)).toBe(true);
  });
});

describe('pathTo (world points, smoothing)', () => {
  const s = buildMission();
  const g = s.grid;

  test('returns null when there is no route', () => {
    const t = open();
    fillRect(t, 4, 0, 4, 9, '#');
    expect(pathTo(t, center(1, 1), 8.5, 8.5)).toBeNull();
  });

  test('ends on the exact clicked point on an open tile', () => {
    const p = pathTo(g, center(4, 24), 8.3, 24.7)!;
    expect(p.at(-1)).toEqual({ x: 8.3, y: 24.7 });
  });

  test('a goal on a blocked tile goes to the nearest walkable tile', () => {
    const p = pathTo(g, center(4, 24), 23.5, 15.5)!; // a crate
    const end = p.at(-1)!;
    expect(walkable(g, tileOf(end.x), tileOf(end.y))).toBe(true);
  });

  test('a unit walks around the yard walls without touching a blocked tile', () => {
    const from = center(4, 24);
    const p = pathTo(g, from, 17.5, 25.5)!; // inside the generator yard, reached through the east gap
    expect(p.length).toBeGreaterThan(1);
    let prev: Vec = from;
    for (const q of p) {
      expect(clearWalk(g, prev, q)).toBe(true);
      prev = q;
    }
  });

  test('smoothing keeps clearance from walls', () => {
    const from = center(4, 24);
    const p = pathTo(g, from, 30.5, 24.5)!;
    let prev: Vec = from;
    for (const q of p) {
      const n = 40;
      for (let i = 0; i <= n; i++) {
        const x = prev.x + ((q.x - prev.x) * i) / n;
        const y = prev.y + ((q.y - prev.y) * i) / n;
        for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          expect(walkable(g, tileOf(x + ox * PATH_CLEARANCE), tileOf(y + oy * PATH_CLEARANCE))).toBe(true);
        }
      }
      prev = q;
    }
  });

  test('nearestWalkable searches outward ring by ring', () => {
    expect(nearestWalkable(g, 15, 23)).not.toBeNull();
    const t = open(20, 20);
    fillRect(t, 0, 0, 19, 19, '#');
    expect(nearestWalkable(t, 10, 10)).toBeNull();
  });
});

describe('moveAlong', () => {
  test('moves speed * dt along the path and drops reached points', () => {
    const e = { x: 0.5, y: 0.5, path: [{ x: 2.5, y: 0.5 }, { x: 2.5, y: 3.5 }] };
    const a = moveAlong(e, 1, 3);
    expect(e.x).toBeCloseTo(2.5);
    expect(e.y).toBeCloseTo(1.5);
    expect(e.path).toHaveLength(1);
    expect(a).toBeCloseTo(Math.PI / 2);
  });

  test('returns null when there is no path', () => {
    expect(moveAlong({ x: 0, y: 0, path: [] }, 1, 3)).toBeNull();
  });
});
